import { eq, and, inArray, sql } from 'drizzle-orm'
import { sessions, users, sessionStars } from '~/server/database/schema'
import type { SessionStatus } from '~/server/database/schema'

// Shape returned for each session (raw row + flattened author fields + star data)
type SessionRow = typeof sessions.$inferSelect & {
  authorFirstName: string | null
  authorLastName: string | null
  authorEmail: string | null
  starCount: number
  isStarred?: boolean
}

async function fetchSessions(
  db: ReturnType<typeof useDB>,
  conditions: Parameters<typeof and>,
): Promise<SessionRow[]> {
  return db
    .select({
      id: sessions.id,
      eventId: sessions.eventId,
      authorId: sessions.authorId,
      authorFirstName: users.firstName,
      authorLastName: users.lastName,
      authorEmail: users.email,
      title: sessions.title,
      description: sessions.description,
      tags: sessions.tags,
      status: sessions.status,
      createdAt: sessions.createdAt,
      updatedAt: sessions.updatedAt,
      starCount: sql<number>`(select count(*)::int from session_stars where session_stars.session_id = ${sessions.id})`,
    })
    .from(sessions)
    .leftJoin(users, eq(sessions.authorId, users.id))
    .where(and(...conditions))
    .orderBy(sessions.createdAt)
}

const logger = useLogger('sessions')

export default defineEventHandler(async (event) => {
  const eventId = getRouterParam(event, 'eventId')
  if (!eventId) {
    throw createError({ statusCode: 400, statusMessage: 'Event ID is required' })
  }

  await requireEventAccess(event, eventId)

  const db = useDB()

  // Determine if the current user is admin or staff (they see all statuses by default)
  const userSession = await getUserSession(event)
  const user = userSession?.user
  const isAdminUser = user
    && ((user.login && isAdmin(user.login)) || (user.email && isAdminEmail(user.email)))
  const isStaff = isAdminUser ? false : await isStaffForEvent(event, eventId)
  const isPrivileged = isAdminUser || isStaff

  // Resolve which statuses to include.
  // For non-privileged users, `proposed` is NEVER in the main query — own proposed
  // sessions are appended separately to prevent privacy leaks.
  const query = getQuery(event)
  let requestedStatuses: SessionStatus[] | null = null

  if (typeof query.status === 'string' && query.status) {
    requestedStatuses = query.status.split(',').filter(s =>
      ['proposed', 'published', 'scheduled', 'delivered'].includes(s),
    ) as SessionStatus[]
  }

  let skipMainQuery = false
  let statusFilter: SessionStatus[] | null

  if (isPrivileged) {
    // Admins/staff see all by default; an explicit filter is respected as-is
    statusFilter = requestedStatuses
  } else {
    // Participants may only see published/scheduled/delivered via the main query.
    // 'proposed' is ALWAYS stripped to prevent leaking other authors' drafts.
    if (requestedStatuses) {
      const allowed = requestedStatuses.filter(s => s !== 'proposed') as SessionStatus[]
      if (allowed.length === 0) {
        // User only asked for 'proposed' — skip the main query entirely;
        // own proposed sessions are appended below.
        skipMainQuery = true
        statusFilter = null
      } else {
        statusFilter = allowed
      }
    } else {
      const includeDelivered = query.includeDelivered === 'true' || query.includeDelivered === '1'
      statusFilter = includeDelivered
        ? ['published', 'scheduled', 'delivered']
        : ['published', 'scheduled']
    }
  }

  // Resolve the DB user for star data (isStarred, starred filter)
  let dbUserId: string | null = null
  if (user?.email) {
    const [dbUser] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, user.email.toLowerCase()))
      .limit(1)
    dbUserId = dbUser?.id ?? null
  }

  const rows: SessionRow[] = []

  if (!skipMainQuery) {
    const conditions: Parameters<typeof and> = [eq(sessions.eventId, eventId)]
    if (statusFilter) {
      conditions.push(inArray(sessions.status, statusFilter))
    }
    const fetched = await fetchSessions(db, conditions)
    rows.push(...fetched)
  }

  // Always append the current user's own proposed sessions (they are never exposed
  // via the main query, so this is the only path through which they are visible).
  if (!isPrivileged && dbUserId) {
    const userWantsProposed = !requestedStatuses || requestedStatuses.includes('proposed')
    if (userWantsProposed) {
      const ownProposed = await fetchSessions(db, [
        eq(sessions.eventId, eventId),
        eq(sessions.authorId, dbUserId),
        eq(sessions.status, 'proposed'),
      ])

      const existingIds = new Set(rows.map(r => r.id))
      for (const s of ownProposed) {
        if (!existingIds.has(s.id)) rows.push(s)
      }
    }
  }

  // Attach isStarred for each row using the current user's stars
  if (dbUserId) {
    const userStars = await db
      .select({ sessionId: sessionStars.sessionId })
      .from(sessionStars)
      .where(and(eq(sessionStars.userId, dbUserId), eq(sessionStars.eventId, eventId)))

    const starredIds = new Set(userStars.map(s => s.sessionId))
    for (const row of rows) {
      row.isStarred = starredIds.has(row.id)
    }
  }

  // ?starred=true — filter to only starred sessions (participants only; ignored for privileged users)
  let result = rows
  if (!isPrivileged && query.starred === 'true') {
    result = rows.filter(r => r.isStarred)
  }

  // ?sortBy=stars — sort by star count descending (admin/staff only)
  if (isPrivileged && query.sortBy === 'stars') {
    result = [...result].sort((a, b) => b.starCount - a.starCount)
  }

  logger.debug(`Listed ${result.length} sessions for event ${eventId}`)
  return result
})

