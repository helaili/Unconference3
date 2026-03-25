import { eq, and } from 'drizzle-orm'
import { invitees } from '~/server/database/schema'

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  const user = session?.user
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  if (!user.email) {
    return { isStaff: false, staffEventIds: [] }
  }

  const db = useDB()
  const staffInvitees = await db.query.invitees.findMany({
    where: and(
      eq(invitees.email, user.email),
      eq(invitees.role, 'staff'),
    ),
    columns: {
      eventId: true,
    },
  })

  const staffEventIds = staffInvitees.map(i => i.eventId)
  return { isStaff: staffEventIds.length > 0, staffEventIds }
})
