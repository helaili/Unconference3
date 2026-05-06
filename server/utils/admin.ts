import type { H3Event } from 'h3'
import { eq, and } from 'drizzle-orm'
import { useDB } from '../database'
import { invitees, users } from '../database/schema'
import type { InviteeRole } from '../database/schema'

export function isAdmin(login: string): boolean {
  const adminLogins = (process.env.ADMIN_GITHUB_LOGINS || '').split(',').map(l => l.trim()).filter(Boolean)
  return adminLogins.includes(login)
}

export function isAdminEmail(email: string): boolean {
  const adminEmails = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean)
  return adminEmails.includes(email.toLowerCase())
}

export async function requireAdmin(event: H3Event): Promise<void> {
  const session = await getUserSession(event)
  const user = session?.user
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  const isAdminUser = (user.login && isAdmin(user.login)) || (user.email && isAdminEmail(user.email))
  if (!isAdminUser) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden: admin access required' })
  }
}

export async function isStaffForEvent(event: H3Event, eventId: string): Promise<boolean> {
  const session = await getUserSession(event)
  const user = session?.user
  if (!user?.email) return false

  const db = useDB()

  const staffInvitee = await db.query.invitees.findFirst({
    where: and(
      eq(invitees.eventId, eventId),
      eq(invitees.email, user.email),
      eq(invitees.role, 'staff'),
    ),
  })

  return !!staffInvitee
}

export async function requireAdminOrStaff(event: H3Event, eventId: string): Promise<void> {
  const session = await getUserSession(event)
  const user = session?.user
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const isAdminUser = (user.login && isAdmin(user.login)) || (user.email && isAdminEmail(user.email))
  if (isAdminUser) return

  const isStaff = await isStaffForEvent(event, eventId)
  if (!isStaff) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden: admin or staff access required' })
  }
}

/**
 * Returns the invitee role for the current user in a given event, or null if
 * the user is not listed as an invitee.
 */
export async function getInviteeRoleForEvent(event: H3Event, eventId: string): Promise<InviteeRole | null> {
  const session = await getUserSession(event)
  const user = session?.user
  if (!user?.email) return null

  const invitee = await useDB().query.invitees.findFirst({
    where: and(
      eq(invitees.eventId, eventId),
      eq(invitees.email, user.email),
    ),
  })

  return invitee?.role ?? null
}

/**
 * Requires the current user to be an admin, or an invitee of the event (any role).
 * Throws 401 if unauthenticated, 403 if not a member of the event.
 */
export async function requireEventAccess(event: H3Event, eventId: string): Promise<void> {
  const session = await getUserSession(event)
  const user = session?.user
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const isAdminUser = (user.login && isAdmin(user.login)) || (user.email && isAdminEmail(user.email))
  if (isAdminUser) return

  const role = await getInviteeRoleForEvent(event, eventId)
  if (!role) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden: not a member of this event' })
  }
}

/**
 * Requires the current user to be allowed to submit a session for the event.
 * If `submissionRestricted` is true, only admin/staff may submit.
 * Otherwise any event invitee may submit.
 */
export async function requireSessionSubmission(
  event: H3Event,
  eventId: string,
  submissionRestricted: boolean,
): Promise<void> {
  const session = await getUserSession(event)
  const user = session?.user
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const isAdminUser = (user.login && isAdmin(user.login)) || (user.email && isAdminEmail(user.email))
  if (isAdminUser) return

  if (submissionRestricted) {
    const isStaff = await isStaffForEvent(event, eventId)
    if (!isStaff) {
      throw createError({ statusCode: 403, statusMessage: 'Forbidden: session submission is restricted to staff and admins' })
    }
    return
  }

  const role = await getInviteeRoleForEvent(event, eventId)
  if (!role) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden: not a member of this event' })
  }
}

/**
 * Checks whether the current user can edit the given session.
 * Admins and event staff can always edit.
 * The session author can edit, subject to these restrictions when their invitee
 * role is "participant":
 *   – cannot edit once the session status is no longer "proposed"
 *   – cannot change the status field
 * Returns an object with `canEdit`, `canChangeStatus`, `isAdmin`, and `isStaffOrAdmin`.
 */
export async function getSessionEditPermissions(
  event: H3Event,
  eventId: string,
  sessionRecord: { authorId: string; status: string },
): Promise<{ canEdit: boolean; canChangeStatus: boolean; isAdmin: boolean; isStaffOrAdmin: boolean }> {
  const session = await getUserSession(event)
  const user = session?.user
  if (!user) return { canEdit: false, canChangeStatus: false, isAdmin: false, isStaffOrAdmin: false }

  const isAdminUser = !!(user.login && isAdmin(user.login)) || !!(user.email && isAdminEmail(user.email))
  if (isAdminUser) return { canEdit: true, canChangeStatus: true, isAdmin: true, isStaffOrAdmin: true }

  const isStaff = await isStaffForEvent(event, eventId)
  if (isStaff) return { canEdit: true, canChangeStatus: true, isAdmin: false, isStaffOrAdmin: true }

  // Look up the current user's DB record to compare with the session's authorId
  const db = useDB()
  const [dbUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, user.email ?? ''))
    .limit(1)

  if (!dbUser || dbUser.id !== sessionRecord.authorId) {
    return { canEdit: false, canChangeStatus: false, isAdmin: false, isStaffOrAdmin: false }
  }

  // User is the author — check their invitee role for this event
  const role = await getInviteeRoleForEvent(event, eventId)
  if (role === null) {
    // Author is no longer a member of this event — deny editing
    return { canEdit: false, canChangeStatus: false, isAdmin: false, isStaffOrAdmin: false }
  }
  if (role === 'participant') {
    const canEdit = sessionRecord.status === 'proposed'
    return { canEdit, canChangeStatus: false, isAdmin: false, isStaffOrAdmin: false }
  }

  // Author with moderator invitee role can edit but is not staff/admin
  return { canEdit: true, canChangeStatus: true, isAdmin: false, isStaffOrAdmin: false }
}

