import { invitees } from '~/server/database/schema'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const eventId = getRouterParam(event, 'eventId')
  if (!eventId) {
    throw createError({ statusCode: 400, statusMessage: 'Event ID is required' })
  }

  const body = await readBody<{ firstName: string; lastName: string; email: string }>(event)

  if (!body.firstName || !body.lastName || !body.email) {
    throw createError({ statusCode: 400, statusMessage: 'firstName, lastName, and email are required' })
  }

  const [created] = await useDB()
    .insert(invitees)
    .values({
      eventId,
      firstName: body.firstName,
      lastName: body.lastName,
      email: body.email,
    })
    .returning()

  return created
})
