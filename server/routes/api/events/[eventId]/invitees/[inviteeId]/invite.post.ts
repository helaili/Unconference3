import { eq } from 'drizzle-orm'
import { invitees, invitations, events } from '~/server/database/schema'

export default defineEventHandler(async (event) => {
  const eventId = getRouterParam(event, 'eventId')
  const inviteeId = getRouterParam(event, 'inviteeId')
  if (!eventId || !inviteeId) {
    throw createError({ statusCode: 400, statusMessage: 'Event ID and Invitee ID are required' })
  }
  await requireAdminOrStaff(event, eventId)

  const db = useDB()

  const invitee = await db.query.invitees.findFirst({
    where: eq(invitees.id, inviteeId),
  })
  if (!invitee) {
    throw createError({ statusCode: 404, statusMessage: 'Invitee not found' })
  }

  const eventRecord = await db.query.events.findFirst({
    where: eq(events.id, eventId),
  })
  if (!eventRecord) {
    throw createError({ statusCode: 404, statusMessage: 'Event not found' })
  }

  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + 3)

  const [invitation] = await db
    .insert(invitations)
    .values({
      inviteeId,
      expiresAt,
    })
    .returning()

  await sendInvitationEmail({
    to: invitee.email,
    firstName: invitee.firstName,
    eventName: eventRecord.name,
    inviteToken: invitation.token,
  })

  return { success: true, invitation }
})
