import { createTransport, type Transporter } from 'nodemailer'
import sgMail from '@sendgrid/mail'

const logger = useLogger('email')

/** Resolve the email provider from the environment. Defaults to 'smtp'. */
export function getEmailProvider(): 'smtp' | 'sendgrid' {
  const provider = (process.env.EMAIL_PROVIDER ?? 'smtp').toLowerCase()
  if (provider !== 'smtp' && provider !== 'sendgrid') {
    throw new Error(`Invalid EMAIL_PROVIDER "${provider}". Must be "smtp" or "sendgrid".`)
  }
  return provider
}

// ─── SMTP ─────────────────────────────────────────────────────────────────────

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

// ─── SendGrid ─────────────────────────────────────────────────────────────────

function getSendGridClient(): typeof sgMail {
  const apiKey = process.env.SENDGRID_API_KEY
  if (!apiKey) {
    throw new Error('SENDGRID_API_KEY environment variable is required when EMAIL_PROVIDER=sendgrid')
  }
  sgMail.setApiKey(apiKey)
  return sgMail
}

// ─── Shared ───────────────────────────────────────────────────────────────────

/** Resolve the sender address. EMAIL_FROM takes precedence; falls back to SMTP_FROM. */
function getFromAddress(): string {
  return process.env.EMAIL_FROM ?? process.env.SMTP_FROM ?? ''
}

interface InvitationEmailParams {
  to: string
  firstName: string
  eventName: string
  inviteToken: string
}

interface PendingSignupAdminEmailParams {
  to: string
  adminFirstName?: string | null
  applicantFirstName: string
  applicantLastName: string
  applicantEmail: string
  userProfileUrl: string
}

interface AccountApprovedEmailParams {
  to: string
  firstName: string
  loginUrl?: string
}

interface DeliverEmailParams {
  to: string
  subject: string
  html: string
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll('\'', '&#39;')
}

function buildInvitationHtml(firstName: string, eventName: string, inviteUrl: string): string {
  return `
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
}

function buildPendingSignupAdminHtml({
  adminFirstName,
  applicantFirstName,
  applicantLastName,
  applicantEmail,
  userProfileUrl,
}: PendingSignupAdminEmailParams): string {
  const safeAdminFirstName = adminFirstName?.trim() ? escapeHtml(adminFirstName.trim()) : 'there'
  const safeApplicantFirstName = escapeHtml(applicantFirstName)
  const safeApplicantLastName = escapeHtml(applicantLastName)
  const safeApplicantEmail = escapeHtml(applicantEmail)

  return `
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
                  <h1 style="margin:0;color:#ffffff;font-size:20px;">New account pending approval</h1>
                </td>
              </tr>
              <tr>
                <td style="padding:32px;">
                  <p style="margin:0 0 16px;font-size:16px;color:#27272a;">Hi ${safeAdminFirstName},</p>
                  <p style="margin:0 0 24px;font-size:16px;color:#27272a;line-height:1.5;">
                    <strong>${safeApplicantFirstName} ${safeApplicantLastName}</strong> just created an account with
                    <strong>${safeApplicantEmail}</strong> and is waiting for approval.
                  </p>
                  <table cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
                    <tr>
                      <td style="background:#2563eb;border-radius:6px;">
                        <a href="${userProfileUrl}" style="display:inline-block;padding:12px 32px;color:#ffffff;font-size:16px;font-weight:600;text-decoration:none;">
                          Review Applicant
                        </a>
                      </td>
                    </tr>
                  </table>
                  <p style="margin:0;font-size:12px;color:#a1a1aa;line-height:1.5;word-break:break-all;">
                    If the button doesn't work, copy this URL into your browser:<br/>${userProfileUrl}
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
}

function buildAccountApprovedHtml(firstName: string, loginUrl: string): string {
  return `
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
                  <h1 style="margin:0;color:#ffffff;font-size:20px;">Your account has been approved</h1>
                </td>
              </tr>
              <tr>
                <td style="padding:32px;">
                  <p style="margin:0 0 16px;font-size:16px;color:#27272a;">Hi ${escapeHtml(firstName)},</p>
                  <p style="margin:0 0 24px;font-size:16px;color:#27272a;line-height:1.5;">
                    Your account has been approved by an administrator. You can now sign in and access the event platform.
                  </p>
                  <table cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
                    <tr>
                      <td style="background:#16a34a;border-radius:6px;">
                        <a href="${loginUrl}" style="display:inline-block;padding:12px 32px;color:#ffffff;font-size:16px;font-weight:600;text-decoration:none;">
                          Sign In
                        </a>
                      </td>
                    </tr>
                  </table>
                  <p style="margin:0;font-size:12px;color:#a1a1aa;line-height:1.5;word-break:break-all;">
                    If the button doesn't work, copy this URL into your browser:<br/>${loginUrl}
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
}

async function deliverEmail({ to, subject, html }: DeliverEmailParams) {
  const from = getFromAddress()
  const provider = getEmailProvider()

  if (provider === 'sendgrid') {
    await getSendGridClient().send({ from, to, subject, html })
    return provider
  }

  await getTransporter().sendMail({ from, to, subject, html })
  return provider
}

export async function sendInvitationEmail({ to, firstName, eventName, inviteToken }: InvitationEmailParams) {
  const inviteUrl = `${process.env.APP_URL}/invite/${inviteToken}`
  const html = buildInvitationHtml(firstName, eventName, inviteUrl)
  const subject = `You're invited to ${eventName}`

  try {
    const provider = await deliverEmail({ to, subject, html })

    logger.info(`Invitation email sent to ${to} for event "${eventName}" via ${provider}`)
  }
  catch (error) {
    logger.error(`Failed to send invitation email to ${to}:`, error)
    throw error
  }
}

export async function sendPendingSignupAdminEmail(params: PendingSignupAdminEmailParams) {
  const subject = `New account pending approval: ${params.applicantFirstName} ${params.applicantLastName}`
  const html = buildPendingSignupAdminHtml(params)

  try {
    const provider = await deliverEmail({ to: params.to, subject, html })
    logger.info(`Pending approval email sent to admin ${params.to} via ${provider}`)
  }
  catch (error) {
    logger.error(`Failed to send pending approval email to admin ${params.to}:`, error)
    throw error
  }
}

export async function sendAccountApprovedEmail({ to, firstName, loginUrl }: AccountApprovedEmailParams) {
  const resolvedLoginUrl = loginUrl ?? `${process.env.APP_URL}/login`
  const html = buildAccountApprovedHtml(firstName, resolvedLoginUrl)
  const subject = 'Your account has been approved'

  try {
    const provider = await deliverEmail({ to, subject, html })
    logger.info(`Approval email sent to ${to} via ${provider}`)
  }
  catch (error) {
    logger.error(`Failed to send approval email to ${to}:`, error)
    throw error
  }
}
