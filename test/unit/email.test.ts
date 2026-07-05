import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Stub Nuxt's useLogger before importing the module under test
vi.stubGlobal('useLogger', () => ({
  info: vi.fn(),
  error: vi.fn(),
}))

// Mock nodemailer
const sendMailMock = vi.fn().mockResolvedValue({ messageId: 'smtp-123' })
vi.mock('nodemailer', () => ({
  createTransport: vi.fn(() => ({ sendMail: sendMailMock })),
}))

// Mock @sendgrid/mail
const sgSendMock = vi.fn().mockResolvedValue([{ statusCode: 202 }])
vi.mock('@sendgrid/mail', () => ({
  default: {
    setApiKey: vi.fn(),
    send: sgSendMock,
  },
}))

// Import after mocks are registered
const {
  getEmailProvider,
  sendInvitationEmail,
  sendPendingSignupAdminEmail,
  sendAccountApprovedEmail,
} = await import('../../server/utils/email')

const BASE_PARAMS = {
  to: 'alice@example.com',
  firstName: 'Alice',
  eventName: 'Test Conference',
  inviteToken: 'tok-abc',
}

const ADMIN_PENDING_PARAMS = {
  to: 'admin@example.com',
  adminFirstName: 'Admin',
  applicantFirstName: 'Alice',
  applicantLastName: 'Smith',
  applicantEmail: 'alice@example.com',
  userProfileUrl: 'https://example.com/admin/users/user-123',
}

const APPROVED_PARAMS = {
  to: 'alice@example.com',
  firstName: 'Alice',
  loginUrl: 'https://example.com/login',
}

describe('getEmailProvider', () => {
  const origProvider = process.env.EMAIL_PROVIDER

  afterEach(() => {
    if (origProvider === undefined) delete process.env.EMAIL_PROVIDER
    else process.env.EMAIL_PROVIDER = origProvider
  })

  it('defaults to smtp when EMAIL_PROVIDER is not set', () => {
    delete process.env.EMAIL_PROVIDER
    expect(getEmailProvider()).toBe('smtp')
  })

  it('returns smtp when EMAIL_PROVIDER=smtp', () => {
    process.env.EMAIL_PROVIDER = 'smtp'
    expect(getEmailProvider()).toBe('smtp')
  })

  it('returns sendgrid when EMAIL_PROVIDER=sendgrid', () => {
    process.env.EMAIL_PROVIDER = 'sendgrid'
    expect(getEmailProvider()).toBe('sendgrid')
  })

  it('throws on unknown EMAIL_PROVIDER value', () => {
    process.env.EMAIL_PROVIDER = 'mailgun'
    expect(() => getEmailProvider()).toThrow('Invalid EMAIL_PROVIDER')
  })
})

describe('sendInvitationEmail — SMTP', () => {
  beforeEach(() => {
    process.env.EMAIL_PROVIDER = 'smtp'
    process.env.SMTP_FROM = 'no-reply@example.com'
    process.env.APP_URL = 'https://example.com'
    sendMailMock.mockClear()
  })

  afterEach(() => {
    delete process.env.EMAIL_PROVIDER
    delete process.env.SMTP_FROM
    delete process.env.APP_URL
    delete process.env.EMAIL_FROM
  })

  it('delegates to nodemailer sendMail', async () => {
    await sendInvitationEmail(BASE_PARAMS)
    expect(sendMailMock).toHaveBeenCalledOnce()
  })

  it('sends to the correct recipient', async () => {
    await sendInvitationEmail(BASE_PARAMS)
    const call = sendMailMock.mock.calls[0][0]
    expect(call.to).toBe('alice@example.com')
  })

  it('uses EMAIL_FROM when set (takes precedence over SMTP_FROM)', async () => {
    process.env.EMAIL_FROM = 'custom@example.com'
    await sendInvitationEmail(BASE_PARAMS)
    const call = sendMailMock.mock.calls[0][0]
    expect(call.from).toBe('custom@example.com')
  })

  it('falls back to SMTP_FROM when EMAIL_FROM is not set', async () => {
    await sendInvitationEmail(BASE_PARAMS)
    const call = sendMailMock.mock.calls[0][0]
    expect(call.from).toBe('no-reply@example.com')
  })

  it('includes the invite URL in the HTML body', async () => {
    await sendInvitationEmail(BASE_PARAMS)
    const call = sendMailMock.mock.calls[0][0]
    expect(call.html).toContain('https://example.com/invite/tok-abc')
  })

  it('rethrows errors from the transporter', async () => {
    sendMailMock.mockRejectedValueOnce(new Error('SMTP connection refused'))
    await expect(sendInvitationEmail(BASE_PARAMS)).rejects.toThrow('SMTP connection refused')
  })
})

