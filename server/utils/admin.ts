import type { H3Event } from 'h3'

export function isAdmin(login: string): boolean {
  const adminLogins = (process.env.ADMIN_GITHUB_LOGINS || '').split(',').map(l => l.trim()).filter(Boolean)
  return adminLogins.includes(login)
}

export async function requireAdmin(event: H3Event): Promise<void> {
  const session = await getUserSession(event)
  if (!session?.user?.login || !isAdmin(session.user.login)) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden: admin access required' })
  }
}
