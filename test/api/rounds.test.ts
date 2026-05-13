import { describe, it, expect, beforeAll } from 'vitest'
import { setup, fetch } from '@nuxt/test-utils/e2e'
import { fileURLToPath } from 'node:url'
import {
  migrateAndSeed,
  loginAs,
  ADMIN_EMAIL,
  REGULAR_USER_EMAIL,
  TEST_EVENT_ID,
  TEST_ROUND_DRAFT_ID,
  TEST_ROUND_ASSIGNED_ID,
  TEST_ROUND_OPEN_ID,
  TEST_ROUND_CLOSEABLE_ID,
  TEST_ROOM_WORKSHOP_ID,
  TEST_ROOM_MEETING_1_ID,
  TEST_SESSION_IN_ASSIGNED_ROUND_1,
  TEST_SESSION_IN_ASSIGNED_ROUND_2,
  TEST_SESSION_IN_ASSIGNED_ROUND_3,
  TEST_SESSION_IN_OPEN_ROUND_1,
  TEST_SESSION_IN_OPEN_ROUND_2,
  TEST_SESSION_STARRED_BY_DIANA_3,
} from './helpers'

const BASE = `/api/events/${TEST_EVENT_ID}/rounds`
const DRAFT_ROUND = `${BASE}/${TEST_ROUND_DRAFT_ID}`
const ASSIGNED_ROUND = `${BASE}/${TEST_ROUND_ASSIGNED_ID}`
const OPEN_ROUND = `${BASE}/${TEST_ROUND_OPEN_ID}`
const CLOSEABLE_ROUND = `${BASE}/${TEST_ROUND_CLOSEABLE_ID}`
// Slot from seed data (slot ab000000-…-000000000001 belongs to the assigned round)
const SEED_SLOT_ID = 'ab000000-0000-0000-0000-000000000001'
const SESSIONS_BASE = `/api/events/${TEST_EVENT_ID}/sessions`

