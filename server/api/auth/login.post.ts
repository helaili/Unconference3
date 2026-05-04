import { users, invitations, invitees, userEvents } from '~/server/database/schema'
import { eq, and, isNull, gt } from 'drizzle-orm'

const logger = useLogger('auth')

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  if (config.authMode !== 'local') {
    throw createError({ statusCode: 404, statusMessage: 'Not Found' })
  }

  const body = await readBody<{
    email: string
    password: string
  }>(event)

  if (!body.email?.trim() || !body.password) {
    throw createError({ statusCode: 400, statusMessage: 'Email and password are required' })
  }

  const db = useDB()
  const [dbUser] = await db.select()
    .from(users)
    .where(eq(users.email, body.email.trim().toLowerCase()))

  if (!dbUser || !dbUser.passwordHash) {
    logger.warn(`Failed login attempt for: ${body.email}`)
    throw createError({ statusCode: 401, statusMessage: 'Invalid email or password' })
  }

  const valid = await verifyPassword(dbUser.passwordHash, body.password)
  if (!valid) {
    logger.warn(`Failed login attempt for: ${body.email}`)
    throw createError({ statusCode: 401, statusMessage: 'Invalid email or password' })
  }

  await setUserSession(event, {
    user: {
      dbId: dbUser.id,
      githubId: dbUser.githubId,
      login: dbUser.login,
      firstName: dbUser.firstName,
      lastName: dbUser.lastName,
      email: dbUser.email,
      avatarUrl: dbUser.avatarUrl,
    },
  })

  logger.info(`User logged in: ${dbUser.email}`)

  // Accept a pending invitation if one exists for this user's email
  const invitationToken = getCookie(event, 'invitation-token')
  if (invitationToken) {
    const [invitation] = await db.select()
      .from(invitations)
      .innerJoin(invitees, eq(invitations.inviteeId, invitees.id))
      .where(and(
        eq(invitations.token, invitationToken),
        isNull(invitations.usedAt),
        gt(invitations.expiresAt, new Date()),
        eq(invitees.email, dbUser.email!.toLowerCase()),
      ))

    if (invitation) {
      await db.transaction(async (tx) => {
        await tx.insert(userEvents).values({
          userId: dbUser.id,
          eventId: invitation.invitees.eventId,
        }).onConflictDoNothing()

        await tx.update(invitations)
          .set({ usedAt: new Date() })
          .where(eq(invitations.id, invitation.invitations.id))
      })
      logger.info(`Invitation accepted on login for ${dbUser.email}`)
    } else {
      logger.warn(`Invitation token present on login but did not match user ${dbUser.email}`)
    }

    deleteCookie(event, 'invitation-token', { path: '/' })
  }

  return { ok: true }
})
