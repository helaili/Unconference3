export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  const user = session?.user
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const adminByLogin = user.login && isAdmin(user.login)
  const adminByEmail = user.email && isAdminEmail(user.email)
  return { isAdmin: !!(adminByLogin || adminByEmail) }
})
