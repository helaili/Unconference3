import { eq } from 'drizzle-orm'
import { users } from '~/server/database/schema'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'User ID is required' })
  }

  const db = useDB()
  const dbUser = await db.query.users.findFirst({
    where: eq(users.id, id),
    columns: {
      passwordHash: false,
    },
    with: {
      userEvents: {
        with: { event: true },
      },
    },
  })

  if (!dbUser) {
    throw createError({ statusCode: 404, statusMessage: 'User not found' })
  }

  return {
    ...dbUser,
    events: dbUser.userEvents.map(ue => ue.event),
  }
})
