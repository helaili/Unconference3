import { invitations, invitees } from '~/server/database/schema'
import { eq, and, isNull, gt } from 'drizzle-orm'

const logger = useLogger('invitations')

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'Cache-Control', 'no-store')

  const token = getCookie(event, 'invitation-token')
  if (!token) {
    throw createError({ statusCode: 404, statusMessage: 'No pending invitation' })
  }

  const db = useDB()
  const [invitation] = await db.select()
    .from(invitations)
    .innerJoin(invitees, eq(invitations.inviteeId, invitees.id))
    .where(and(
      eq(invitations.token, token),
      isNull(invitations.usedAt),
      gt(invitations.expiresAt, new Date()),
    ))

  if (!invitation) {
    logger.warn('invitation-info requested but token is invalid or expired')
    throw createError({ statusCode: 404, statusMessage: 'Invalid or expired invitation' })
  }

  return {
    firstName: invitation.invitees.firstName,
    lastName: invitation.invitees.lastName,
    email: invitation.invitees.email,
  }
})
