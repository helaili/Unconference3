import { eq, and } from 'drizzle-orm'
import { rooms } from '~/server/database/schema'

const logger = useLogger('rooms')

export default defineEventHandler(async (event) => {
  const eventId = getRouterParam(event, 'eventId')
  const roomId = getRouterParam(event, 'roomId')

  if (!eventId || !roomId) {
    throw createError({ statusCode: 400, statusMessage: 'Event ID and room ID are required' })
  }

  await requireAdmin(event)

  const db = useDB()
  const [found] = await db
    .select()
    .from(rooms)
    .where(and(eq(rooms.id, roomId), eq(rooms.eventId, eventId)))
    .limit(1)

  if (!found) {
    throw createError({ statusCode: 404, statusMessage: 'Room not found' })
  }

  const body = await readBody(event)

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw createError({ statusCode: 400, statusMessage: 'Request body must be a JSON object' })
  }

  if ('name' in body) {
    if (typeof body.name !== 'string' || !body.name.trim()) {
      throw createError({ statusCode: 400, statusMessage: 'name must be a non-empty string' })
    }
  }

  if ('capacity' in body && body.capacity !== null && body.capacity !== undefined) {
    if (!Number.isInteger(body.capacity) || body.capacity < 1) {
      throw createError({ statusCode: 400, statusMessage: 'capacity must be a positive integer' })
    }
  }

  const updates: Record<string, unknown> = { updatedAt: new Date() }
  if ('name' in body) updates.name = (body.name as string).trim()
  if ('description' in body) updates.description = body.description ?? null
  if ('capacity' in body) updates.capacity = body.capacity ?? null

  const [updated] = await db
    .update(rooms)
    .set(updates)
    .where(eq(rooms.id, roomId))
    .returning()

  logger.info(`Room updated: "${updated.name}" (id: ${updated.id})`)
  return updated
})
