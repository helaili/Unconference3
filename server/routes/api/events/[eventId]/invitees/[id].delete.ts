import { eq } from 'drizzle-orm'
import { invitees } from '~/server/database/schema'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Invitee ID is required' })
  }

  const [deleted] = await useDB()
    .delete(invitees)
    .where(eq(invitees.id, id))
    .returning()

  if (!deleted) {
    throw createError({ statusCode: 404, statusMessage: 'Invitee not found' })
  }

  return { success: true }
})
