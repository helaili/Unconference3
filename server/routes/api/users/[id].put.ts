import { eq } from 'drizzle-orm'
import { users } from '~/server/database/schema'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'User ID is required' })
  }

  const body = await readBody<{
    firstName?: string
    lastName?: string
    email?: string
  }>(event)

  if (!body.firstName && !body.lastName && !body.email) {
    throw createError({ statusCode: 400, statusMessage: 'At least one field (firstName, lastName, email) is required' })
  }

  const updates: Partial<{ firstName: string; lastName: string; email: string; updatedAt: Date }> = {
    updatedAt: new Date(),
  }
  if (body.firstName) updates.firstName = body.firstName
  if (body.lastName) updates.lastName = body.lastName
  if (body.email) updates.email = body.email

  const [updated] = await useDB()
    .update(users)
    .set(updates)
    .where(eq(users.id, id))
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

  if (!updated) {
    throw createError({ statusCode: 404, statusMessage: 'User not found' })
  }

  return updated
})
