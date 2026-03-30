import { describe, it, expect, beforeAll } from 'vitest'
import { setup, fetch } from '@nuxt/test-utils/e2e'
import { fileURLToPath } from 'node:url'
import {
  migrateAndSeed,
  loginAs,
  ADMIN_EMAIL,
  REGULAR_USER_EMAIL,
} from './helpers'

describe('Admin Endpoints', async () => {
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

  // ─── Admin Check ────────────────────────────────────────────────

  describe('GET /api/admin/check', () => {
    it('returns 401 when not authenticated', async () => {
      const res = await fetch('/api/admin/check')
      expect(res.status).toBe(401)
    })

    it('returns isAdmin:true for admin user', async () => {
      const res = await fetch('/api/admin/check', {
        headers: { Cookie: adminCookies },
      })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body).toEqual({ isAdmin: true })
    })

    it('returns isAdmin:false for regular user', async () => {
      const res = await fetch('/api/admin/check', {
        headers: { Cookie: userCookies },
      })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body).toEqual({ isAdmin: false })
    })
  })
})
