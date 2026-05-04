import { users, userEvents, invitations, invitees } from '~/server/database/schema'
import { eq, and, isNull, gt } from 'drizzle-orm'

const logger = useLogger('auth')

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  if (config.authMode !== 'local') {
    throw createError({ statusCode: 404, statusMessage: 'Not Found' })
  }

  const body = await readBody<{
    firstName: string
    lastName: string
    email: string
    password: string
  }>(event)

  if (!body.firstName?.trim() || !body.lastName?.trim() || !body.email?.trim() || !body.password) {
    throw createError({ statusCode: 400, statusMessage: 'All fields are required' })
  }

  if (body.password.length < 8) {
    throw createError({ statusCode: 400, statusMessage: 'Password must be at least 8 characters' })
  }

  const invitationToken = getCookie(event, 'invitation-token')
  if (!invitationToken) {
    throw createError({ statusCode: 400, statusMessage: 'Missing invitation token' })
  }

  const db = useDB()

  const [invitation] = await db.select()
    .from(invitations)
    .innerJoin(invitees, eq(invitations.inviteeId, invitees.id))
    .where(and(
      eq(invitations.token, invitationToken),
      isNull(invitations.usedAt),
      gt(invitations.expiresAt, new Date())
    ))

  if (!invitation) {
    logger.warn('Registration attempt with invalid or expired invitation token')
    deleteCookie(event, 'invitation-token', { path: '/' })
    throw createError({ statusCode: 400, statusMessage: 'Invalid or expired invitation' })
  }

  const inviteeRecord = invitation.invitees

  // Check if email is already registered (use invitee email from DB, not client input)
  const [existingUser] = await db.select()
    .from(users)
    .where(eq(users.email, inviteeRecord.email.toLowerCase()))

  if (existingUser) {
    logger.warn(`Registration attempt with existing email: ${body.email}`)
    throw createError({ statusCode: 409, statusMessage: 'An account with this email already exists' })
  }

  const passwordHash = await hashPassword(body.password)

  const dbUser = await db.transaction(async (tx) => {
    const [newUser] = await tx.insert(users).values({
      firstName: body.firstName.trim(),
      lastName: body.lastName.trim(),
      email: inviteeRecord.email.toLowerCase(),
      passwordHash,
    }).returning()

    if (!newUser) {
      throw createError({ statusCode: 500, statusMessage: 'Failed to create user' })
    }

    await tx.insert(userEvents).values({
      userId: newUser.id,
      eventId: inviteeRecord.eventId,
    }).onConflictDoNothing()

    await tx.update(invitations)
      .set({ usedAt: new Date() })
      .where(eq(invitations.id, invitation.invitations.id))

    return newUser
  })

  if (!dbUser) {
    throw createError({ statusCode: 500, statusMessage: 'Failed to create user' })
  }

  deleteCookie(event, 'invitation-token', { path: '/' })

  await setUserSession(event, {
    user: {
      dbId: dbUser.id,
      firstName: dbUser.firstName,
      lastName: dbUser.lastName,
      email: dbUser.email,
    },
  })

  logger.info(`New user registered: ${dbUser.email}`)
  return { ok: true }
})
