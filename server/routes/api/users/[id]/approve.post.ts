import { eq } from 'drizzle-orm'
import { users } from '~/server/database/schema'
import { sendAccountApprovedEmail } from '~/server/utils/email'

const logger = useLogger('users')

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'User ID is required' })
  }

  const db = useDB()
  const existingUser = await db.query.users.findFirst({
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

  if (!existingUser) {
    throw createError({ statusCode: 404, statusMessage: 'User not found' })
  }

  let approvedUser = existingUser

  if (!existingUser.approvedAt) {
    const [updatedUser] = await db
      .update(users)
      .set({
        approvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(users.id, id))
      .returning()

    if (!updatedUser) {
      throw createError({ statusCode: 404, statusMessage: 'User not found' })
    }

    approvedUser = {
      ...existingUser,
      approvedAt: updatedUser.approvedAt,
      updatedAt: updatedUser.updatedAt,
    }

    try {
      await sendAccountApprovedEmail({
        to: approvedUser.email ?? '',
        firstName: approvedUser.firstName ?? 'there',
      })
    }
    catch (error) {
      logger.error(`Failed to send approval email to ${approvedUser.email}:`, error)
    }
  }

  return {
    ...approvedUser,
    events: approvedUser.userEvents.map(ue => ue.event),
  }
})
