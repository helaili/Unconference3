export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  if (!session?.user?.login) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const adminLogins = (process.env.ADMIN_GITHUB_LOGINS || '').split(',').map(l => l.trim()).filter(Boolean)
  return { isAdmin: adminLogins.includes(session.user.login) }
})
