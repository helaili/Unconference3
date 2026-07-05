import { users, userEvents, invitations, invitees } from '~/server/database/schema'
import { eq, and, isNull, gt } from 'drizzle-orm'
import { sendPendingSignupAdminEmail } from '~/server/utils/email'

const logger = useLogger('auth')

function getAdminEmails(): string[] {
  return (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map(email => email.trim().toLowerCase())
    .filter(Boolean)
}

export default defineOAuthGitHubEventHandler({
  config: {
    emailRequired: true
  },
  async onSuccess(event, { user, tokens }) {
    const db = useDB()
    const invitationToken = getCookie(event, 'invitation-token')

    if (invitationToken) {
      // New user arriving via invitation link
      const [invitation] = await db.select()
        .from(invitations)
        .innerJoin(invitees, eq(invitations.inviteeId, invitees.id))
        .where(and(
          eq(invitations.token, invitationToken),
          isNull(invitations.usedAt),
          gt(invitations.expiresAt, new Date())
        ))

      if (!invitation) {
        logger.warn('GitHub OAuth: invalid or expired invitation token')
        deleteCookie(event, 'invitation-token', { path: '/' })
        return sendRedirect(event, '/?error=invalid-invitation')
      }

      const inviteeRecord = invitation.invitees

      // Upsert user: create or update on githubId conflict
      const [dbUser] = await db.insert(users).values({
        githubId: user.id,
        login: user.login,
        firstName: inviteeRecord.firstName,
        lastName: inviteeRecord.lastName,
        email: user.email,
        avatarUrl: user.avatar_url,
        approvedAt: null,
      }).onConflictDoUpdate({
        target: users.githubId,
        set: {
          login: user.login,
          email: user.email,
          avatarUrl: user.avatar_url,
          updatedAt: new Date(),
        },
      }).returning()

      // Link user to the event (idempotent)
      await db.insert(userEvents).values({
        userId: dbUser.id,
        eventId: inviteeRecord.eventId,
      }).onConflictDoNothing()

      // Mark invitation as used
      await db.update(invitations)
        .set({ usedAt: new Date() })
        .where(eq(invitations.id, invitation.invitations.id))

      // Clear the invitation cookie
      deleteCookie(event, 'invitation-token', { path: '/' })

      if (!dbUser.approvedAt) {
        const userProfileUrl = `${process.env.APP_URL}/admin/users/${dbUser.id}`

        await Promise.allSettled(
          getAdminEmails().map(adminEmail =>
            sendPendingSignupAdminEmail({
              to: adminEmail,
              applicantFirstName: dbUser.firstName ?? inviteeRecord.firstName,
              applicantLastName: dbUser.lastName ?? inviteeRecord.lastName,
              applicantEmail: dbUser.email ?? user.email ?? inviteeRecord.email,
              userProfileUrl,
            }),
          ),
        )

        logger.info(`GitHub OAuth: user ${user.login} registered and is pending approval`)
        return sendRedirect(event, '/pending-approval')
      }

      await setUserSession(event, {
        user: {
          dbId: dbUser.id,
          githubId: dbUser.githubId,
          login: dbUser.login,
          firstName: dbUser.firstName,
          lastName: dbUser.lastName,
          email: dbUser.email,
          avatarUrl: dbUser.avatarUrl ?? user.avatar_url,
        },
        secure: {
          accessToken: tokens.access_token,
        },
      })

      logger.info(`GitHub OAuth: user ${user.login} registered via invitation`)
      return sendRedirect(event, '/dashboard')
    }

    // Returning user re-login (no invitation token)
    const existingUser = await db.query.users.findFirst({
      where: eq(users.githubId, user.id),
      with: {
        userEvents: true,
      },
    })

    if (!existingUser) {
      logger.warn(`GitHub OAuth: no invitation found for user ${user.login}`)
      return sendRedirect(event, '/?error=no-invitation')
    }

    if (!existingUser.approvedAt) {
      logger.info(`GitHub OAuth: blocked sign-in for pending user ${existingUser.login}`)
      return sendRedirect(event, '/pending-approval')
    }

    const hasEvents = existingUser.userEvents.length > 0
    const userIsAdmin = isAdmin(existingUser.login)

    await setUserSession(event, {
      user: {
        dbId: existingUser.id,
        githubId: existingUser.githubId,
        login: existingUser.login,
        firstName: existingUser.firstName,
        lastName: existingUser.lastName,
        email: existingUser.email,
        avatarUrl: existingUser.avatarUrl ?? user.avatar_url,
      },
      secure: {
        accessToken: tokens.access_token,
      },
    })

    logger.info(`GitHub OAuth: user ${existingUser.login} logged in`)

    if (hasEvents || userIsAdmin) {
      return sendRedirect(event, '/dashboard')
    }

    return sendRedirect(event, '/')
  },
  onError(event, error) {
    logger.error('GitHub OAuth error:', error)
    return sendRedirect(event, '/?error=auth')
  },
})
