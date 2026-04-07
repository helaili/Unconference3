import { eq, and } from 'drizzle-orm'
import { sessions, users } from '~/server/database/schema'

const logger = useLogger('sessions')

export default defineEventHandler(async (event) => {
  const eventId = getRouterParam(event, 'eventId')
  const sessionId = getRouterParam(event, 'sessionId')

  if (!eventId || !sessionId) {
    throw createError({ statusCode: 400, statusMessage: 'Event ID and session ID are required' })
  }

  const userSession = await getUserSession(event)
  const user = userSession?.user
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const db = useDB()
  const [found] = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.id, sessionId), eq(sessions.eventId, eventId)))

  if (!found) {
    throw createError({ statusCode: 404, statusMessage: 'Session not found' })
  }

  const isAdminUser = (user.login && isAdmin(user.login)) || (user.email && isAdminEmail(user.email))
  const isStaff = isAdminUser ? false : await isStaffForEvent(event, eventId)

  if (!isAdminUser && !isStaff) {
    // Check if user is the author
    const [dbUser] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, user.email ?? ''))
      .limit(1)

    if (!dbUser || dbUser.id !== found.authorId) {
      throw createError({ statusCode: 403, statusMessage: 'Forbidden: only the author, staff, or admins can delete sessions' })
    }

    // Author can only delete their own proposed session
    if (found.status !== 'proposed') {
      throw createError({ statusCode: 403, statusMessage: 'Forbidden: authors can only delete sessions with "proposed" status' })
    }
  }

  await db.delete(sessions).where(eq(sessions.id, sessionId))

  logger.info(`Session deleted: "${found.title}" (id: ${found.id}) from event ${eventId}`)
  return { success: true }
})
