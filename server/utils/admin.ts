import type { H3Event } from 'h3'
import { eq, and } from 'drizzle-orm'
import { invitees } from '~/server/database/schema'

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
    throw createError({ statusCode: 403, statusMessage: 'Forbidden: admin access required' })
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
    throw createError({ statusCode: 403, statusMessage: 'Forbidden: access denied' })
  }

  const isAdminUser = (user.login && isAdmin(user.login)) || (user.email && isAdminEmail(user.email))
  if (isAdminUser) return

  const isStaff = await isStaffForEvent(event, eventId)
  if (!isStaff) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden: admin or staff access required' })
  }
}
