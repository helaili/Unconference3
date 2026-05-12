import { eq, and, sql } from 'drizzle-orm'
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

  const newStatus = (body.status as 'draft' | 'assigned' | 'open' | 'closed' | undefined) ?? existing.status
  const isClosing = newStatus === 'closed'

  const updated = await db.transaction(async (tx) => {
    // Lock the round row to prevent concurrent races during status transitions
    const [locked] = await tx
      .select({ status: rounds.status })
      .from(rounds)
      .where(and(eq(rounds.id, roundId), eq(rounds.eventId, eventId)))
      .for('update')
      .limit(1)

    if (!locked) {
      throw createError({ statusCode: 404, statusMessage: 'Round not found' })
    }

    // On transition to 'closed', remove stars for every (participant, session) pair
    // where the participant is registered in a slot of this round
    if (isClosing && locked.status !== 'closed') {
      await tx.execute(sql`
        DELETE FROM session_stars
        WHERE (user_id, session_id) IN (
          SELECT sr.user_id, s.session_id
          FROM slot_registrations sr
          JOIN slots s ON sr.slot_id = s.id
          WHERE s.round_id = ${roundId}::uuid
            AND s.session_id IS NOT NULL
        )
      `)
      logger.info(`Stars deducted for closed round: ${roundId}`)
    }

    const [u] = await tx
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
        status: newStatus,
        updatedAt: new Date(),
      })
      .where(and(eq(rounds.id, roundId), eq(rounds.eventId, eventId)))
      .returning()

    return u
  })

  logger.info(`Round updated: ${roundId}`)
  return updated
})
