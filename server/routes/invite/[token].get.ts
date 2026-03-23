import { invitations, invitees } from '~/server/database/schema'
import { eq, and, isNull, gt } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token')

  if (!token) {
    return sendInvalidInvitationPage(event)
  }

  const db = useDB()
  const [invitation] = await db.select()
    .from(invitations)
    .innerJoin(invitees, eq(invitations.inviteeId, invitees.id))
    .where(and(
      eq(invitations.token, token),
      isNull(invitations.usedAt),
      gt(invitations.expiresAt, new Date())
    ))

  if (!invitation) {
    return sendInvalidInvitationPage(event)
  }

  setCookie(event, 'invitation-token', token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 3600,
    path: '/',
  })

  return sendRedirect(event, '/auth/github')
})

function sendInvalidInvitationPage(event: Parameters<typeof send>[0]) {
  return send(event, `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Invalid Invitation</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      margin: 0;
      background-color: #f5f5f5;
      color: #333;
    }
    .container {
      text-align: center;
      max-width: 480px;
      padding: 2rem;
      background: white;
      border-radius: 12px;
      box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
    }
    h1 { font-size: 1.5rem; margin-bottom: 0.5rem; }
    p { color: #666; line-height: 1.6; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Invitation Not Valid</h1>
    <p>This invitation link is invalid, expired, or has already been used.</p>
    <p>If you believe this is an error, please contact the event organizer for a new invitation.</p>
  </div>
</body>
</html>`, 'text/html')
}
