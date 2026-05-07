import { eq, and } from 'drizzle-orm'
import { rounds, slots, slotRegistrations, users } from '~/server/database/schema'

const logger = useLogger('rounds')

export default defineEventHandler(async (event) => {
  const eventId = getRouterParam(event, 'eventId')
  const roundId = getRouterParam(event, 'roundId')
  const slotId = getRouterParam(event, 'slotId')
  if (!eventId || !roundId || !slotId) {
    throw createError({ statusCode: 400, statusMessage: 'Event ID, Round ID, and Slot ID are required' })
  }

  await requireEventAccess(event, eventId)

  const session = await getUserSession(event)
  const userEmail = session?.user?.email
  if (!userEmail) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const db = useDB()

  const [round] = await db
    .select()
    .from(rounds)
    .where(and(eq(rounds.id, roundId), eq(rounds.eventId, eventId)))
    .limit(1)

  if (!round) {
    throw createError({ statusCode: 404, statusMessage: 'Round not found' })
  }

  const [slot] = await db
    .select()
    .from(slots)
    .where(and(eq(slots.id, slotId), eq(slots.roundId, roundId)))
    .limit(1)

  if (!slot) {
    throw createError({ statusCode: 404, statusMessage: 'Slot not found' })
  }

  const [dbUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, userEmail))
    .limit(1)

  if (!dbUser) {
    throw createError({ statusCode: 403, statusMessage: 'User not found' })
  }

  const existing = await db.query.slotRegistrations.findFirst({
    where: and(eq(slotRegistrations.slotId, slotId), eq(slotRegistrations.userId, dbUser.id)),
  })

  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Registration not found' })
  }

  await db
    .delete(slotRegistrations)
    .where(and(eq(slotRegistrations.slotId, slotId), eq(slotRegistrations.userId, dbUser.id)))

  logger.info(`User ${dbUser.id} cancelled registration for slot ${slotId}`)
  return { success: true }
})
