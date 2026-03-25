import { eq, and, gt, isNull } from 'drizzle-orm'
import { invitees, invitations, events } from '~/server/database/schema'

export default defineEventHandler(async (event) => {
  const eventId = getRouterParam(event, 'eventId')
  if (!eventId) {
    throw createError({ statusCode: 400, statusMessage: 'Event ID is required' })
  }
  await requireAdminOrStaff(event, eventId)

  const db = useDB()

  const eventRecord = await db.query.events.findFirst({
    where: eq(events.id, eventId),
  })
  if (!eventRecord) {
    throw createError({ statusCode: 404, statusMessage: 'Event not found' })
  }

  const allInvitees = await db.query.invitees.findMany({
    where: eq(invitees.eventId, eventId),
    with: { invitations: true },
  })

  const now = new Date()
  const uninvited = allInvitees.filter((invitee) => {
    return !invitee.invitations.some(
      (inv) => inv.expiresAt > now && !inv.usedAt,
    )
  })

  let invited = 0

  for (const invitee of uninvited) {
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 3)

    const [invitation] = await db
      .insert(invitations)
      .values({
        inviteeId: invitee.id,
        expiresAt,
      })
      .returning()

    await sendInvitationEmail({
      to: invitee.email,
      firstName: invitee.firstName,
      eventName: eventRecord.name,
      inviteToken: invitation.token,
    })

    invited++
  }

  return { success: true, invited }
})
