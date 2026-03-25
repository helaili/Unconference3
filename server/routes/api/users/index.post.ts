import { users } from '~/server/database/schema'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const body = await readBody<{
    firstName: string
    lastName: string
    email: string
    password: string
  }>(event)

  if (!body.firstName || !body.lastName || !body.email || !body.password) {
    throw createError({ statusCode: 400, statusMessage: 'firstName, lastName, email, and password are required' })
  }

  if (body.password.length < 8) {
    throw createError({ statusCode: 400, statusMessage: 'Password must be at least 8 characters' })
  }

  const passwordHash = await hashPassword(body.password)

  const [created] = await useDB()
    .insert(users)
    .values({
      firstName: body.firstName,
      lastName: body.lastName,
      email: body.email,
      passwordHash,
    })
    .returning({
      id: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
      login: users.login,
      avatarUrl: users.avatarUrl,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
    })

  return created
})
