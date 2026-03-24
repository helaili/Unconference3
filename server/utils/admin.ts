import type { H3Event } from 'h3'

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
