import { and, eq } from 'drizzle-orm'
import { rooms } from '~/server/database/schema'

export default defineEventHandler(async (event) => {
  const eventId = getRouterParam(event, 'eventId')
  const roomId = getRouterParam(event, 'roomId')

  if (!eventId) {
    throw createError({ statusCode: 400, statusMessage: 'Event ID is required' })
  }
  if (!roomId) {
    throw createError({ statusCode: 400, statusMessage: 'Room ID is required' })
  }

  await requireEventAccess(event, eventId)

  const [room] = await useDB()
    .select()
    .from(rooms)
    .where(and(eq(rooms.id, roomId), eq(rooms.eventId, eventId)))
    .limit(1)

  if (!room) {
    throw createError({ statusCode: 404, statusMessage: 'Room not found' })
  }

  return room
})
