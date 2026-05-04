import { eq, and } from 'drizzle-orm'
import { sessions, users, events, sessionStars } from '~/server/database/schema'

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

  // Resolve the DB user
  const [dbUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, user?.email?.toLowerCase() ?? ''))
    .limit(1)

  if (!dbUser) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  // Load the session — it must be published or scheduled
  const [session] = await db
    .select({ id: sessions.id, status: sessions.status, eventId: sessions.eventId })
    .from(sessions)
    .where(and(eq(sessions.id, sessionId), eq(sessions.eventId, eventId)))
    .limit(1)

  if (!session) {
    throw createError({ statusCode: 404, statusMessage: 'Session not found' })
  }

  if (session.status !== 'published' && session.status !== 'scheduled') {
    throw createError({ statusCode: 400, statusMessage: 'Only published or scheduled sessions can be starred' })
  }

  // Load the event's max stars
  const [eventRow] = await db
    .select({ maxStars: events.maxStars })
    .from(events)
    .where(eq(events.id, eventId))
    .limit(1)

  if (!eventRow) {
    throw createError({ statusCode: 404, statusMessage: 'Event not found' })
  }

  // Perform the star atomically: check for duplicate and max budget inside a transaction
  await db.transaction(async (tx) => {
    // Lock the user's star rows for this event to prevent concurrent overwrites.
    // PostgreSQL does not allow FOR UPDATE with aggregate queries, so we select
    // actual rows and count them in JS.
    const starredRows = await tx
      .select({ sessionId: sessionStars.sessionId })
      .from(sessionStars)
      .where(and(eq(sessionStars.userId, dbUser.id), eq(sessionStars.eventId, eventId)))
      .for('update')

    if (starredRows.some(r => r.sessionId === sessionId)) {
      throw createError({ statusCode: 409, statusMessage: 'Session already starred' })
    }

    if (starredRows.length >= eventRow.maxStars) {
      throw createError({
        statusCode: 400,
        statusMessage: `You have reached the maximum of ${eventRow.maxStars} stars for this event`,
      })
    }

    await tx.insert(sessionStars).values({
      userId: dbUser.id,
      sessionId,
      eventId,
    })
  })

  return { starred: true }
})
