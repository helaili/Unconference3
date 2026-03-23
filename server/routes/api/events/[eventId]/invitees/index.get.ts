import { eq } from 'drizzle-orm'
import { invitees } from '~/server/database/schema'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const eventId = getRouterParam(event, 'eventId')
  if (!eventId) {
    throw createError({ statusCode: 400, statusMessage: 'Event ID is required' })
  }

  const db = useDB()
  const result = await db.query.invitees.findMany({
    where: eq(invitees.eventId, eventId),
    with: { invitations: true },
    orderBy: [invitees.lastName, invitees.firstName],
  })

  return result
})
