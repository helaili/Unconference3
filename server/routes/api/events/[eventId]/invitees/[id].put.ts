import { eq } from 'drizzle-orm'
import { invitees, inviteeRoleValues } from '~/server/database/schema'
import type { InviteeRole } from '~/server/database/schema'

export default defineEventHandler(async (event) => {
  const eventId = getRouterParam(event, 'eventId')
  if (!eventId) {
    throw createError({ statusCode: 400, statusMessage: 'Event ID is required' })
  }
  await requireAdminOrStaff(event, eventId)

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Invitee ID is required' })
  }

  const body = await readBody<{ firstName?: string; lastName?: string; email?: string; role?: InviteeRole }>(event)

  if (!body.firstName && !body.lastName && !body.email && !body.role) {
    throw createError({ statusCode: 400, statusMessage: 'At least one field (firstName, lastName, email, role) is required' })
  }

  if (body.role && !inviteeRoleValues.includes(body.role)) {
    throw createError({ statusCode: 400, statusMessage: `role must be one of: ${inviteeRoleValues.join(', ')}` })
  }

  const updates: Partial<{ firstName: string; lastName: string; email: string; role: InviteeRole }> = {}
  if (body.firstName) updates.firstName = body.firstName
  if (body.lastName) updates.lastName = body.lastName
  if (body.email) updates.email = body.email
  if (body.role) updates.role = body.role

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
