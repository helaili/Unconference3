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

  await db.delete(rooms).where(eq(rooms.id, roomId))

  logger.info(`Room deleted: "${found.name}" (id: ${found.id}) from event ${eventId}`)
  return { success: true }
})
