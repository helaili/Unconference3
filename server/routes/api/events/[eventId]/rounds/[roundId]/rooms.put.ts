import { eq, and, inArray } from 'drizzle-orm'
import { rounds, rooms, roundRooms } from '~/server/database/schema'

const logger = useLogger('rounds')

export default defineEventHandler(async (event) => {
  const eventId = getRouterParam(event, 'eventId')
  const roundId = getRouterParam(event, 'roundId')
  if (!eventId || !roundId) {
    throw createError({ statusCode: 400, statusMessage: 'Event ID and Round ID are required' })
  }

  await requireAdmin(event)

  const db = useDB()

  const [round] = await db
    .select()
    .from(rounds)
    .where(and(eq(rounds.id, roundId), eq(rounds.eventId, eventId)))
    .limit(1)

  if (!round) {
    throw createError({ statusCode: 404, statusMessage: 'Round not found' })
  }

  const body = await readBody<{ roomIds: string[] }>(event)

  if (!Array.isArray(body.roomIds)) {
    throw createError({ statusCode: 400, statusMessage: 'roomIds must be an array' })
  }

  if (body.roomIds.length > 0) {
    // Verify all supplied room IDs belong to this event
    const validRooms = await db
      .select({ id: rooms.id })
      .from(rooms)
      .where(and(eq(rooms.eventId, eventId), inArray(rooms.id, body.roomIds)))

    const validIds = new Set(validRooms.map((r) => r.id))
    const invalid = body.roomIds.find((id) => !validIds.has(id))
    if (invalid) {
      throw createError({ statusCode: 400, statusMessage: `Room ${invalid} does not belong to this event` })
    }
  }

  // Replace the round's enabled rooms atomically
  await db.delete(roundRooms).where(eq(roundRooms.roundId, roundId))
  if (body.roomIds.length > 0) {
    await db.insert(roundRooms).values(body.roomIds.map((roomId) => ({ roundId, roomId })))
  }

  const enabled = await db
    .select({ room: rooms })
    .from(roundRooms)
    .innerJoin(rooms, eq(roundRooms.roomId, rooms.id))
    .where(eq(roundRooms.roundId, roundId))

  logger.info(`Round ${roundId} rooms updated: ${body.roomIds.length} rooms enabled`)
  return enabled.map((r) => r.room)
})
