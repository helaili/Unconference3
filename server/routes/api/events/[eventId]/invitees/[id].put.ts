import { eq } from 'drizzle-orm'
import { invitees } from '~/server/database/schema'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Invitee ID is required' })
  }

  const body = await readBody<{ firstName?: string; lastName?: string; email?: string }>(event)

  if (!body.firstName && !body.lastName && !body.email) {
    throw createError({ statusCode: 400, statusMessage: 'At least one field (firstName, lastName, email) is required' })
  }

  const updates: Partial<{ firstName: string; lastName: string; email: string }> = {}
  if (body.firstName) updates.firstName = body.firstName
  if (body.lastName) updates.lastName = body.lastName
  if (body.email) updates.email = body.email

  const [updated] = await useDB()
    .update(invitees)
    .set(updates)
    .where(eq(invitees.id, id))
    .returning()

  if (!updated) {
    throw createError({ statusCode: 404, statusMessage: 'Invitee not found' })
  }

  return updated
})
