import { createTransport, type Transporter } from 'nodemailer'

let transporter: Transporter | null = null

export function getTransporter(): Transporter {
  if (!transporter) {
    transporter = createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    })
  }
  return transporter
}

interface InvitationEmailParams {
  to: string
  firstName: string
  eventName: string
  inviteToken: string
}

export async function sendInvitationEmail({ to, firstName, eventName, inviteToken }: InvitationEmailParams) {
  const inviteUrl = `${process.env.APP_URL}/invite/${inviteToken}`

  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head><meta charset="UTF-8" /></head>
    <body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 0;">
        <tr>
          <td align="center">
            <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
              <tr>
                <td style="background:#18181b;padding:24px 32px;">
                  <h1 style="margin:0;color:#ffffff;font-size:20px;">You're Invited!</h1>
                </td>
              </tr>
              <tr>
                <td style="padding:32px;">
                  <p style="margin:0 0 16px;font-size:16px;color:#27272a;">Hi ${firstName},</p>
                  <p style="margin:0 0 24px;font-size:16px;color:#27272a;line-height:1.5;">
                    You've been invited to <strong>${eventName}</strong>. Click the button below to accept your invitation.
                  </p>
                  <table cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
                    <tr>
                      <td style="background:#2563eb;border-radius:6px;">
                        <a href="${inviteUrl}" style="display:inline-block;padding:12px 32px;color:#ffffff;font-size:16px;font-weight:600;text-decoration:none;">
                          Accept Invitation
                        </a>
                      </td>
                    </tr>
                  </table>
                  <p style="margin:0 0 8px;font-size:14px;color:#71717a;line-height:1.5;">
                    This invitation link will expire in <strong>3 days</strong>.
                  </p>
                  <p style="margin:0;font-size:12px;color:#a1a1aa;line-height:1.5;word-break:break-all;">
                    If the button doesn't work, copy this URL into your browser:<br/>${inviteUrl}
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `

  return getTransporter().sendMail({
    from: process.env.SMTP_FROM,
    to,
    subject: `You're invited to ${eventName}`,
    html,
  })
}
