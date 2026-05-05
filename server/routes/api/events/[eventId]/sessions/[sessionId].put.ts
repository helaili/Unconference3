import { eq, and } from 'drizzle-orm'
import { sessions } from '~/server/database/schema'
import type { SessionStatus, SessionType } from '~/server/database/schema'

const VALID_STATUSES: SessionStatus[] = ['proposed', 'published', 'scheduled', 'delivered']
const VALID_TYPES: SessionType[] = ['discussion', 'workshop']

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

  if ('type' in body) {
    if (typeof body.type !== 'string' || !VALID_TYPES.includes(body.type as SessionType)) {
      throw createError({ statusCode: 400, statusMessage: `type must be one of: ${VALID_TYPES.join(', ')}` })
    }
  }

  if ('duration' in body && body.duration !== null) {
    if (!Number.isInteger(body.duration) || (body.duration as number) < 1) {
      throw createError({ statusCode: 400, statusMessage: 'duration must be a positive integer (minutes)' })
    }
  }

  const perms = await getSessionEditPermissions(event, eventId, found)
  if (!perms.canEdit) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden: you cannot edit this session' })
  }

  if ('status' in body && !perms.canChangeStatus) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden: participants cannot change session status' })
  }

  // Only staff and admins can set type to "workshop"
  if ('type' in body && body.type === 'workshop' && !perms.isStaffOrAdmin) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden: only admins and staff can set session type to workshop' })
  }

  // Only admins can set the duration
  if ('duration' in body && !perms.isAdmin) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden: only admins can set session duration' })
  }

  const updates: Record<string, unknown> = { updatedAt: new Date() }
  if ('title' in body) updates.title = (body.title as string).trim()
  if ('description' in body) updates.description = body.description
  if ('tags' in body) updates.tags = body.tags
  if ('status' in body) updates.status = body.status
  if ('type' in body) updates.type = body.type
  if ('duration' in body) updates.duration = body.duration

  const [updated] = await db
    .update(sessions)
    .set(updates)
    .where(eq(sessions.id, sessionId))
    .returning()

  logger.info(`Session updated: "${updated.title}" (id: ${updated.id})`)
  return updated
})
