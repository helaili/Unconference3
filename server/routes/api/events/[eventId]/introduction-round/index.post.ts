import { eq, and, inArray } from 'drizzle-orm'
import { events, introductionRounds, rooms } from '~/server/database/schema'

const logger = useLogger('introduction-round')

export default defineEventHandler(async (event) => {
  const eventId = getRouterParam(event, 'eventId')
  if (!eventId) {
    throw createError({ statusCode: 400, statusMessage: 'Event ID is required' })
  }

  await requireAdmin(event)

  const db = useDB()

  const [eventRow] = await db.select().from(events).where(eq(events.id, eventId)).limit(1)
  if (!eventRow) {
    throw createError({ statusCode: 404, statusMessage: 'Event not found' })
  }

  const body = await readBody<{ numSlots?: number; groupSize?: number; roomIds?: string[] }>(event)

  const numSlots = body?.numSlots
  const groupSize = body?.groupSize
  const roomIds = body?.roomIds

  if (numSlots !== undefined) {
    if (!Number.isInteger(numSlots) || numSlots < 1) {
      throw createError({ statusCode: 400, statusMessage: 'numSlots must be a positive integer' })
    }
  }
  if (groupSize !== undefined) {
    if (!Number.isInteger(groupSize) || groupSize < 1) {
      throw createError({ statusCode: 400, statusMessage: 'groupSize must be a positive integer' })
    }
  }
  if (roomIds !== undefined) {
    if (!Array.isArray(roomIds) || roomIds.some(id => typeof id !== 'string')) {
      throw createError({ statusCode: 400, statusMessage: 'roomIds must be an array of strings' })
    }
    if (roomIds.length > 0) {
      // Validate all roomIds belong to this event
      const validRooms = await db
        .select({ id: rooms.id })
        .from(rooms)
        .where(and(eq(rooms.eventId, eventId), inArray(rooms.id, roomIds)))
      if (validRooms.length !== roomIds.length) {
        throw createError({ statusCode: 400, statusMessage: 'Some room IDs are invalid for this event' })
      }
    }
  }

  const [existing] = await db
    .select()
    .from(introductionRounds)
    .where(eq(introductionRounds.eventId, eventId))
    .limit(1)

  if (existing) {
    const [updated] = await db
      .update(introductionRounds)
      .set({
        numSlots: numSlots ?? existing.numSlots,
        groupSize: groupSize ?? existing.groupSize,
        roomIds: roomIds !== undefined ? (roomIds.length > 0 ? roomIds : null) : existing.roomIds,
        updatedAt: new Date(),
      })
      .where(eq(introductionRounds.id, existing.id))
      .returning()
    logger.info(`Introduction round updated for event ${eventId}`)
    return updated
  }

  const [created] = await db
    .insert(introductionRounds)
    .values({
      eventId,
      numSlots: numSlots ?? 2,
      groupSize: groupSize ?? 10,
      roomIds: roomIds && roomIds.length > 0 ? roomIds : null,
    })
    .returning()

  logger.info(`Introduction round created for event ${eventId}`)
  return created
})
