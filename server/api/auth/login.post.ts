import { users } from '~/server/database/schema'
import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  if (config.authMode !== 'local') {
    throw createError({ statusCode: 404, statusMessage: 'Not Found' })
  }

  const body = await readBody<{
    email: string
    password: string
  }>(event)

  if (!body.email?.trim() || !body.password) {
    throw createError({ statusCode: 400, statusMessage: 'Email and password are required' })
  }

  const db = useDB()
  const [dbUser] = await db.select()
    .from(users)
    .where(eq(users.email, body.email.trim().toLowerCase()))

  if (!dbUser || !dbUser.passwordHash) {
    throw createError({ statusCode: 401, statusMessage: 'Invalid email or password' })
  }

  const valid = await verifyPassword(dbUser.passwordHash, body.password)
  if (!valid) {
    throw createError({ statusCode: 401, statusMessage: 'Invalid email or password' })
  }

  await setUserSession(event, {
    user: {
      dbId: dbUser.id,
      githubId: dbUser.githubId,
      login: dbUser.login,
      firstName: dbUser.firstName,
      lastName: dbUser.lastName,
      email: dbUser.email,
      avatarUrl: dbUser.avatarUrl,
    },
  })

  return { ok: true }
})
