import { eq } from 'drizzle-orm'
import { events, introductionRounds } from '~/server/database/schema'

const logger = useLogger('introduction-round')

export default defineEventHandler(async (event) => {
  const eventId = getRouterParam(event, 'eventId')
  if (!eventId) {
    throw createError({ statusCode: 400, statusMessage: 'Event ID is required' })
  }

  await requireAdmin(event)

  const db = useDB()

  const [eventRow] = await db.select().from(events).where(eq(events.id, eventId)).limit(1)
  if (!eventRow) {
    throw createError({ statusCode: 404, statusMessage: 'Event not found' })
  }

  const body = await readBody<{ numSlots?: number; groupSize?: number }>(event)

  const numSlots = body?.numSlots
  const groupSize = body?.groupSize

  if (numSlots !== undefined) {
    if (!Number.isInteger(numSlots) || numSlots < 1) {
      throw createError({ statusCode: 400, statusMessage: 'numSlots must be a positive integer' })
    }
  }
  if (groupSize !== undefined) {
    if (!Number.isInteger(groupSize) || groupSize < 1) {
      throw createError({ statusCode: 400, statusMessage: 'groupSize must be a positive integer' })
    }
  }

  const [existing] = await db
    .select()
    .from(introductionRounds)
    .where(eq(introductionRounds.eventId, eventId))
    .limit(1)

  if (existing) {
    if (existing.status !== 'draft') {
      throw createError({
        statusCode: 409,
        statusMessage: 'Cannot edit settings while round is open or closed. Close the round first.',
      })
    }
    const [updated] = await db
      .update(introductionRounds)
      .set({
        numSlots: numSlots ?? existing.numSlots,
        groupSize: groupSize ?? existing.groupSize,
        updatedAt: new Date(),
      })
      .where(eq(introductionRounds.id, existing.id))
      .returning()
    logger.info(`Introduction round updated for event ${eventId}`)
    return updated
  }

  const [created] = await db
    .insert(introductionRounds)
    .values({
      eventId,
      numSlots: numSlots ?? 2,
      groupSize: groupSize ?? 10,
    })
    .returning()

  logger.info(`Introduction round created for event ${eventId}`)
  return created
})
