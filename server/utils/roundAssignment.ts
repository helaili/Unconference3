import { eq, and, inArray, sql } from 'drizzle-orm'
import { rounds, roundRooms, rooms, sessions, sessionStars, slots, slotRegistrations } from '../database/schema'
import { useDB } from '../database'
import { buildSlotPlan, assignParticipants } from './roundAlgorithm'
import type { AlgoRoom, AlgoSession, VoterRecord, SlotTiming } from './roundAlgorithm'

const logger = useLogger('rounds')

/**
 * Runs the full assignment algorithm for a round:
 *  1. Calculates slots per room based on durations.
 *  2. Assigns eligible sessions to slots (biggest room → most popular; duplicates popular ones).
 *  3. Assigns starred users to sessions, respecting capacity and slotIndex conflicts.
 *  4. Persists slots and registrations to the DB inside a transaction.
 *  5. Updates round status to 'assigned'.
 */
export async function assignRound(roundId: string): Promise<void> {
  const db = useDB()

  const [round] = await db.select().from(rounds).where(eq(rounds.id, roundId)).limit(1)
  if (!round) throw new Error(`Round ${roundId} not found`)

  const eventRow = await db.query.events.findFirst({
    where: (events) => eq(events.id, round.eventId),
    columns: { defaultDiscussionDuration: true, defaultWorkshopDuration: true },
  })
  const defaultDiscussionDuration = eventRow?.defaultDiscussionDuration ?? 30
  const defaultWorkshopDuration = eventRow?.defaultWorkshopDuration ?? 75

  const timing: SlotTiming = {
    discussionDuration: defaultDiscussionDuration,
    workshopDuration: defaultWorkshopDuration,
    breakDuration: round.breakDuration,
  }

  const enabledRooms: AlgoRoom[] = (
    await db
      .select({ id: rooms.id, type: rooms.type, maxCapacity: rooms.maxCapacity })
      .from(roundRooms)
      .innerJoin(rooms, eq(roundRooms.roomId, rooms.id))
      .where(eq(roundRooms.roundId, roundId))
  ) as AlgoRoom[]

  if (enabledRooms.length === 0) {
    logger.warn(`Round ${roundId}: no rooms enabled — assignment will produce no slots`)
  }

  const eligibleRows = await db
    .select({
      id: sessions.id,
      type: sessions.type,
      duration: sessions.duration,
      starCount: sql<number>`count(${sessionStars.sessionId})::int`.as('star_count'),
    })
    .from(sessions)
    .leftJoin(sessionStars, eq(sessionStars.sessionId, sessions.id))
    .where(
      and(
        eq(sessions.eventId, round.eventId),
        inArray(sessions.status, ['published', 'proposed']),
      ),
    )
    .groupBy(sessions.id)
    .having(sql`count(${sessionStars.sessionId}) >= ${round.minParticipants}`)
    .orderBy(sql`count(${sessionStars.sessionId}) DESC`)

  if (eligibleRows.length === 0) {
    logger.warn(`Round ${roundId}: no eligible sessions (minParticipants=${round.minParticipants}) — assignment will produce no slots`)
  }

  const eligibleSessions: AlgoSession[] = eligibleRows.map((r) => ({
    id: r.id,
    type: r.type,
    duration: r.duration,
    starCount: r.starCount,
  }))

  logger.info(`Round ${roundId}: ${eligibleSessions.length} eligible sessions, ${enabledRooms.length} enabled rooms`)

  const workshopSessions = eligibleSessions.filter((s) => s.type === 'workshop')
  const discussionSessions = eligibleSessions.filter((s) => s.type === 'discussion')

  // Build disjoint room sets for workshop and discussion calls to avoid duplicate
  // (roomId, slotIndex) pairs which would violate the slots unique constraint.
  //
  // Priority: workshop/both rooms → workshops; meeting/both rooms → discussions.
  // 'both' rooms are assigned exclusively to workshops when workshop sessions exist.
  //
  // Fallback: if a session type has sessions but no type-matched rooms, it receives
  // all enabled rooms (and the other type gets none). This prevents sessions from
  // being silently dropped when, for example, all rooms are 'meeting' type but
  // some sessions are 'workshop' type.
  const workshopOnlyRooms = enabledRooms.filter((r) => r.type === 'workshop')
  const meetingOnlyRooms = enabledRooms.filter((r) => r.type === 'meeting')
  const bothTypeRooms = enabledRooms.filter((r) => r.type === 'both')

  let workshopRooms: AlgoRoom[]
  let discussionRooms: AlgoRoom[]

  if (workshopSessions.length > 0 && discussionSessions.length > 0) {
    // Both session types present — assign disjoint room sets
    workshopRooms = [...workshopOnlyRooms, ...bothTypeRooms]
    discussionRooms = meetingOnlyRooms

    if (workshopRooms.length === 0) {
      // No workshop-compatible rooms — split meeting rooms between the two types
      const splitAt = Math.ceil(meetingOnlyRooms.length / 2)
      workshopRooms = meetingOnlyRooms.slice(0, splitAt)
      discussionRooms = meetingOnlyRooms.slice(splitAt)
      logger.warn(`Round ${roundId}: no workshop rooms available; splitting ${meetingOnlyRooms.length} meeting rooms between workshops and discussions`)
    } else if (discussionRooms.length === 0) {
      // No meeting-compatible rooms — split workshop/both rooms between the two types
      const allWorkshopCompatible = [...workshopOnlyRooms, ...bothTypeRooms]
      const splitAt = Math.ceil(allWorkshopCompatible.length / 2)
      workshopRooms = allWorkshopCompatible.slice(splitAt)
      discussionRooms = allWorkshopCompatible.slice(0, splitAt)
      logger.warn(`Round ${roundId}: no meeting rooms available; splitting ${allWorkshopCompatible.length} workshop rooms between workshops and discussions`)
    }
  } else if (workshopSessions.length > 0) {
    // Only workshop sessions — use all rooms regardless of type
    workshopRooms = enabledRooms
    discussionRooms = []
  } else {
    // Only discussion sessions (or no sessions) — use all rooms regardless of type
    workshopRooms = []
    discussionRooms = enabledRooms
  }

  logger.info(`Round ${roundId}: ${workshopSessions.length} workshop sessions → ${workshopRooms.length} rooms; ${discussionSessions.length} discussion sessions → ${discussionRooms.length} rooms`)

  const slotPlan = [
    ...buildSlotPlan(workshopSessions, workshopRooms, round.duration, defaultWorkshopDuration, round.breakDuration),
    ...buildSlotPlan(discussionSessions, discussionRooms, round.duration, defaultDiscussionDuration, round.breakDuration),
  ]

  if (slotPlan.length === 0 && eligibleSessions.length > 0) {
    logger.warn(`Round ${roundId}: eligible sessions exist but slot plan is empty — check round duration vs session durations`)
  }

  // Fetch voter data before the transaction (read-only)
  const eligibleIds = eligibleSessions.map((s) => s.id)
  const voterRows = eligibleIds.length > 0
    ? await db
        .select({ sessionId: sessionStars.sessionId, userId: sessionStars.userId })
        .from(sessionStars)
        .where(inArray(sessionStars.sessionId, eligibleIds))
        .orderBy(sessionStars.createdAt)
    : []

  await db.transaction(async (tx) => {
    await tx.delete(slots).where(eq(slots.roundId, roundId))

    if (slotPlan.length === 0) {
      await tx.update(rounds).set({ status: 'assigned', updatedAt: new Date() }).where(eq(rounds.id, roundId))
      return
    }

    const insertedSlots = await tx
      .insert(slots)
      .values(slotPlan.map((s) => ({ roundId, roomId: s.roomId, sessionId: s.sessionId, slotIndex: s.slotIndex })))
      .returning()

    // Map by (roomId, slotIndex) rather than array index to avoid relying on INSERT returning order.
    const insertedSlotMap = new Map(insertedSlots.map((s) => [`${s.roomId}|${s.slotIndex}`, s.id]))
    const planWithIds = slotPlan.map((plan) => ({
      ...plan,
      id: insertedSlotMap.get(`${plan.roomId}|${plan.slotIndex}`) ?? '',
    }))

    const assignments = assignParticipants(planWithIds, voterRows as VoterRecord[], eligibleSessions, timing)

    const slotIdMap = new Map<string, string>()
    for (const p of planWithIds) {
      if (p.sessionId) {
        slotIdMap.set(`${p.roomId}|${p.slotIndex}|${p.sessionId}`, p.id)
      }
    }

    const registrations = assignments
      .map((a) => ({ slotId: slotIdMap.get(`${a.roomId}|${a.slotIndex}|${a.sessionId}`), userId: a.userId }))
      .filter((r): r is { slotId: string; userId: string } => !!r.slotId)

    if (registrations.length > 0) {
      await tx.insert(slotRegistrations).values(registrations)
    }

    logger.info(`Round ${roundId}: assigned ${slotPlan.filter(s => s.sessionId).length} sessions across ${insertedSlots.length} slots, ${registrations.length} participant registrations`)
    await tx.update(rounds).set({ status: 'assigned', updatedAt: new Date() }).where(eq(rounds.id, roundId))
  })
}
