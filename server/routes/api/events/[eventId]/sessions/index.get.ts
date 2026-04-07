import { eq, and, inArray } from 'drizzle-orm'
import { sessions, users } from '~/server/database/schema'
import type { SessionStatus } from '~/server/database/schema'

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

  const rows: Array<typeof sessions.$inferSelect> = []

  if (!skipMainQuery) {
    const conditions = [eq(sessions.eventId, eventId)]
    if (statusFilter) {
      conditions.push(inArray(sessions.status, statusFilter))
    }
    const fetched = await db
      .select()
      .from(sessions)
      .where(and(...conditions))
      .orderBy(sessions.createdAt)
    rows.push(...fetched)
  }

  // Always append the current user's own proposed sessions (they are never exposed
  // via the main query, so this is the only path through which they are visible).
  if (!isPrivileged && user?.email) {
    const userWantsProposed = !requestedStatuses || requestedStatuses.includes('proposed')
    if (userWantsProposed) {
      const [dbUser] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, user.email.toLowerCase()))
        .limit(1)

      if (dbUser) {
        const ownProposed = await db
          .select()
          .from(sessions)
          .where(and(
            eq(sessions.eventId, eventId),
            eq(sessions.authorId, dbUser.id),
            eq(sessions.status, 'proposed'),
          ))

        const existingIds = new Set(rows.map(r => r.id))
        for (const s of ownProposed) {
          if (!existingIds.has(s.id)) rows.push(s)
        }
      }
    }
  }

  logger.debug(`Listed ${rows.length} sessions for event ${eventId}`)
  return rows
})
