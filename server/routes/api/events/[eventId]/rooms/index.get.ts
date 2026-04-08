import { eq } from 'drizzle-orm'
import { rooms } from '~/server/database/schema'

const logger = useLogger('rooms')

export default defineEventHandler(async (event) => {
  const eventId = getRouterParam(event, 'eventId')
  if (!eventId) {
    throw createError({ statusCode: 400, statusMessage: 'Event ID is required' })
  }

  await requireEventAccess(event, eventId)

  const db = useDB()
  const list = await db
    .select()
    .from(rooms)
    .where(eq(rooms.eventId, eventId))
    .orderBy(rooms.name)

  logger.debug(`Listed ${list.length} rooms for event ${eventId}`)
  return list
})
