import { users, userEvents, invitations, invitees } from '~/server/database/schema'
import { eq, and, isNull, gt } from 'drizzle-orm'

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

      return sendRedirect(event, '/dashboard')
    }

    // Returning user re-login (no invitation token)
    const [existingUser] = await db.select()
      .from(users)
      .where(eq(users.githubId, user.id))

    if (!existingUser) {
      return sendRedirect(event, '/?error=no-invitation')
    }

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

    return sendRedirect(event, '/dashboard')
  },
  onError(event, error) {
    console.error('GitHub OAuth error:', error)
    return sendRedirect(event, '/?error=auth')
  },
})
