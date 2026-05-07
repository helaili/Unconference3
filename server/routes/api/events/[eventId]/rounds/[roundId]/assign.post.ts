import { eq, and } from 'drizzle-orm'
import { rounds } from '~/server/database/schema'
import { assignRound } from '~/server/utils/roundAssignment'

const logger = useLogger('rounds')

export default defineEventHandler(async (event) => {
  const eventId = getRouterParam(event, 'eventId')
  const roundId = getRouterParam(event, 'roundId')
  if (!eventId || !roundId) {
    throw createError({ statusCode: 400, statusMessage: 'Event ID and Round ID are required' })
  }

  await requireAdmin(event)

  const db = useDB()

  const [round] = await db
    .select()
    .from(rounds)
    .where(and(eq(rounds.id, roundId), eq(rounds.eventId, eventId)))
    .limit(1)

  if (!round) {
    throw createError({ statusCode: 404, statusMessage: 'Round not found' })
  }

  logger.info(`Starting assignment for round ${roundId}`)
  await assignRound(roundId)
  logger.info(`Assignment complete for round ${roundId}`)

  const [updated] = await db.select().from(rounds).where(eq(rounds.id, roundId)).limit(1)
  return updated
})
