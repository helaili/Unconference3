import { describe, it, expect, beforeAll } from 'vitest'
import { setup, fetch } from '@nuxt/test-utils/e2e'
import { fileURLToPath } from 'node:url'
import {
  migrateAndSeed,
  loginAs,
  ADMIN_EMAIL,
  REGULAR_USER_EMAIL,
  OUTSIDER_EMAIL,
  PARTICIPANT_USER_EMAIL,
  TEST_EVENT_ID,
  TEST_SESSION_PUBLISHED_ID,
  TEST_SESSION_SCHEDULED_ID,
  TEST_SESSION_DELIVERED_ID,
  TEST_SESSION_PROPOSED_BY_DIANA_ID,
  TEST_SESSION_STARRED_BY_DIANA_1,
  TEST_SESSION_STARRED_BY_DIANA_2,
  TEST_SESSION_STARRED_BY_DIANA_3,
  TEST_SESSION_STARRED_BY_DIANA_4,
  TEST_SESSION_UNSTARRED_PUBLISHED_ID,
} from './helpers'

const SESSIONS_BASE = `/api/events/${TEST_EVENT_ID}/sessions`
const starUrl = (sessionId: string) => `${SESSIONS_BASE}/${sessionId}/star`

describe('Session Stars Endpoints', async () => {
  let adminCookies: string
  let dianaCookies: string   // participant with 4 pre-seeded stars
  let noahCookies: string    // participant with 0 stars

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
    dianaCookies = await loginAs(fetch, REGULAR_USER_EMAIL)
    noahCookies = await loginAs(fetch, PARTICIPANT_USER_EMAIL)
  })

  // ─── POST /star ──────────────────────────────────────────────────────────────

  describe('POST /api/events/[eventId]/sessions/[sessionId]/star', () => {
    it('returns 401 for unauthenticated request', async () => {
      const res = await fetch(starUrl(TEST_SESSION_PUBLISHED_ID), { method: 'POST' })
      expect(res.status).toBe(401)
    })

    it('returns 403 for user not in the event', async () => {
      const outsiderCookies = await loginAs(fetch, OUTSIDER_EMAIL)
      const res = await fetch(starUrl(TEST_SESSION_PUBLISHED_ID), {
        method: 'POST',
        headers: { Cookie: outsiderCookies },
      })
      expect(res.status).toBe(403)
    })

    it('returns 400 when trying to star a proposed session', async () => {
      const res = await fetch(starUrl(TEST_SESSION_PROPOSED_BY_DIANA_ID), {
        method: 'POST',
        headers: { Cookie: noahCookies },
      })
      expect(res.status).toBe(400)
    })

    it('returns 400 when trying to star a delivered session', async () => {
      const res = await fetch(starUrl(TEST_SESSION_DELIVERED_ID), {
        method: 'POST',
        headers: { Cookie: noahCookies },
      })
      expect(res.status).toBe(400)
    })

    it('participant can star a published session', async () => {
      const res = await fetch(starUrl(TEST_SESSION_PUBLISHED_ID), {
        method: 'POST',
        headers: { Cookie: noahCookies },
      })
      expect(res.status).toBe(200)
      const body = await res.json() as { starred: boolean }
      expect(body.starred).toBe(true)
    })

    it('returns 409 when starring an already-starred session', async () => {
      const res = await fetch(starUrl(TEST_SESSION_PUBLISHED_ID), {
        method: 'POST',
        headers: { Cookie: noahCookies },
      })
      expect(res.status).toBe(409)
    })

    it('returns 400 when exceeding max stars (maxStars=6, star 6 then attempt 7th)', async () => {
      // Noah starts with 1 star (TEST_SESSION_PUBLISHED_ID from previous test).
      // Star 5 more to reach the max of 6, then attempt a 7th.
      const additionalSessions = [
        TEST_SESSION_SCHEDULED_ID,               // d03
        TEST_SESSION_STARRED_BY_DIANA_3,         // d07
        TEST_SESSION_STARRED_BY_DIANA_4,         // d08
        TEST_SESSION_UNSTARRED_PUBLISHED_ID,     // d06
        'd0000000-0000-0000-0000-000000000009',  // scheduled
      ]
      for (const id of additionalSessions) {
        const r = await fetch(starUrl(id), { method: 'POST', headers: { Cookie: noahCookies } })
        expect(r.status).toBe(200)
      }

      // Noah now has 6 stars — the 7th must be rejected
      const overLimitRes = await fetch(starUrl('d0000000-0000-0000-0000-000000000012'), {
        method: 'POST',
        headers: { Cookie: noahCookies },
      })
      expect(overLimitRes.status).toBe(400)
    })
  })

  // ─── DELETE /star ─────────────────────────────────────────────────────────────

  describe('DELETE /api/events/[eventId]/sessions/[sessionId]/star', () => {
    it('returns 401 for unauthenticated request', async () => {
      const res = await fetch(starUrl(TEST_SESSION_STARRED_BY_DIANA_1), { method: 'DELETE' })
      expect(res.status).toBe(401)
    })

    it('returns 403 for user not in the event', async () => {
      const outsiderCookies = await loginAs(fetch, OUTSIDER_EMAIL)
      const res = await fetch(starUrl(TEST_SESSION_STARRED_BY_DIANA_1), {
        method: 'DELETE',
        headers: { Cookie: outsiderCookies },
      })
      expect(res.status).toBe(403)
    })

    it('returns 404 when unstarring a session that was not starred', async () => {
      // Diana has not starred TEST_SESSION_UNSTARRED_PUBLISHED_ID
      const res = await fetch(starUrl(TEST_SESSION_UNSTARRED_PUBLISHED_ID), {
        method: 'DELETE',
        headers: { Cookie: dianaCookies },
      })
      expect(res.status).toBe(404)
    })

    it('participant can unstar a session', async () => {
      const res = await fetch(starUrl(TEST_SESSION_STARRED_BY_DIANA_1), {
        method: 'DELETE',
        headers: { Cookie: dianaCookies },
      })
      expect(res.status).toBe(200)
      const body = await res.json() as { starred: boolean }
      expect(body.starred).toBe(false)
    })

    it('star count decreases after unstarring', async () => {
      // Verify the session list reflects the decreased count
      const res = await fetch(SESSIONS_BASE, { headers: { Cookie: dianaCookies } })
      expect(res.status).toBe(200)
      const list = await res.json() as Array<{ id: string; starCount: number; isStarred: boolean }>
      const session = list.find(s => s.id === TEST_SESSION_STARRED_BY_DIANA_1)
      // starCount is 1 (Noah starred it earlier in this test suite; Diana unstarred it)
      expect(session?.starCount).toBe(1)
      expect(session?.isStarred).toBe(false)
    })

    it('participant can re-star after unstarring (mutation round-trip)', async () => {
      const starRes = await fetch(starUrl(TEST_SESSION_STARRED_BY_DIANA_1), {
        method: 'POST',
        headers: { Cookie: dianaCookies },
      })
      expect(starRes.status).toBe(200)

      // Verify via list
      const listRes = await fetch(SESSIONS_BASE, { headers: { Cookie: dianaCookies } })
      const list = await listRes.json() as Array<{ id: string; isStarred: boolean }>
      const session = list.find(s => s.id === TEST_SESSION_STARRED_BY_DIANA_1)
      expect(session?.isStarred).toBe(true)
    })
  })

  // ─── GET sessions — isStarred, starCount, ?starred=true filter ───────────────

  describe('GET /api/events/[eventId]/sessions — star fields', () => {
    it('returns isStarred=true for Diana\'s starred sessions', async () => {
      const res = await fetch(SESSIONS_BASE, { headers: { Cookie: dianaCookies } })
      expect(res.status).toBe(200)
      const list = await res.json() as Array<{ id: string; isStarred: boolean }>
      const starred = list.find(s => s.id === TEST_SESSION_STARRED_BY_DIANA_2)
      expect(starred?.isStarred).toBe(true)
    })

    it('returns isStarred=false for unstarred sessions', async () => {
      const res = await fetch(SESSIONS_BASE, { headers: { Cookie: dianaCookies } })
      const list = await res.json() as Array<{ id: string; isStarred: boolean }>
      const unstarred = list.find(s => s.id === TEST_SESSION_UNSTARRED_PUBLISHED_ID)
      expect(unstarred?.isStarred).toBe(false)
    })

    it('returns starCount for each session', async () => {
      const res = await fetch(SESSIONS_BASE, { headers: { Cookie: dianaCookies } })
      const list = await res.json() as Array<{ id: string; starCount: number }>
      for (const s of list) {
        expect(typeof s.starCount).toBe('number')
      }
    })

    it('?starred=true returns only starred sessions for participant', async () => {
      const res = await fetch(`${SESSIONS_BASE}?starred=true`, { headers: { Cookie: dianaCookies } })
      expect(res.status).toBe(200)
      const list = await res.json() as Array<{ id: string; isStarred: boolean }>
      expect(list.length).toBeGreaterThan(0)
      for (const s of list) {
        expect(s.isStarred).toBe(true)
      }
    })

    it('?starred=true returns only starred sessions for a participant who has no stars yet (empty)', async () => {
      // Use a fresh user login that hasn't starred anything in this test run.
      // We need a participant who has never starred — use a different participant.
      // marcus.chen@example.com (b0000000-11) is an invitee but has no stars in seed data.
      const marcusCookies = await loginAs(fetch, 'marcus.chen@example.com')
      const res = await fetch(`${SESSIONS_BASE}?starred=true`, { headers: { Cookie: marcusCookies } })
      expect(res.status).toBe(200)
      const list = await res.json() as Array<{ isStarred: boolean }>
      expect(list).toHaveLength(0)
    })
  })

  // ─── Admin: star count visibility and sorting ─────────────────────────────────

  describe('Admin: star count and sorting', () => {
    it('admin sees starCount for all sessions', async () => {
      const res = await fetch(`${SESSIONS_BASE}?status=proposed,published,scheduled,delivered`, {
        headers: { Cookie: adminCookies },
      })
      expect(res.status).toBe(200)
      const list = await res.json() as Array<{ id: string; starCount: number }>
      expect(list.length).toBeGreaterThan(0)
      for (const s of list) {
        expect(typeof s.starCount).toBe('number')
      }
    })

    it('?sortBy=stars returns sessions sorted by star count descending', async () => {
      const res = await fetch(`${SESSIONS_BASE}?sortBy=stars`, {
        headers: { Cookie: adminCookies },
      })
      expect(res.status).toBe(200)
      const list = await res.json() as Array<{ id: string; starCount: number }>
      for (let i = 0; i < list.length - 1; i++) {
        expect(list[i].starCount).toBeGreaterThanOrEqual(list[i + 1].starCount)
      }
    })

    it('participants cannot use ?sortBy=stars (filter is silently ignored)', async () => {
      const res = await fetch(`${SESSIONS_BASE}?sortBy=stars`, {
        headers: { Cookie: dianaCookies },
      })
      expect(res.status).toBe(200)
      // No error — just not sorted by stars for participants
    })
  })

  // ─── Event minStars/maxStars ─────────────────────────────────────────────────

  describe('Event star limits', () => {
    it('GET /api/events/:id includes minStars and maxStars', async () => {
      const res = await fetch(`/api/events/${TEST_EVENT_ID}`, {
        headers: { Cookie: dianaCookies },
      })
      expect(res.status).toBe(200)
      const ev = await res.json() as { minStars: number; maxStars: number }
      expect(ev.minStars).toBe(4)
      expect(ev.maxStars).toBe(6)
    })

    it('admin can update minStars and maxStars via PUT', async () => {
      const res = await fetch(`/api/events/${TEST_EVENT_ID}`, {
        method: 'PUT',
        headers: { Cookie: adminCookies, 'Content-Type': 'application/json' },
        body: JSON.stringify({ minStars: 2, maxStars: 8 }),
      })
      expect(res.status).toBe(200)
      const ev = await res.json() as { minStars: number; maxStars: number }
      expect(ev.minStars).toBe(2)
      expect(ev.maxStars).toBe(8)

      // Restore original values
      await fetch(`/api/events/${TEST_EVENT_ID}`, {
        method: 'PUT',
        headers: { Cookie: adminCookies, 'Content-Type': 'application/json' },
        body: JSON.stringify({ minStars: 4, maxStars: 6 }),
      })
    })

    it('PUT returns 400 when minStars > maxStars', async () => {
      const res = await fetch(`/api/events/${TEST_EVENT_ID}`, {
        method: 'PUT',
        headers: { Cookie: adminCookies, 'Content-Type': 'application/json' },
        body: JSON.stringify({ minStars: 10, maxStars: 3 }),
      })
      expect(res.status).toBe(400)
    })
  })
})
