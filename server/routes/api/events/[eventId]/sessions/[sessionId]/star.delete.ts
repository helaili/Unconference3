import { eq, and } from 'drizzle-orm'
import { users, sessionStars } from '~/server/database/schema'

export default defineEventHandler(async (event) => {
  const eventId = getRouterParam(event, 'eventId')
  const sessionId = getRouterParam(event, 'sessionId')

  if (!eventId || !sessionId) {
    throw createError({ statusCode: 400, statusMessage: 'Event ID and session ID are required' })
  }

  await requireEventAccess(event, eventId)

  const db = useDB()
  const userSession = await getUserSession(event)
  const user = userSession?.user

  const [dbUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, user?.email?.toLowerCase() ?? ''))
    .limit(1)

  if (!dbUser) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const [deleted] = await db
    .delete(sessionStars)
    .where(and(
      eq(sessionStars.userId, dbUser.id),
      eq(sessionStars.sessionId, sessionId),
      eq(sessionStars.eventId, eventId),
    ))
    .returning()

  if (!deleted) {
    throw createError({ statusCode: 404, statusMessage: 'Star not found' })
  }

  return { starred: false }
})
