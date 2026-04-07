import { eq, and } from 'drizzle-orm'
import { sessions } from '~/server/database/schema'
import type { SessionStatus } from '~/server/database/schema'

const VALID_STATUSES: SessionStatus[] = ['proposed', 'published', 'scheduled', 'delivered']

const logger = useLogger('sessions')

export default defineEventHandler(async (event) => {
  const eventId = getRouterParam(event, 'eventId')
  const sessionId = getRouterParam(event, 'sessionId')

  if (!eventId || !sessionId) {
    throw createError({ statusCode: 400, statusMessage: 'Event ID and session ID are required' })
  }

  // Ensures 401 for unauthenticated and 403 for non-members before any DB work
  await requireEventAccess(event, eventId)

  const db = useDB()
  const [found] = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.id, sessionId), eq(sessions.eventId, eventId)))

  if (!found) {
    throw createError({ statusCode: 404, statusMessage: 'Session not found' })
  }

  const body = await readBody(event)

  // Guard against null / non-object bodies
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw createError({ statusCode: 400, statusMessage: 'Request body must be a JSON object' })
  }

  // Validate inputs before checking permissions (avoid info-leakage about perms)
  if ('title' in body) {
    if (typeof body.title !== 'string' || !body.title.trim()) {
      throw createError({ statusCode: 400, statusMessage: 'title must be a non-empty string' })
    }
  }

  if ('status' in body) {
    if (typeof body.status !== 'string' || !VALID_STATUSES.includes(body.status as SessionStatus)) {
      throw createError({ statusCode: 400, statusMessage: `status must be one of: ${VALID_STATUSES.join(', ')}` })
    }
  }

  if ('tags' in body && !Array.isArray(body.tags)) {
    throw createError({ statusCode: 400, statusMessage: 'tags must be an array of strings' })
  }

  const perms = await getSessionEditPermissions(event, eventId, found)
  if (!perms.canEdit) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden: you cannot edit this session' })
  }

  if ('status' in body && !perms.canChangeStatus) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden: participants cannot change session status' })
  }

  const updates: Record<string, unknown> = { updatedAt: new Date() }
  if ('title' in body) updates.title = (body.title as string).trim()
  if ('description' in body) updates.description = body.description
  if ('tags' in body) updates.tags = body.tags
  if ('status' in body) updates.status = body.status

  const [updated] = await db
    .update(sessions)
    .set(updates)
    .where(eq(sessions.id, sessionId))
    .returning()

  logger.info(`Session updated: "${updated.title}" (id: ${updated.id})`)
  return updated
})
