import { eq } from 'drizzle-orm'
import { events, rooms, rounds, roundRooms } from '~/server/database/schema'

const logger = useLogger('rounds')

export default defineEventHandler(async (event) => {
  const eventId = getRouterParam(event, 'eventId')
  if (!eventId) {
    throw createError({ statusCode: 400, statusMessage: 'Event ID is required' })
  }

  await requireAdmin(event)

  const [eventRow] = await useDB().select().from(events).where(eq(events.id, eventId)).limit(1)
  if (!eventRow) {
    throw createError({ statusCode: 404, statusMessage: 'Event not found' })
  }

  const body = await readBody<{
    name?: string
    duration?: number
    startTime?: string
    minParticipants?: number
    breakDuration?: number
  }>(event)

  if (body.duration === undefined || body.duration === null) {
    throw createError({ statusCode: 400, statusMessage: 'duration is required' })
  }
  if (typeof body.duration !== 'number' || !Number.isInteger(body.duration) || body.duration < 1) {
    throw createError({ statusCode: 400, statusMessage: 'duration must be a positive integer (minutes)' })
  }
  if (
    body.minParticipants !== undefined &&
    (typeof body.minParticipants !== 'number' ||
      !Number.isInteger(body.minParticipants) ||
      body.minParticipants < 1)
  ) {
    throw createError({ statusCode: 400, statusMessage: 'minParticipants must be a positive integer' })
  }

  if (
    body.breakDuration !== undefined &&
    (typeof body.breakDuration !== 'number' ||
      !Number.isInteger(body.breakDuration) ||
      body.breakDuration < 0)
  ) {
    throw createError({ statusCode: 400, statusMessage: 'breakDuration must be a non-negative integer' })
  }

  const db = useDB()

  const [created] = await db
    .insert(rounds)
    .values({
      eventId,
      name: body.name?.trim() || null,
      duration: body.duration,
      startTime: body.startTime ? new Date(body.startTime) : null,
      minParticipants: body.minParticipants ?? 1,
      breakDuration: body.breakDuration ?? 15,
    })
    .returning()

  // Enable all event rooms by default
  const eventRooms = await db.select({ id: rooms.id }).from(rooms).where(eq(rooms.eventId, eventId))
  if (eventRooms.length > 0) {
    await db.insert(roundRooms).values(eventRooms.map((r) => ({ roundId: created.id, roomId: r.id })))
  }

  logger.info(`Round created: "${created.name ?? created.id}" in event ${eventId}`)
  return created
})
