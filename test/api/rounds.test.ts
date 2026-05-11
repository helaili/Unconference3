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
  TEST_ROOM_WORKSHOP_ID,
  TEST_ROOM_MEETING_1_ID,
} from './helpers'

const BASE = `/api/events/${TEST_EVENT_ID}/rounds`
const DRAFT_ROUND = `${BASE}/${TEST_ROUND_DRAFT_ID}`
const ASSIGNED_ROUND = `${BASE}/${TEST_ROUND_ASSIGNED_ID}`
// Slot from seed data (slot ab000000-…-000000000001 belongs to the assigned round)
const SEED_SLOT_ID = 'ab000000-0000-0000-0000-000000000001'

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
        body: JSON.stringify({ duration: 75, minParticipants: 1 }),
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
})
