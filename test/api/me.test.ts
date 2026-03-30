import { describe, it, expect, beforeAll } from 'vitest'
import { setup, fetch } from '@nuxt/test-utils/e2e'
import { fileURLToPath } from 'node:url'
import {
  migrateAndSeed,
  loginAs,
  ADMIN_EMAIL,
  REGULAR_USER_EMAIL,
  TEST_EVENT_ID,
} from './helpers'

describe('Me Endpoints', async () => {
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

  // ─── GET /api/me ────────────────────────────────────────────────

  describe('GET /api/me', () => {
    it('returns 401 when not authenticated', async () => {
      const res = await fetch('/api/me')
      expect(res.status).toBe(401)
    })

    it('returns user profile with events for admin user', async () => {
      const res = await fetch('/api/me', {
        headers: { Cookie: adminCookies },
      })
      expect(res.status).toBe(200)
      const body = await res.json() as Record<string, unknown>
      expect(body.email).toBe(ADMIN_EMAIL)
      expect(body.firstName).toBe('Alain')
      expect(body.lastName).toBe('Helaili')
      expect(body.events).toBeDefined()
      expect(Array.isArray(body.events)).toBe(true)
    })

    it('returns user profile for regular user', async () => {
      const res = await fetch('/api/me', {
        headers: { Cookie: userCookies },
      })
      expect(res.status).toBe(200)
      const body = await res.json() as Record<string, unknown>
      expect(body.email).toBe(REGULAR_USER_EMAIL)
      expect(body.firstName).toBe('Diana')
      expect(body.lastName).toBe('Rivera')
      expect(Array.isArray(body.events)).toBe(true)
      const events = body.events as Array<{ id: string }>
      expect(events.some(e => e.id === TEST_EVENT_ID)).toBe(true)
    })
  })
})
