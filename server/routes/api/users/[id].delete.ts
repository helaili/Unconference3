import { eq } from 'drizzle-orm'
import { users } from '~/server/database/schema'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'User ID is required' })
  }

  const [deleted] = await useDB()
    .delete(users)
    .where(eq(users.id, id))
    .returning()

  if (!deleted) {
    throw createError({ statusCode: 404, statusMessage: 'User not found' })
  }

  return { success: true }
})
