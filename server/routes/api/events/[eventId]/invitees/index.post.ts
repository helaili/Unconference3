import { invitees, inviteeRoleValues } from '~/server/database/schema'
import type { InviteeRole } from '~/server/database/schema'

export default defineEventHandler(async (event) => {
  const eventId = getRouterParam(event, 'eventId')
  if (!eventId) {
    throw createError({ statusCode: 400, statusMessage: 'Event ID is required' })
  }
  await requireAdminOrStaff(event, eventId)

  const body = await readBody<{ firstName: string; lastName: string; email: string; role?: InviteeRole }>(event)

  if (!body.firstName || !body.lastName || !body.email) {
    throw createError({ statusCode: 400, statusMessage: 'firstName, lastName, and email are required' })
  }

  if (body.role && !inviteeRoleValues.includes(body.role)) {
    throw createError({ statusCode: 400, statusMessage: `role must be one of: ${inviteeRoleValues.join(', ')}` })
  }

  const [created] = await useDB()
    .insert(invitees)
    .values({
      eventId,
      firstName: body.firstName,
      lastName: body.lastName,
      email: body.email,
      role: body.role ?? 'participant',
    })
    .returning()

  return created
})
