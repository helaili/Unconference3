import { eq, and, inArray, sql } from 'drizzle-orm'
import { rounds, roundRooms, rooms, sessions, sessionStars, slots, slotRegistrations } from '../database/schema'
import { useDB } from '../database'
import { buildSlotPlan, assignParticipants, roomMatchesSessionType } from './roundAlgorithm'
import type { AlgoRoom, AlgoSession, VoterRecord } from './roundAlgorithm'

/**
 * Runs the full assignment algorithm for a round:
 *  1. Calculates slots per room based on durations.
 *  2. Assigns eligible sessions to slots (biggest room → most popular; duplicates popular ones).
 *  3. Assigns starred users to sessions, respecting capacity and slotIndex conflicts.
 *  4. Persists slots and registrations to the DB.
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

  const enabledRooms: AlgoRoom[] = (
    await db
      .select({ id: rooms.id, type: rooms.type, maxCapacity: rooms.maxCapacity })
      .from(roundRooms)
      .innerJoin(rooms, eq(roundRooms.roomId, rooms.id))
      .where(eq(roundRooms.roundId, roundId))
  ) as AlgoRoom[]

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

  const eligibleSessions: AlgoSession[] = eligibleRows.map((r) => ({
    id: r.id,
    type: r.type,
    duration: r.duration,
    starCount: r.starCount,
  }))

  const workshopSessions = eligibleSessions.filter((s) => s.type === 'workshop')
  const discussionSessions = eligibleSessions.filter((s) => s.type === 'discussion')
  const workshopRooms = enabledRooms.filter((r) => roomMatchesSessionType(r.type, 'workshop'))
  const discussionRooms = enabledRooms.filter((r) => roomMatchesSessionType(r.type, 'discussion'))

  const slotPlan = [
    ...buildSlotPlan(workshopSessions, workshopRooms, round.duration, defaultWorkshopDuration),
    ...buildSlotPlan(discussionSessions, discussionRooms, round.duration, defaultDiscussionDuration),
  ]

  await db.delete(slots).where(eq(slots.roundId, roundId))

  if (slotPlan.length === 0) {
    await db.update(rounds).set({ status: 'assigned', updatedAt: new Date() }).where(eq(rounds.id, roundId))
    return
  }

  const insertedSlots = await db
    .insert(slots)
    .values(slotPlan.map((s) => ({ roundId, roomId: s.roomId, sessionId: s.sessionId, slotIndex: s.slotIndex })))
    .returning()

  const planWithIds = slotPlan.map((plan, i) => ({ ...plan, id: insertedSlots[i].id }))

  const eligibleIds = eligibleSessions.map((s) => s.id)
  const voterRows = eligibleIds.length > 0
    ? await db
        .select({ sessionId: sessionStars.sessionId, userId: sessionStars.userId })
        .from(sessionStars)
        .where(inArray(sessionStars.sessionId, eligibleIds))
        .orderBy(sessionStars.createdAt)
    : []

  const assignments = assignParticipants(planWithIds, voterRows as VoterRecord[], eligibleSessions)

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
    await db.insert(slotRegistrations).values(registrations)
  }

  await db.update(rounds).set({ status: 'assigned', updatedAt: new Date() }).where(eq(rounds.id, roundId))
}
