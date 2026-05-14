import { eq } from 'drizzle-orm'
import { introductionRounds } from '~/server/database/schema'

const logger = useLogger('introduction-round')

export default defineEventHandler(async (event) => {
  const eventId = getRouterParam(event, 'eventId')
  if (!eventId) {
    throw createError({ statusCode: 400, statusMessage: 'Event ID is required' })
  }

  await requireAdmin(event)

  const db = useDB()

  const [introRound] = await db
    .select()
    .from(introductionRounds)
    .where(eq(introductionRounds.eventId, eventId))
    .limit(1)

  if (!introRound) {
    throw createError({ statusCode: 404, statusMessage: 'No introduction round for this event' })
  }

  if (introRound.status === 'closed') {
    return introRound
  }

  const [updated] = await db
    .update(introductionRounds)
    .set({ status: 'closed', updatedAt: new Date() })
    .where(eq(introductionRounds.id, introRound.id))
    .returning()

  logger.info(`Introduction round closed for event ${eventId}`)
  return updated
})
