import { eq } from 'drizzle-orm'
import { rooms } from '~/server/database/schema'

export default defineEventHandler(async (event) => {
  const eventId = getRouterParam(event, 'eventId')
  if (!eventId) {
    throw createError({ statusCode: 400, statusMessage: 'Event ID is required' })
  }

  await requireEventAccess(event, eventId)

  return useDB().select().from(rooms).where(eq(rooms.eventId, eventId))
})
