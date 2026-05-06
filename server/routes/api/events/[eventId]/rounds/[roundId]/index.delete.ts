import { eq, and } from 'drizzle-orm'
import { rounds } from '~/server/database/schema'

const logger = useLogger('rounds')

export default defineEventHandler(async (event) => {
  const eventId = getRouterParam(event, 'eventId')
  const roundId = getRouterParam(event, 'roundId')
  if (!eventId || !roundId) {
    throw createError({ statusCode: 400, statusMessage: 'Event ID and Round ID are required' })
  }

  await requireAdmin(event)

  const db = useDB()

  const [existing] = await db
    .select()
    .from(rounds)
    .where(and(eq(rounds.id, roundId), eq(rounds.eventId, eventId)))
    .limit(1)

  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Round not found' })
  }

  await db.delete(rounds).where(eq(rounds.id, roundId))

  logger.info(`Round deleted: ${roundId}`)
  return { success: true }
})
