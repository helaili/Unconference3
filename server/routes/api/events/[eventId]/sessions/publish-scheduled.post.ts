import { eq, and } from 'drizzle-orm'
import { sessions } from '~/server/database/schema'

const logger = useLogger('sessions')

export default defineEventHandler(async (event) => {
  const eventId = getRouterParam(event, 'eventId')
  if (!eventId) {
    throw createError({ statusCode: 400, statusMessage: 'Event ID is required' })
  }

  await requireAdmin(event)

  const db = useDB()

  const result = await db
    .update(sessions)
    .set({ status: 'published', updatedAt: new Date() })
    .where(and(eq(sessions.eventId, eventId), eq(sessions.status, 'scheduled')))
    .returning({ id: sessions.id })

  logger.info(`Published ${result.length} scheduled sessions for event ${eventId}`)
  return { published: result.length }
})
