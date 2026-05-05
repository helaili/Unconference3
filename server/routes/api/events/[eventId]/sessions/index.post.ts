import { eq } from 'drizzle-orm'
import { events, sessions, users } from '~/server/database/schema'
import type { SessionStatus, SessionType } from '~/server/database/schema'

const logger = useLogger('sessions')

export default defineEventHandler(async (event) => {
  const eventId = getRouterParam(event, 'eventId')
  if (!eventId) {
    throw createError({ statusCode: 400, statusMessage: 'Event ID is required' })
  }

  const db = useDB()

  // Load the event to check submissionRestricted
  const [eventRow] = await db.select().from(events).where(eq(events.id, eventId)).limit(1)
  if (!eventRow) {
    throw createError({ statusCode: 404, statusMessage: 'Event not found' })
  }

  await requireSessionSubmission(event, eventId, eventRow.submissionRestricted)

  const body = await readBody<{
    title: string
    description?: string
    tags?: string[]
    status?: SessionStatus
    type?: SessionType
  }>(event)

  if (!body.title?.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'title is required' })
  }

  if (body.tags !== undefined && !Array.isArray(body.tags)) {
    throw createError({ statusCode: 400, statusMessage: 'tags must be an array of strings' })
  }

  if (body.status && !['proposed', 'published', 'scheduled', 'delivered'].includes(body.status)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid status value' })
  }

  if (body.type !== undefined && !['discussion', 'workshop'].includes(body.type)) {
    throw createError({ statusCode: 400, statusMessage: 'type must be "discussion" or "workshop"' })
  }

  // Determine author's user ID
  const userSession = await getUserSession(event)
  const user = userSession?.user
  const [dbUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, user?.email ?? ''))
    .limit(1)

  if (!dbUser) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden: user account not found' })
  }

  // Participants can only create sessions with status "proposed"
  const isAdminUser = user
    && ((user.login && isAdmin(user.login)) || (user.email && isAdminEmail(user.email)))
  const isStaff = isAdminUser ? false : await isStaffForEvent(event, eventId)

  let initialStatus: SessionStatus = 'proposed'
  if (body.status) {
    if (!isAdminUser && !isStaff) {
      throw createError({ statusCode: 403, statusMessage: 'Forbidden: only admins and staff can set session status' })
    }
    initialStatus = body.status
  }

  // Only staff and admins can create workshop sessions
  const sessionType: SessionType = body.type ?? 'discussion'
  if (sessionType === 'workshop' && !isAdminUser && !isStaff) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden: only admins and staff can create workshop sessions' })
  }

  const [created] = await db
    .insert(sessions)
    .values({
      eventId,
      authorId: dbUser.id,
      title: body.title.trim(),
      description: body.description,
      tags: body.tags ?? [],
      status: initialStatus,
      type: sessionType,
    })
    .returning()

  logger.info(`Session created: "${created.title}" (id: ${created.id}) in event ${eventId}`)
  return created
})