describe('approval workflow emails — SMTP', () => {
  beforeEach(() => {
    process.env.EMAIL_PROVIDER = 'smtp'
    process.env.SMTP_FROM = 'no-reply@example.com'
    process.env.APP_URL = 'https://example.com'
    sendMailMock.mockClear()
  })

  afterEach(() => {
    delete process.env.EMAIL_PROVIDER
    delete process.env.SMTP_FROM
    delete process.env.APP_URL
    delete process.env.EMAIL_FROM
  })

  it('sends the admin review email with the profile URL', async () => {
    await sendPendingSignupAdminEmail(ADMIN_PENDING_PARAMS)
    const call = sendMailMock.mock.calls[0][0]
    expect(call.to).toBe('admin@example.com')
    expect(call.subject).toContain('New account pending approval')
    expect(call.html).toContain('https://example.com/admin/users/user-123')
    expect(call.html).toContain('Alice Smith')
  })

  it('sends the applicant approval email with the login URL', async () => {
    await sendAccountApprovedEmail(APPROVED_PARAMS)
    const call = sendMailMock.mock.calls[0][0]
    expect(call.to).toBe('alice@example.com')
    expect(call.subject).toBe('Your account has been approved')
    expect(call.html).toContain('https://example.com/login')
  })
})

describe('sendInvitationEmail — SendGrid', () => {
  beforeEach(() => {
    process.env.EMAIL_PROVIDER = 'sendgrid'
    process.env.SENDGRID_API_KEY = 'SG.test-key'
    process.env.SMTP_FROM = 'no-reply@example.com'
    process.env.APP_URL = 'https://example.com'
    sgSendMock.mockClear()
    sendMailMock.mockClear()
  })

  afterEach(() => {
    delete process.env.EMAIL_PROVIDER
    delete process.env.SENDGRID_API_KEY
    delete process.env.SMTP_FROM
    delete process.env.APP_URL
    delete process.env.EMAIL_FROM
  })

  it('delegates to @sendgrid/mail send', async () => {
    await sendInvitationEmail(BASE_PARAMS)
    expect(sgSendMock).toHaveBeenCalledOnce()
    expect(sendMailMock).not.toHaveBeenCalled()
  })

  it('sends to the correct recipient', async () => {
    await sendInvitationEmail(BASE_PARAMS)
    const call = sgSendMock.mock.calls[0][0]
    expect(call.to).toBe('alice@example.com')
  })

  it('uses EMAIL_FROM when set', async () => {
    process.env.EMAIL_FROM = 'custom@example.com'
    await sendInvitationEmail(BASE_PARAMS)
    const call = sgSendMock.mock.calls[0][0]
    expect(call.from).toBe('custom@example.com')
  })

  it('falls back to SMTP_FROM when EMAIL_FROM is not set', async () => {
    await sendInvitationEmail(BASE_PARAMS)
    const call = sgSendMock.mock.calls[0][0]
    expect(call.from).toBe('no-reply@example.com')
  })

  it('throws when SENDGRID_API_KEY is missing', async () => {
    delete process.env.SENDGRID_API_KEY
    await expect(sendInvitationEmail(BASE_PARAMS)).rejects.toThrow('SENDGRID_API_KEY')
  })

  it('includes the invite URL in the HTML body', async () => {
    await sendInvitationEmail(BASE_PARAMS)
    const call = sgSendMock.mock.calls[0][0]
    expect(call.html).toContain('https://example.com/invite/tok-abc')
  })

  it('rethrows errors from SendGrid', async () => {
    sgSendMock.mockRejectedValueOnce(new Error('SendGrid API error'))
    await expect(sendInvitationEmail(BASE_PARAMS)).rejects.toThrow('SendGrid API error')
  })
})
