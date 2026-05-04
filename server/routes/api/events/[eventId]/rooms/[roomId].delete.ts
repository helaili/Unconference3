import { and, eq } from 'drizzle-orm'
import { rooms } from '~/server/database/schema'

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

  const [deleted] = await useDB()
    .delete(rooms)
    .where(and(eq(rooms.id, roomId), eq(rooms.eventId, eventId)))
    .returning()

  if (!deleted) {
    throw createError({ statusCode: 404, statusMessage: 'Room not found' })
  }

  logger.info(`Room deleted: "${deleted.name}" (id: ${deleted.id}) from event ${eventId}`)
  return { success: true }
})
