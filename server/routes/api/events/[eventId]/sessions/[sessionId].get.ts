import { eq, and } from 'drizzle-orm'
import { sessions, users } from '~/server/database/schema'

export default defineEventHandler(async (event) => {
  const eventId = getRouterParam(event, 'eventId')
  const sessionId = getRouterParam(event, 'sessionId')

  if (!eventId || !sessionId) {
    throw createError({ statusCode: 400, statusMessage: 'Event ID and session ID are required' })
  }

  await requireEventAccess(event, eventId)

  const db = useDB()
  const [found] = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.id, sessionId), eq(sessions.eventId, eventId)))

  if (!found) {
    throw createError({ statusCode: 404, statusMessage: 'Session not found' })
  }

  // Participants can only see proposed sessions they authored
  const userSession = await getUserSession(event)
  const user = userSession?.user
  const isAdminUser = user
    && ((user.login && isAdmin(user.login)) || (user.email && isAdminEmail(user.email)))
  const isStaff = isAdminUser ? false : await isStaffForEvent(event, eventId)

  if (!isAdminUser && !isStaff && found.status === 'proposed') {
    // Check if current user is the author
    const [dbUser] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, user?.email ?? ''))
      .limit(1)

    if (!dbUser || dbUser.id !== found.authorId) {
      throw createError({ statusCode: 403, statusMessage: 'Forbidden: proposed sessions are only visible to their author' })
    }
  }

  return found
})
