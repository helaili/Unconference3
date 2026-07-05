import { describe, it, expect, beforeAll } from 'vitest'
import { setup, fetch } from '@nuxt/test-utils/e2e'
import { fileURLToPath } from 'node:url'
import { migrateAndSeed, ADMIN_EMAIL, TEST_PASSWORD } from './helpers'

const UNUSED_INVITATION_TOKEN_REGISTER = 'd0000000-0000-0000-0000-000000000002'
const VALID_INVITATION_TOKEN_REGISTER = 'd0000000-0000-0000-0000-000000000003'

describe('Auth Endpoints', async () => {
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
  })

  // ─── Auth Endpoints ─────────────────────────────────────────────

  describe('POST /api/auth/login', () => {
    it('returns 400 when email is missing', async () => {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: TEST_PASSWORD }),
      })
      expect(res.status).toBe(400)
    })

    it('returns 400 when password is missing', async () => {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: ADMIN_EMAIL }),
      })
      expect(res.status).toBe(400)
    })

    it('returns 401 for wrong password', async () => {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: ADMIN_EMAIL, password: 'wrongpassword' }),
      })
      expect(res.status).toBe(401)
    })

    it('returns 401 for non-existent user', async () => {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'nobody@example.com', password: TEST_PASSWORD }),
      })
      expect(res.status).toBe(401)
    })

    it('returns ok:true and sets session cookie on valid login', async () => {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: ADMIN_EMAIL, password: TEST_PASSWORD }),
      })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body).toEqual({ ok: true })
      expect(res.headers.getSetCookie().length).toBeGreaterThan(0)
    })
  })

  describe('POST /api/auth/register', () => {
    it('returns 400 when fields are missing', async () => {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firstName: 'Test' }),
      })
      expect(res.status).toBe(400)
    })

    it('returns 400 when password is too short', async () => {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': `invitation-token=${UNUSED_INVITATION_TOKEN_REGISTER}`,
        },
        body: JSON.stringify({
          firstName: 'New',
          lastName: 'User',
          email: 'new@example.com',
          password: 'short',
        }),
      })
      expect(res.status).toBe(400)
    })

    it('returns 400 when invitation token cookie is missing', async () => {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: 'New',
          lastName: 'User',
          email: 'new@example.com',
          password: 'validpassword123',
        }),
      })
      expect(res.status).toBe(400)
    })

    it('creates the user in pending state when the invitation is valid', async () => {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': `invitation-token=${VALID_INVITATION_TOKEN_REGISTER}`,
        },
        body: JSON.stringify({
          firstName: 'Carol',
          lastName: 'Lee',
          email: 'carol@example.com',
          password: 'validpassword123',
        }),
      })

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body).toEqual({ ok: true, pending: true })

      const loginRes = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'carol@example.com', password: 'validpassword123' }),
      })
      expect(loginRes.status).toBe(403)
    })
  })
})
