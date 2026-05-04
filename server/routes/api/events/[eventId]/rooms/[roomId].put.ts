import { and, eq } from 'drizzle-orm'
import { rooms } from '~/server/database/schema'
import type { RoomType } from '~/server/database/schema'

const logger = useLogger('rooms')

export default defineEventHandler(async (event) => {
  const eventId = getRouterParam(event, 'eventId')
  const roomId = getRouterParam(event, 'roomId')

  if (!eventId) {
    throw createError({ statusCode: 400, statusMessage: 'Event ID is required' })
  }
  if (!roomId) {
    throw createError({ statusCode: 400, statusMessage: 'Room ID is required' })
  }

  await requireAdmin(event)

  const [existing] = await useDB()
    .select()
    .from(rooms)
    .where(and(eq(rooms.id, roomId), eq(rooms.eventId, eventId)))
    .limit(1)

  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Room not found' })
  }

  const body = await readBody<{
    name?: string
    description?: string
    maxCapacity?: number
    type?: RoomType
  }>(event)

  if (body.name !== undefined && !body.name.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'name cannot be empty' })
  }

  if (body.maxCapacity !== undefined) {
    if (typeof body.maxCapacity !== 'number' || !Number.isInteger(body.maxCapacity) || body.maxCapacity < 1) {
      throw createError({ statusCode: 400, statusMessage: 'maxCapacity must be a positive integer' })
    }
  }

  if (body.type !== undefined && !['workshop', 'meeting', 'both'].includes(body.type)) {
    throw createError({ statusCode: 400, statusMessage: 'type must be one of: workshop, meeting, both' })
  }

  const [updated] = await useDB()
    .update(rooms)
    .set({
      ...(body.name !== undefined ? { name: body.name.trim() } : {}),
      ...(body.description !== undefined ? { description: body.description } : {}),
      ...(body.maxCapacity !== undefined ? { maxCapacity: body.maxCapacity } : {}),
      ...(body.type !== undefined ? { type: body.type } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(rooms.id, roomId), eq(rooms.eventId, eventId)))
    .returning()

  logger.info(`Room updated: "${updated.name}" (id: ${updated.id}) in event ${eventId}`)
  return updated
})
