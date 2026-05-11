import { eq, and, inArray, sql } from 'drizzle-orm'
import { rounds, roundRooms, rooms, slots, sessionStars } from '~/server/database/schema'

export default defineEventHandler(async (event) => {
  const eventId = getRouterParam(event, 'eventId')
  const roundId = getRouterParam(event, 'roundId')
  if (!eventId || !roundId) {
    throw createError({ statusCode: 400, statusMessage: 'Event ID and Round ID are required' })
  }

  await requireEventAccess(event, eventId)

  const db = useDB()

  const [round] = await db
    .select()
    .from(rounds)
    .where(and(eq(rounds.id, roundId), eq(rounds.eventId, eventId)))
    .limit(1)

  if (!round) {
    throw createError({ statusCode: 404, statusMessage: 'Round not found' })
  }

  // Fetch enabled rooms
  const enabledRooms = await db
    .select({ room: rooms })
    .from(roundRooms)
    .innerJoin(rooms, eq(roundRooms.roomId, rooms.id))
    .where(eq(roundRooms.roundId, roundId))

  // Fetch slots with session info
  const roundSlots = await db.query.slots.findMany({
    where: eq(slots.roundId, roundId),
    with: { session: true, room: true, registrations: { with: { user: true } } },
    orderBy: [slots.slotIndex, slots.roomId],
  })

  // Compute star counts for sessions referenced in these slots
  const sessionIds = [...new Set(roundSlots.map((s) => s.sessionId).filter((id): id is string => id !== null))]
  const starCounts = sessionIds.length > 0
    ? await db
        .select({
          sessionId: sessionStars.sessionId,
          count: sql<number>`count(*)::int`.as('star_count'),
        })
        .from(sessionStars)
        .where(inArray(sessionStars.sessionId, sessionIds))
        .groupBy(sessionStars.sessionId)
    : []
  const starCountMap = new Map(starCounts.map((r) => [r.sessionId, r.count]))

  return {
    ...round,
    enabledRooms: enabledRooms.map((r) => r.room),
    slots: roundSlots.map((slot) => ({
      ...slot,
      session: slot.session ? { ...slot.session, starCount: starCountMap.get(slot.session.id) ?? 0 } : null,
    })),
  }
})
