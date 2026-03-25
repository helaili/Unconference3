import { eq } from 'drizzle-orm'
import { invitees } from '~/server/database/schema'

export default defineEventHandler(async (event) => {
  const eventId = getRouterParam(event, 'eventId')
  if (!eventId) {
    throw createError({ statusCode: 400, statusMessage: 'Event ID is required' })
  }
  await requireAdminOrStaff(event, eventId)

  const db = useDB()
  const result = await db.select().from(invitees).where(eq(invitees.eventId, eventId)).orderBy(invitees.lastName, invitees.firstName)

  return result
})