describe('Rounds Endpoints', async () => {
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

  // ─── GET /rounds (list) ──────────────────────────────────────────────────

  describe('GET /api/events/[eventId]/rounds', () => {
    it('returns 401 for unauthenticated request', async () => {
      const res = await fetch(BASE)
      expect(res.status).toBe(401)
    })

    it('returns rounds list for event member', async () => {
      const res = await fetch(BASE, { headers: { Cookie: userCookies } })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(Array.isArray(body)).toBe(true)
      expect(body.length).toBeGreaterThanOrEqual(2)
    })

    it('returns rounds list for admin', async () => {
      const res = await fetch(BASE, { headers: { Cookie: adminCookies } })
      expect(res.status).toBe(200)
    })
  })

  // ─── POST /rounds (create) ───────────────────────────────────────────────

  describe('POST /api/events/[eventId]/rounds', () => {
    it('returns 401 for unauthenticated request', async () => {
      const res = await fetch(BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ duration: 60 }),
      })
      expect(res.status).toBe(401)
    })

    it('returns 403 for non-admin user', async () => {
      const res = await fetch(BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: userCookies },
        body: JSON.stringify({ duration: 60 }),
      })
      expect(res.status).toBe(403)
    })

    it('returns 400 when duration is missing', async () => {
      const res = await fetch(BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookies },
        body: JSON.stringify({ name: 'No duration' }),
      })
      expect(res.status).toBe(400)
    })

    it('returns 400 when duration is invalid', async () => {
      const res = await fetch(BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookies },
        body: JSON.stringify({ duration: -5 }),
      })
      expect(res.status).toBe(400)
    })

    it('returns 400 when minParticipants is negative', async () => {
      const res = await fetch(BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookies },
        body: JSON.stringify({ duration: 60, minParticipants: -1 }),
      })
      expect(res.status).toBe(400)
    })

    it('creates a round successfully and returns it', async () => {
      const res = await fetch(BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookies },
        body: JSON.stringify({ name: 'Test Round', duration: 90, minParticipants: 2 }),
      })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.id).toBeDefined()
      expect(body.name).toBe('Test Round')
      expect(body.duration).toBe(90)
      expect(body.minParticipants).toBe(2)
      expect(body.status).toBe('draft')
      expect(body.eventId).toBe(TEST_EVENT_ID)

      // Cleanup: delete the created round
      await fetch(`${BASE}/${body.id}`, {
        method: 'DELETE',
        headers: { Cookie: adminCookies },
      })
    })

    it('auto-enables all event rooms for newly created round', async () => {
      const res = await fetch(BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookies },
        body: JSON.stringify({ duration: 60 }),
      })
      const { id } = await res.json()

      const detailRes = await fetch(`${BASE}/${id}`, { headers: { Cookie: adminCookies } })
      const detail = await detailRes.json()
      expect(detail.enabledRooms.length).toBeGreaterThan(0)

      await fetch(`${BASE}/${id}`, { method: 'DELETE', headers: { Cookie: adminCookies } })
    })
  })

  // ─── GET /rounds/[roundId] (detail) ──────────────────────────────────────

  describe('GET /api/events/[eventId]/rounds/[roundId]', () => {
    it('returns 401 for unauthenticated request', async () => {
      const res = await fetch(DRAFT_ROUND)
      expect(res.status).toBe(401)
    })

    it('returns 404 for non-existent round', async () => {
      const res = await fetch(`${BASE}/00000000-0000-0000-0000-000000000000`, {
        headers: { Cookie: userCookies },
      })
      expect(res.status).toBe(404)
    })

    it('returns round detail with enabledRooms and slots', async () => {
      const res = await fetch(ASSIGNED_ROUND, { headers: { Cookie: userCookies } })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.id).toBe(TEST_ROUND_ASSIGNED_ID)
      expect(body.status).toBe('assigned')
      expect(Array.isArray(body.enabledRooms)).toBe(true)
      expect(Array.isArray(body.slots)).toBe(true)
      expect(body.slots.length).toBeGreaterThan(0)
    })
  })

  // ─── PUT /rounds/[roundId] (update) ──────────────────────────────────────

  describe('PUT /api/events/[eventId]/rounds/[roundId]', () => {
    it('returns 401 for unauthenticated request', async () => {
      const res = await fetch(DRAFT_ROUND, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Updated' }),
      })
      expect(res.status).toBe(401)
    })

    it('returns 403 for non-admin user', async () => {
      const res = await fetch(DRAFT_ROUND, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Cookie: userCookies },
        body: JSON.stringify({ name: 'Updated' }),
      })
      expect(res.status).toBe(403)
    })

    it('returns 404 for non-existent round', async () => {
      const res = await fetch(`${BASE}/00000000-0000-0000-0000-000000000000`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookies },
        body: JSON.stringify({ name: 'X' }),
      })
      expect(res.status).toBe(404)
    })

    it('updates round name and duration', async () => {
      const res = await fetch(DRAFT_ROUND, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookies },
        body: JSON.stringify({ name: 'Renamed Round', duration: 45 }),
      })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.name).toBe('Renamed Round')
      expect(body.duration).toBe(45)

      // Restore
      await fetch(DRAFT_ROUND, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookies },
        body: JSON.stringify({ name: 'Round 1 - Morning', duration: 75 }),
      })
    })

    it('returns 400 for invalid status value', async () => {
      const res = await fetch(DRAFT_ROUND, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookies },
        body: JSON.stringify({ status: 'invalid' }),
      })
      expect(res.status).toBe(400)
    })
  })

  // ─── DELETE /rounds/[roundId] ─────────────────────────────────────────────

  describe('DELETE /api/events/[eventId]/rounds/[roundId]', () => {
    it('returns 401 for unauthenticated request', async () => {
      const res = await fetch(DRAFT_ROUND, { method: 'DELETE' })
      expect(res.status).toBe(401)
    })

    it('returns 403 for non-admin user', async () => {
      const res = await fetch(DRAFT_ROUND, { method: 'DELETE', headers: { Cookie: userCookies } })
      expect(res.status).toBe(403)
    })

    it('deletes a round and confirms it is gone', async () => {
      // Create a throwaway round
      const create = await fetch(BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookies },
        body: JSON.stringify({ duration: 30 }),
      })
      const { id } = await create.json()

      const del = await fetch(`${BASE}/${id}`, { method: 'DELETE', headers: { Cookie: adminCookies } })
      expect(del.status).toBe(200)

      const check = await fetch(`${BASE}/${id}`, { headers: { Cookie: userCookies } })
      expect(check.status).toBe(404)
    })
  })

  // ─── PUT /rounds/[roundId]/rooms ──────────────────────────────────────────

  describe('PUT /api/events/[eventId]/rounds/[roundId]/rooms', () => {
    it('returns 401 for unauthenticated request', async () => {
      const res = await fetch(`${DRAFT_ROUND}/rooms`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomIds: [] }),
      })
      expect(res.status).toBe(401)
    })

    it('returns 403 for non-admin user', async () => {
      const res = await fetch(`${DRAFT_ROUND}/rooms`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Cookie: userCookies },
        body: JSON.stringify({ roomIds: [] }),
      })
      expect(res.status).toBe(403)
    })

    it('returns 400 when roomIds is not an array', async () => {
      const res = await fetch(`${DRAFT_ROUND}/rooms`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookies },
        body: JSON.stringify({ roomIds: 'not-an-array' }),
      })
      expect(res.status).toBe(400)
    })

    it('returns 400 for a room ID not belonging to this event', async () => {
      const res = await fetch(`${DRAFT_ROUND}/rooms`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookies },
        body: JSON.stringify({ roomIds: ['00000000-0000-0000-0000-000000000000'] }),
      })
      expect(res.status).toBe(400)
    })

    it('updates enabled rooms and returns the list', async () => {
      const res = await fetch(`${DRAFT_ROUND}/rooms`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookies },
        body: JSON.stringify({ roomIds: [TEST_ROOM_WORKSHOP_ID, TEST_ROOM_MEETING_1_ID] }),
      })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(Array.isArray(body)).toBe(true)
      const ids = body.map((r: { id: string }) => r.id).sort()
      expect(ids).toContain(TEST_ROOM_WORKSHOP_ID)
      expect(ids).toContain(TEST_ROOM_MEETING_1_ID)

      // Verify via round detail
      const detail = await fetch(DRAFT_ROUND, { headers: { Cookie: adminCookies } })
      const detailBody = await detail.json()
      expect(detailBody.enabledRooms.map((r: { id: string }) => r.id).sort()).toEqual(ids)
    })
  })

  // ─── POST /rounds/[roundId]/assign ────────────────────────────────────────

  describe('POST /api/events/[eventId]/rounds/[roundId]/assign', () => {
    it('returns 401 for unauthenticated request', async () => {
      const res = await fetch(`${DRAFT_ROUND}/assign`, { method: 'POST' })
      expect(res.status).toBe(401)
    })

    it('returns 403 for non-admin user', async () => {
      const res = await fetch(`${DRAFT_ROUND}/assign`, { method: 'POST', headers: { Cookie: userCookies } })
      expect(res.status).toBe(403)
    })

    it('runs assignment and returns round with status=assigned', async () => {
      // Create a fresh round for this test so we don't corrupt seed data
      const create = await fetch(BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookies },
        body: JSON.stringify({ duration: 75, minParticipants: 0 }),
      })
      const { id } = await create.json()

      const assign = await fetch(`${BASE}/${id}/assign`, {
        method: 'POST',
        headers: { Cookie: adminCookies },
      })
      expect(assign.status).toBe(200)
      const body = await assign.json()
      expect(body.status).toBe('assigned')

      // Verify slots were created with sessions and participants assigned
      const detail = await fetch(`${BASE}/${id}`, { headers: { Cookie: adminCookies } })
      const detailBody = await detail.json()
      expect(detailBody.slots.length).toBeGreaterThan(0)
      const assignedSlots = detailBody.slots.filter((s: { sessionId: string | null }) => s.sessionId !== null)
      expect(assignedSlots.length).toBeGreaterThan(0)
      expect(typeof assignedSlots[0].session.starCount).toBe('number')
      const slotsWithParticipants = detailBody.slots.filter((s: { registrations: unknown[] }) => s.registrations.length > 0)
      expect(slotsWithParticipants.length).toBeGreaterThan(0)

      await fetch(`${BASE}/${id}`, { method: 'DELETE', headers: { Cookie: adminCookies } })
    })
  })

  // ─── GET /rounds/[roundId]/schedule ──────────────────────────────────────

  describe('GET /api/events/[eventId]/rounds/[roundId]/schedule', () => {
    it('returns 401 for unauthenticated request', async () => {
      const res = await fetch(`${ASSIGNED_ROUND}/schedule`)
      expect(res.status).toBe(401)
    })

    it('returns an array for an authenticated event member', async () => {
      const res = await fetch(`${ASSIGNED_ROUND}/schedule`, { headers: { Cookie: userCookies } })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(Array.isArray(body)).toBe(true)
    })
  })

  // ─── GET /rounds/[roundId]/available ─────────────────────────────────────

  describe('GET /api/events/[eventId]/rounds/[roundId]/available', () => {
    it('returns 401 for unauthenticated request', async () => {
      const res = await fetch(`${ASSIGNED_ROUND}/available`)
      expect(res.status).toBe(401)
    })

    it('returns 403 for draft round', async () => {
      const res = await fetch(`${DRAFT_ROUND}/available`, { headers: { Cookie: userCookies } })
      expect(res.status).toBe(403)
    })

    it('returns available slots with seatsLeft for assigned/open round', async () => {
      const res = await fetch(`${ASSIGNED_ROUND}/available`, { headers: { Cookie: userCookies } })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(Array.isArray(body)).toBe(true)
      if (body.length > 0) {
        expect(body[0]).toHaveProperty('seatsLeft')
        expect(body[0].seatsLeft).toBeGreaterThan(0)
      }
    })
  })

  // ─── POST + DELETE /rounds/[roundId]/slots/[slotId]/register ─────────────

  describe('Slot registration (POST + DELETE)', () => {
    const REGISTER_URL = `${ASSIGNED_ROUND}/slots/${SEED_SLOT_ID}/register`

    it('returns 401 for unauthenticated POST', async () => {
      const res = await fetch(REGISTER_URL, { method: 'POST' })
      expect(res.status).toBe(401)
    })

    it('returns 401 for unauthenticated DELETE', async () => {
      const res = await fetch(REGISTER_URL, { method: 'DELETE' })
      expect(res.status).toBe(401)
    })

    it('allows a participant to register for and then cancel a slot', async () => {
      // Use a participant who is NOT already seeded in the seed data for this slot
      // The seed only has b0000000-…-010 (diana) and b0000000-…-011 in slot h0000000-…-001
      // Use a third user: noah (participant)
      const noahEmail = 'noah.williams@example.com'
      const noahCookies = await loginAs(fetch, noahEmail)

      const reg = await fetch(REGISTER_URL, { method: 'POST', headers: { Cookie: noahCookies } })
      expect(reg.status).toBe(200)

      // Verify via available: seatsLeft should decrease
      const avail = await fetch(`${ASSIGNED_ROUND}/available`, { headers: { Cookie: noahCookies } })
      const availBody = await avail.json()
      const slot = availBody.find((s: { slotId: string }) => s.slotId === SEED_SLOT_ID)
      // After registering, this slot should no longer appear in available (user is now booked)
      expect(slot).toBeUndefined()

      // Cancel
      const cancel = await fetch(REGISTER_URL, { method: 'DELETE', headers: { Cookie: noahCookies } })
      expect(cancel.status).toBe(200)
    })

    it('returns 409 when already registered for the slot', async () => {
      const noahEmail = 'noah.williams@example.com'
      const noahCookies = await loginAs(fetch, noahEmail)

      await fetch(REGISTER_URL, { method: 'POST', headers: { Cookie: noahCookies } })
      const dup = await fetch(REGISTER_URL, { method: 'POST', headers: { Cookie: noahCookies } })
      expect(dup.status).toBe(409)

      // Cleanup
      await fetch(REGISTER_URL, { method: 'DELETE', headers: { Cookie: noahCookies } })
    })

    it('returns 404 for DELETE when not registered', async () => {
      const noahEmail = 'noah.williams@example.com'
      const noahCookies = await loginAs(fetch, noahEmail)
      const res = await fetch(REGISTER_URL, { method: 'DELETE', headers: { Cookie: noahCookies } })
      expect(res.status).toBe(404)
    })
  })

  // ─── Session status cascade on round status change ────────────────────────

  describe('Session status cascade on round status transitions', () => {
    it('marks assigned sessions as scheduled when round transitions to open', async () => {
      // Round 2 (assigned) has 3 sessions: d-002 (published), d-007 (scheduled), d-008 (published)
      const res = await fetch(ASSIGNED_ROUND, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookies },
        body: JSON.stringify({ status: 'open' }),
      })
      expect(res.status).toBe(200)
      expect((await res.json()).status).toBe('open')

      // All sessions in the round's slots should now be 'scheduled'
      for (const sessionId of [
        TEST_SESSION_IN_ASSIGNED_ROUND_1,
        TEST_SESSION_IN_ASSIGNED_ROUND_2,
        TEST_SESSION_IN_ASSIGNED_ROUND_3,
      ]) {
        const sessionRes = await fetch(`${SESSIONS_BASE}/${sessionId}`, {
          headers: { Cookie: adminCookies },
        })
        expect(sessionRes.status).toBe(200)
        expect((await sessionRes.json()).status).toBe('scheduled')
      }

      // Restore: transition round back to assigned (no session cascade)
      await fetch(ASSIGNED_ROUND, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookies },
        body: JSON.stringify({ status: 'assigned' }),
      })
      // Restore sessions that were originally 'published'
      for (const sessionId of [TEST_SESSION_IN_ASSIGNED_ROUND_1, TEST_SESSION_IN_ASSIGNED_ROUND_3]) {
        await fetch(`${SESSIONS_BASE}/${sessionId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Cookie: adminCookies },
          body: JSON.stringify({ status: 'published' }),
        })
      }
    })

    it('marks assigned sessions as delivered when round transitions to closed', async () => {
      // Round 3 (open) has 2 sessions: d-009 (scheduled), d-012 (scheduled)
      const res = await fetch(OPEN_ROUND, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookies },
        body: JSON.stringify({ status: 'closed' }),
      })
      expect(res.status).toBe(200)
      expect((await res.json()).status).toBe('closed')

      for (const sessionId of [TEST_SESSION_IN_OPEN_ROUND_1, TEST_SESSION_IN_OPEN_ROUND_2]) {
        const sessionRes = await fetch(`${SESSIONS_BASE}/${sessionId}`, {
          headers: { Cookie: adminCookies },
        })
        expect(sessionRes.status).toBe(200)
        expect((await sessionRes.json()).status).toBe('delivered')
      }

      // Restore: transition round back to open, which re-marks sessions as scheduled
      await fetch(OPEN_ROUND, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookies },
        body: JSON.stringify({ status: 'open' }),
      })
    })

    it('does not re-trigger session updates when round status is unchanged', async () => {
      // PUT round 3 with same status 'open' — sessions should remain 'scheduled'
      const res = await fetch(OPEN_ROUND, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookies },
        body: JSON.stringify({ status: 'open' }),
      })
      expect(res.status).toBe(200)
      // Sessions should still be scheduled (no duplicate delivery)
      for (const sessionId of [TEST_SESSION_IN_OPEN_ROUND_1, TEST_SESSION_IN_OPEN_ROUND_2]) {
        const sessionRes = await fetch(`${SESSIONS_BASE}/${sessionId}`, {
          headers: { Cookie: adminCookies },
        })
        expect((await sessionRes.json()).status).toBe('scheduled')
      }
    })
  })

  // ─── Close round: star deduction ─────────────────────────────────────────────

  describe('PUT /rounds/[roundId] — closing deducts stars for attended sessions', () => {
    // Seed fixture: Round 4 (aa000000-…-000000000004, status "open") has one slot
    // (ab000000-…-000000000020, session d007). Diana (b010) is registered in that
    // slot and has a star for session d007 (TEST_SESSION_STARRED_BY_DIANA_3).

    it('diana has the star for session d007 before round is closed', async () => {
      const res = await fetch(SESSIONS_BASE, { headers: { Cookie: userCookies } })
      expect(res.status).toBe(200)
      const list = await res.json() as Array<{ id: string; isStarred: boolean }>
      const session = list.find(s => s.id === TEST_SESSION_STARRED_BY_DIANA_3)
      expect(session?.isStarred).toBe(true)
    })

    it('returns 403 for non-admin trying to close a round', async () => {
      const res = await fetch(CLOSEABLE_ROUND, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Cookie: userCookies },
        body: JSON.stringify({ status: 'closed' }),
      })
      expect(res.status).toBe(403)
    })

    it('admin closes the round and response has status=closed', async () => {
      const res = await fetch(CLOSEABLE_ROUND, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookies },
        body: JSON.stringify({ status: 'closed' }),
      })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.status).toBe('closed')
    })

    it('diana loses her star for session d007 after the round is closed', async () => {
      const res = await fetch(`${SESSIONS_BASE}?includeDelivered=true`, { headers: { Cookie: userCookies } })
      expect(res.status).toBe(200)
      const list = await res.json() as Array<{ id: string; isStarred: boolean; starCount: number }>
      const session = list.find(s => s.id === TEST_SESSION_STARRED_BY_DIANA_3)
      expect(session?.isStarred).toBe(false)
    })

    it('diana retains stars for sessions she was NOT assigned to in the closed round', async () => {
      const res = await fetch(SESSIONS_BASE, { headers: { Cookie: userCookies } })
      const list = await res.json() as Array<{ id: string; isStarred: boolean }>
      // Diana was not assigned to d002, d003, or d008 in round 4 — stars must remain
      const d002 = list.find(s => s.id === 'd0000000-0000-0000-0000-000000000002')
      const d003 = list.find(s => s.id === 'd0000000-0000-0000-0000-000000000003')
      const d008 = list.find(s => s.id === 'd0000000-0000-0000-0000-000000000008')
      expect(d002?.isStarred).toBe(true)
      expect(d003?.isStarred).toBe(true)
      expect(d008?.isStarred).toBe(true)
    })

    it('closing an already-closed round remains idempotent', async () => {
      // Re-starring a delivered session is not allowed
      const restarRes = await fetch(`${SESSIONS_BASE}/d0000000-0000-0000-0000-000000000007/star`, {
        method: 'POST',
        headers: { Cookie: userCookies },
      })
      expect(restarRes.status).toBe(400)

      // Close again — should be idempotent (round is already closed) and keep unrelated stars
      const closeAgainRes = await fetch(CLOSEABLE_ROUND, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookies },
        body: JSON.stringify({ status: 'closed' }),
      })
      expect(closeAgainRes.status).toBe(200)

      // Existing stars on sessions not part of this round must remain
      const res = await fetch(SESSIONS_BASE, { headers: { Cookie: userCookies } })
      const list = await res.json() as Array<{ id: string; isStarred: boolean }>
      const session = list.find(s => s.id === 'd0000000-0000-0000-0000-000000000002')
      expect(session?.isStarred).toBe(true)
    })
  })
})
