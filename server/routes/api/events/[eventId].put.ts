import { eq } from 'drizzle-orm'
import { events } from '~/server/database/schema'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const id = getRouterParam(event, 'eventId')!
  const db = useDB()

  const body = await readBody<{
    name?: string
    description?: string
    date?: string
    submissionRestricted?: boolean
    minStars?: number
    maxStars?: number
  }>(event)

  const updates: Record<string, unknown> = { updatedAt: new Date() }

  if (body.name !== undefined) updates.name = body.name
  if (body.description !== undefined) updates.description = body.description
  if (body.date !== undefined) updates.date = body.date ? new Date(body.date) : null
  if (body.submissionRestricted !== undefined) updates.submissionRestricted = body.submissionRestricted
  if (body.minStars !== undefined) {
    if (!Number.isInteger(body.minStars) || body.minStars < 0) {
      throw createError({ statusCode: 400, statusMessage: 'minStars must be a non-negative integer' })
    }
    updates.minStars = body.minStars
  }
  if (body.maxStars !== undefined) {
    if (!Number.isInteger(body.maxStars) || body.maxStars < 1) {
      throw createError({ statusCode: 400, statusMessage: 'maxStars must be a positive integer' })
    }
    updates.maxStars = body.maxStars
  }

  // Validate min <= max using the merged (incoming + existing) values
  if (updates.minStars !== undefined || updates.maxStars !== undefined) {
    const [current] = await db
      .select({ minStars: events.minStars, maxStars: events.maxStars })
      .from(events)
      .where(eq(events.id, id))
      .limit(1)

    if (!current) {
      throw createError({ statusCode: 404, statusMessage: 'Event not found' })
    }

    const effectiveMin = (updates.minStars ?? current.minStars) as number
    const effectiveMax = (updates.maxStars ?? current.maxStars) as number

    if (effectiveMin > effectiveMax) {
      throw createError({ statusCode: 400, statusMessage: 'minStars cannot exceed maxStars' })
    }
  }

  const [updated] = await db
    .update(events)
    .set(updates)
    .where(eq(events.id, id))
    .returning()

  if (!updated) {
    throw createError({ statusCode: 404, statusMessage: 'Event not found' })
  }

  return updated
})
