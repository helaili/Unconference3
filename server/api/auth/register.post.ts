import { users, userEvents, invitations, invitees } from '~/server/database/schema'
import { eq, and, isNull, gt } from 'drizzle-orm'

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
    deleteCookie(event, 'invitation-token', { path: '/' })
    throw createError({ statusCode: 400, statusMessage: 'Invalid or expired invitation' })
  }

  const inviteeRecord = invitation.invitees

  // Check if email is already registered
  const [existingUser] = await db.select()
    .from(users)
    .where(eq(users.email, body.email.trim().toLowerCase()))

  if (existingUser) {
    throw createError({ statusCode: 409, statusMessage: 'An account with this email already exists' })
  }

  const passwordHash = await hashPassword(body.password)

  const [dbUser] = await db.insert(users).values({
    firstName: body.firstName.trim(),
    lastName: body.lastName.trim(),
    email: body.email.trim().toLowerCase(),
    passwordHash,
  }).returning()

  if (!dbUser) {
    throw createError({ statusCode: 500, statusMessage: 'Failed to create user' })
  }

  // Link user to the event
  await db.insert(userEvents).values({
    userId: dbUser.id,
    eventId: inviteeRecord.eventId,
  }).onConflictDoNothing()

  // Mark invitation as used
  await db.update(invitations)
    .set({ usedAt: new Date() })
    .where(eq(invitations.id, invitation.invitations.id))

  deleteCookie(event, 'invitation-token', { path: '/' })

  await setUserSession(event, {
    user: {
      dbId: dbUser.id,
      firstName: dbUser.firstName,
      lastName: dbUser.lastName,
      email: dbUser.email,
    },
  })

  return { ok: true }
})
