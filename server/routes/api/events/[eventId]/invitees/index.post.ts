import { eq } from 'drizzle-orm'
import { invitees, users, userEvents, inviteeRoleValues } from '~/server/database/schema'
import type { InviteeRole } from '~/server/database/schema'

const logger = useLogger('invitees')

export default defineEventHandler(async (event) => {
  const eventId = getRouterParam(event, 'eventId')
  if (!eventId) {
    throw createError({ statusCode: 400, statusMessage: 'Event ID is required' })
  }
  await requireAdminOrStaff(event, eventId)

  const body = await readBody<{
    firstName: string
    lastName: string
    email: string
    role?: InviteeRole
    registerParticipant?: boolean
    defaultPassword?: string
  }>(event)

  if (!body.firstName || !body.lastName || !body.email) {
    throw createError({ statusCode: 400, statusMessage: 'firstName, lastName, and email are required' })
  }

  if (body.role && !inviteeRoleValues.includes(body.role)) {
    throw createError({ statusCode: 400, statusMessage: `role must be one of: ${inviteeRoleValues.join(', ')}` })
  }

  const registerParticipant = body.registerParticipant === true

  if (registerParticipant) {
    if (!body.defaultPassword || body.defaultPassword.length < 8) {
      throw createError({ statusCode: 400, statusMessage: 'defaultPassword must be at least 8 characters when registerParticipant is true' })
    }
  }

  const db = useDB()
  let created: typeof invitees.$inferSelect
  let registered = false

  if (registerParticipant) {
    const passwordHash = await hashPassword(body.defaultPassword!)

    await db.transaction(async (tx) => {
      const [insertedInvitee] = await tx
        .insert(invitees)
        .values({
          eventId,
          firstName: body.firstName,
          lastName: body.lastName,
          email: body.email,
          role: body.role ?? 'participant',
        })
        .returning()
      created = insertedInvitee

      const [insertedUser] = await tx
        .insert(users)
        .values({ firstName: body.firstName, lastName: body.lastName, email: body.email, passwordHash })
        .onConflictDoNothing()
        .returning({ id: users.id })

      const userId = insertedUser?.id
        ?? (await tx.select({ id: users.id }).from(users).where(eq(users.email, body.email)).limit(1))[0]?.id

      if (userId) {
        await tx
          .insert(userEvents)
          .values({ userId, eventId })
          .onConflictDoNothing()
        registered = true
      }
    })
  }
  else {
    const [insertedInvitee] = await db
      .insert(invitees)
      .values({
        eventId,
        firstName: body.firstName,
        lastName: body.lastName,
        email: body.email,
        role: body.role ?? 'participant',
      })
      .returning()
    created = insertedInvitee
  }

  logger.info(`Invitee added: ${created!.email} to event ${eventId} (role: ${created!.role}, registered: ${registered})`)
  return { ...created!, registered }
})
