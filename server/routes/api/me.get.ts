import { users, userEvents, events } from '~/server/database/schema'
import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  if (!session?.user?.githubId) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const db = useDB()
  const dbUser = await db.query.users.findFirst({
    where: eq(users.githubId, session.user.githubId),
    with: {
      userEvents: {
        with: { event: true }
      }
    }
  })

  if (!dbUser) {
    throw createError({ statusCode: 404, statusMessage: 'User not found' })
  }

  return {
    ...dbUser,
    events: dbUser.userEvents.map(ue => ue.event)
  }
})
