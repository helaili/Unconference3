import { eq, and, inArray, isNotNull } from 'drizzle-orm'
import { rounds, slots, sessions } from '~/server/database/schema'

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

  const body = await readBody<{
    name?: string
    duration?: number
    startTime?: string | null
    minParticipants?: number
    breakDuration?: number
    status?: string
  }>(event)

  if (
    body.duration !== undefined &&
    (typeof body.duration !== 'number' || !Number.isInteger(body.duration) || body.duration < 1)
  ) {
    throw createError({ statusCode: 400, statusMessage: 'duration must be a positive integer (minutes)' })
  }

  if (
    body.minParticipants !== undefined &&
    (typeof body.minParticipants !== 'number' ||
      !Number.isInteger(body.minParticipants) ||
      body.minParticipants < 0)
  ) {
    throw createError({ statusCode: 400, statusMessage: 'minParticipants must be a non-negative integer' })
  }

  if (
    body.breakDuration !== undefined &&
    (typeof body.breakDuration !== 'number' ||
      !Number.isInteger(body.breakDuration) ||
      body.breakDuration < 0)
  ) {
    throw createError({ statusCode: 400, statusMessage: 'breakDuration must be a non-negative integer' })
  }

  if (body.status && !['draft', 'assigned', 'open', 'closed'].includes(body.status)) {
    throw createError({ statusCode: 400, statusMessage: 'status must be one of: draft, assigned, open, closed' })
  }

  const [updated] = await db
    .update(rounds)
    .set({
      name: body.name !== undefined ? (body.name?.trim() || null) : existing.name,
      duration: body.duration ?? existing.duration,
      startTime:
        body.startTime !== undefined
          ? body.startTime
            ? new Date(body.startTime)
            : null
          : existing.startTime,
      minParticipants: body.minParticipants ?? existing.minParticipants,
      breakDuration: body.breakDuration ?? existing.breakDuration,
      status: (body.status as 'draft' | 'assigned' | 'open' | 'closed' | undefined) ?? existing.status,
      updatedAt: new Date(),
    })
    .where(and(eq(rounds.id, roundId), eq(rounds.eventId, eventId)))
    .returning()

  const newStatus = updated.status

  if (newStatus === 'open' && existing.status !== 'open') {
    const roundSlots = await db
      .select({ sessionId: slots.sessionId })
      .from(slots)
      .where(and(eq(slots.roundId, roundId), isNotNull(slots.sessionId)))
    const sessionIds = roundSlots.map(s => s.sessionId).filter(Boolean) as string[]
    if (sessionIds.length > 0) {
      await db
        .update(sessions)
        .set({ status: 'scheduled', updatedAt: new Date() })
        .where(inArray(sessions.id, sessionIds))
    }
    logger.info(`Marked ${sessionIds.length} session(s) as scheduled for round ${roundId}`)
  } else if (newStatus === 'closed' && existing.status !== 'closed') {
    const roundSlots = await db
      .select({ sessionId: slots.sessionId })
      .from(slots)
      .where(and(eq(slots.roundId, roundId), isNotNull(slots.sessionId)))
    const sessionIds = roundSlots.map(s => s.sessionId).filter(Boolean) as string[]
    if (sessionIds.length > 0) {
      await db
        .update(sessions)
        .set({ status: 'delivered', updatedAt: new Date() })
        .where(inArray(sessions.id, sessionIds))
    }
    logger.info(`Marked ${sessionIds.length} session(s) as delivered for round ${roundId}`)
  }

  logger.info(`Round updated: ${roundId}`)
  return updated
})
