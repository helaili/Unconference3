import { eq, and } from 'drizzle-orm'
import { invitees, events } from '~/server/database/schema'

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  const user = session?.user
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  if (!user.email) {
    return []
  }

  const db = useDB()
  const staffInvitees = await db.query.invitees.findMany({
    where: and(
      eq(invitees.email, user.email),
      eq(invitees.role, 'staff'),
    ),
    with: {
      event: true,
    },
  })

  return staffInvitees.map(i => i.event)
})
