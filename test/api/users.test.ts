import { describe, it, expect, beforeAll } from 'vitest'
import { setup, fetch } from '@nuxt/test-utils/e2e'
import { fileURLToPath } from 'node:url'
import {
  migrateAndSeed,
  loginAs,
  ADMIN_EMAIL,
  REGULAR_USER_EMAIL,
} from './helpers'

const PENDING_USER_INVITATION_TOKEN = 'd0000000-0000-0000-0000-000000000001'
const PENDING_USER_EMAIL = 'alice@example.com'
const PENDING_USER_PASSWORD = 'validpassword123'

describe('User Endpoints', async () => {
  let adminCookies: string
  let userCookies: string

  await setup({
    rootDir: fileURLToPath(new URL('../..', import.meta.url)),
    env: {
      AUTH_MODE: 'local',
      NUXT_AUTH_MODE: 'local',
      NUXT_PUBLIC_AUTH_MODE: 'local',
      ADMIN_EMAILS: ADMIN_EMAIL,
      NUXT_SESSION_PASSWORD: 'test-session-secret-that-is-at-least-32-chars-long',
      SMTP_HOST: 'localhost',
      SMTP_PORT: '2525',
      APP_URL: 'http://localhost:3000',
    },
  })

  beforeAll(async () => {
    await migrateAndSeed()
    adminCookies = await loginAs(fetch, ADMIN_EMAIL)
    userCookies = await loginAs(fetch, REGULAR_USER_EMAIL)
  })

  describe('POST /api/users/:id/approve', () => {
    it('returns 401 when not authenticated', async () => {
      const res = await fetch('/api/users/00000000-0000-0000-0000-000000000000/approve', {
        method: 'POST',
      })
      expect(res.status).toBe(401)
    })

    it('returns 403 for a non-admin user', async () => {
      const res = await fetch('/api/users/00000000-0000-0000-0000-000000000000/approve', {
        method: 'POST',
        headers: { Cookie: userCookies },
      })
      expect(res.status).toBe(403)
    })

    it('returns 404 for a missing user', async () => {
      const res = await fetch('/api/users/00000000-0000-0000-0000-000000000000/approve', {
        method: 'POST',
        headers: { Cookie: adminCookies },
      })
      expect(res.status).toBe(404)
    })

    it('approves a pending user and allows them to sign in', async () => {
      const registerRes = await fetch('/api/auth/register', {
        method: 'POST',
        headers: {
          Cookie: `invitation-token=${PENDING_USER_INVITATION_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          firstName: 'Alice',
          lastName: 'Smith',
          email: PENDING_USER_EMAIL,
          password: PENDING_USER_PASSWORD,
        }),
      })

      expect(registerRes.status).toBe(200)

      const listRes = await fetch('/api/users', {
        headers: { Cookie: adminCookies },
      })
      expect(listRes.status).toBe(200)
      const users = await listRes.json() as Array<{ id: string, email: string | null, approvedAt: string | null }>
      const pendingUser = users.find(user => user.email === PENDING_USER_EMAIL)
      expect(pendingUser).toBeDefined()
      expect(pendingUser?.approvedAt).toBeNull()

      const approveRes = await fetch(`/api/users/${pendingUser!.id}/approve`, {
        method: 'POST',
        headers: { Cookie: adminCookies },
      })
      expect(approveRes.status).toBe(200)
      const approvedBody = await approveRes.json() as Record<string, unknown>
      expect(approvedBody.email).toBe(PENDING_USER_EMAIL)
      expect(approvedBody.approvedAt).toBeTruthy()

      const getRes = await fetch(`/api/users/${pendingUser!.id}`, {
        headers: { Cookie: adminCookies },
      })
      expect(getRes.status).toBe(200)
      const approvedUser = await getRes.json() as Record<string, unknown>
      expect(approvedUser.approvedAt).toBeTruthy()

      const loginRes = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: PENDING_USER_EMAIL, password: PENDING_USER_PASSWORD }),
      })
      expect(loginRes.status).toBe(200)
    })
  })
})
