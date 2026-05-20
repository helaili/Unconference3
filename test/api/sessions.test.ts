import { describe, it, expect, beforeAll } from 'vitest'
import { setup, fetch } from '@nuxt/test-utils/e2e'
import { fileURLToPath } from 'node:url'
import {
  migrateAndSeed,
  loginAs,
  ADMIN_EMAIL,
  REGULAR_USER_EMAIL,
  STAFF_USER_EMAIL,
  PARTICIPANT_USER_EMAIL,
  OUTSIDER_EMAIL,
  TEST_EVENT_ID,
  TEST_SESSION_PROPOSED_BY_DIANA_ID,
  TEST_SESSION_PUBLISHED_ID,
  TEST_SESSION_SCHEDULED_ID,
  TEST_SESSION_DELIVERED_ID,
  TEST_SESSION_PROPOSED_BY_NOAH_ID,
  TEST_SESSION_STAFF_PUBLISHED_ID,
} from './helpers'

const BASE = `/api/events/${TEST_EVENT_ID}/sessions`

describe('Sessions Endpoints', async () => {
  let adminCookies: string
  let dianaCookies: string   // moderator
  let staffCookies: string   // staff
  let noahCookies: string    // participant

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
    staffCookies = await loginAs(fetch, STAFF_USER_EMAIL)
    noahCookies = await loginAs(fetch, PARTICIPANT_USER_EMAIL)
  })

  // ─── GET /sessions (list) ────────────────────────────────────────────────

  describe('GET /api/events/[eventId]/sessions', () => {
    it('returns 401 for unauthenticated request', async () => {
      const res = await fetch(BASE)
      expect(res.status).toBe(401)
    })

    it('returns 403 for user not in the event', async () => {
      // testuser (test@example.com) is not an invitee of the test event
      const outsiderCookies = await loginAs(fetch, OUTSIDER_EMAIL)
      const res = await fetch(BASE, { headers: { Cookie: outsiderCookies } })
      expect(res.status).toBe(403)
    })

    it('participant sees published and scheduled sessions by default', async () => {
      const res = await fetch(BASE, { headers: { Cookie: noahCookies } })
      expect(res.status).toBe(200)
      const list = await res.json() as Array<{ id: string; status: string }>
      const statuses = new Set(list.map(s => s.status))
      expect(statuses.has('published')).toBe(true)
      expect(statuses.has('scheduled')).toBe(true)
      expect(statuses.has('delivered')).toBe(false)
    })

    it("participant sees their own proposed session in the default list", async () => {
      const res = await fetch(BASE, { headers: { Cookie: noahCookies } })
      expect(res.status).toBe(200)
      const list = await res.json() as Array<{ id: string; status: string }>
      const noahSession = list.find(s => s.id === TEST_SESSION_PROPOSED_BY_NOAH_ID)
      expect(noahSession).toBeDefined()
      expect(noahSession!.status).toBe('proposed')
    })

    it("participant does NOT see another user's proposed session", async () => {
      const res = await fetch(BASE, { headers: { Cookie: noahCookies } })
      const list = await res.json() as Array<{ id: string }>
      const dianaProposed = list.find(s => s.id === TEST_SESSION_PROPOSED_BY_DIANA_ID)
      expect(dianaProposed).toBeUndefined()
    })

    it('participant sees delivered sessions when ?includeDelivered=true', async () => {
      const res = await fetch(`${BASE}?includeDelivered=true`, { headers: { Cookie: noahCookies } })
      expect(res.status).toBe(200)
      const list = await res.json() as Array<{ id: string; status: string }>
      const delivered = list.find(s => s.id === TEST_SESSION_DELIVERED_ID)
      expect(delivered).toBeDefined()
    })

    it('participant can filter by explicit status', async () => {
      const res = await fetch(`${BASE}?status=delivered`, { headers: { Cookie: noahCookies } })
      expect(res.status).toBe(200)
      const list = await res.json() as Array<{ status: string }>
      expect(list.every(s => s.status === 'delivered')).toBe(true)
    })

    it('admin sees all sessions including proposed', async () => {
      const res = await fetch(BASE, { headers: { Cookie: adminCookies } })
      expect(res.status).toBe(200)
      const list = await res.json() as Array<{ status: string }>
      const statuses = new Set(list.map(s => s.status))
      expect(statuses.has('proposed')).toBe(true)
      expect(statuses.has('published')).toBe(true)
      expect(statuses.has('scheduled')).toBe(true)
      expect(statuses.has('delivered')).toBe(true)
    })

    it('staff sees all sessions', async () => {
      const res = await fetch(BASE, { headers: { Cookie: staffCookies } })
      expect(res.status).toBe(200)
      const list = await res.json() as Array<{ status: string }>
      const statuses = new Set(list.map(s => s.status))
      expect(statuses.has('proposed')).toBe(true)
    })
  })

  // ─── POST /sessions (create) ─────────────────────────────────────────────

  describe('POST /api/events/[eventId]/sessions', () => {
    it('returns 401 for unauthenticated request', async () => {
      const res = await fetch(BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'New Talk' }),
      })
      expect(res.status).toBe(401)
    })

    it('returns 400 when title is missing', async () => {
      const res = await fetch(BASE, {
        method: 'POST',
        headers: { Cookie: dianaCookies, 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: 'No title' }),
      })
      expect(res.status).toBe(400)
    })

    it('participant can create a session with default status "proposed"', async () => {
      const res = await fetch(BASE, {
        method: 'POST',
        headers: { Cookie: noahCookies, 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Noah New Talk', tags: ['test'] }),
      })
      expect(res.status).toBe(200)
      const created = await res.json() as { id: string; status: string; title: string }
      expect(created.status).toBe('proposed')
      expect(created.title).toBe('Noah New Talk')

      // Cleanup: delete the created session
      await fetch(`${BASE}/${created.id}`, {
        method: 'DELETE',
        headers: { Cookie: noahCookies },
      })
    })

    it('participant cannot set initial status to non-proposed', async () => {
      const res = await fetch(BASE, {
        method: 'POST',
        headers: { Cookie: noahCookies, 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Sneaky Session', status: 'published' }),
      })
      expect(res.status).toBe(403)
    })

    it('admin can create a session with any initial status', async () => {
      const res = await fetch(BASE, {
        method: 'POST',
        headers: { Cookie: adminCookies, 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Admin Published Session', status: 'published' }),
      })
      expect(res.status).toBe(200)
      const created = await res.json() as { id: string; status: string }
      expect(created.status).toBe('published')

      // Cleanup
      await fetch(`${BASE}/${created.id}`, {
        method: 'DELETE',
        headers: { Cookie: adminCookies },
      })
    })

    it('returns 403 when event submission is restricted and user is a participant', async () => {
      // First restrict the event
      await fetch(`/api/events/${TEST_EVENT_ID}`, {
        method: 'PUT',
        headers: { Cookie: adminCookies, 'Content-Type': 'application/json' },
        body: JSON.stringify({ submissionRestricted: true }),
      })

      const res = await fetch(BASE, {
        method: 'POST',
        headers: { Cookie: noahCookies, 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Restricted Event Talk' }),
      })
      expect(res.status).toBe(403)

      // Restore
      await fetch(`/api/events/${TEST_EVENT_ID}`, {
        method: 'PUT',
        headers: { Cookie: adminCookies, 'Content-Type': 'application/json' },
        body: JSON.stringify({ submissionRestricted: false }),
      })
    })

    it('staff can submit when event submission is restricted', async () => {
      // Restrict the event
      await fetch(`/api/events/${TEST_EVENT_ID}`, {
        method: 'PUT',
        headers: { Cookie: adminCookies, 'Content-Type': 'application/json' },
        body: JSON.stringify({ submissionRestricted: true }),
      })

      const res = await fetch(BASE, {
        method: 'POST',
        headers: { Cookie: staffCookies, 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Staff Restricted Talk' }),
      })
      expect(res.status).toBe(200)
      const created = await res.json() as { id: string }

      // Cleanup + restore
      await fetch(`${BASE}/${created.id}`, {
        method: 'DELETE',
        headers: { Cookie: adminCookies },
      })
      await fetch(`/api/events/${TEST_EVENT_ID}`, {
        method: 'PUT',
        headers: { Cookie: adminCookies, 'Content-Type': 'application/json' },
        body: JSON.stringify({ submissionRestricted: false }),
      })
    })
  })

  // ─── GET /sessions/[sessionId] ────────────────────────────────────────────

  describe('GET /api/events/[eventId]/sessions/[sessionId]', () => {
    it('returns 401 for unauthenticated request', async () => {
      const res = await fetch(`${BASE}/${TEST_SESSION_PUBLISHED_ID}`)
      expect(res.status).toBe(401)
    })

    it('returns 200 for a published session', async () => {
      const res = await fetch(`${BASE}/${TEST_SESSION_PUBLISHED_ID}`, {
        headers: { Cookie: noahCookies },
      })
      expect(res.status).toBe(200)
      const session = await res.json() as { id: string; status: string }
      expect(session.id).toBe(TEST_SESSION_PUBLISHED_ID)
      expect(session.status).toBe('published')
    })

    it('returns 403 when participant tries to fetch another user\'s proposed session', async () => {
      const res = await fetch(`${BASE}/${TEST_SESSION_PROPOSED_BY_DIANA_ID}`, {
        headers: { Cookie: noahCookies },
      })
      expect(res.status).toBe(403)
    })

    it('returns 200 when author fetches their own proposed session', async () => {
      const res = await fetch(`${BASE}/${TEST_SESSION_PROPOSED_BY_DIANA_ID}`, {
        headers: { Cookie: dianaCookies },
      })
      expect(res.status).toBe(200)
      const session = await res.json() as { id: string }
      expect(session.id).toBe(TEST_SESSION_PROPOSED_BY_DIANA_ID)
    })

    it('returns 404 for non-existent session', async () => {
      const res = await fetch(`${BASE}/00000000-0000-0000-0000-000000000000`, {
        headers: { Cookie: adminCookies },
      })
      expect(res.status).toBe(404)
    })

    it('admin sees any session including proposed', async () => {
      const res = await fetch(`${BASE}/${TEST_SESSION_PROPOSED_BY_DIANA_ID}`, {
        headers: { Cookie: adminCookies },
      })
      expect(res.status).toBe(200)
    })
  })

  // ─── PUT /sessions/[sessionId] ────────────────────────────────────────────

  describe('PUT /api/events/[eventId]/sessions/[sessionId]', () => {
    it('returns 401 for unauthenticated request', async () => {
      const res = await fetch(`${BASE}/${TEST_SESSION_PUBLISHED_ID}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Hacked' }),
      })
      expect(res.status).toBe(401)
    })

    it('returns 403 when non-author participant tries to edit', async () => {
      // noah tries to edit diana's published session
      const res = await fetch(`${BASE}/${TEST_SESSION_PUBLISHED_ID}`, {
        method: 'PUT',
        headers: { Cookie: noahCookies, 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Hacked by Noah' }),
      })
      expect(res.status).toBe(403)
    })

    it('author (moderator) can edit their own proposed session', async () => {
      const res = await fetch(`${BASE}/${TEST_SESSION_PROPOSED_BY_DIANA_ID}`, {
        method: 'PUT',
        headers: { Cookie: dianaCookies, 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Updated by Diana' }),
      })
      expect(res.status).toBe(200)
      const updated = await res.json() as { title: string }
      expect(updated.title).toBe('Updated by Diana')

      // Restore
      await fetch(`${BASE}/${TEST_SESSION_PROPOSED_BY_DIANA_ID}`, {
        method: 'PUT',
        headers: { Cookie: dianaCookies, 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Introduction to Unconferencing' }),
      })
    })

    it('participant author can edit their own proposed session', async () => {
      const res = await fetch(`${BASE}/${TEST_SESSION_PROPOSED_BY_NOAH_ID}`, {
        method: 'PUT',
        headers: { Cookie: noahCookies, 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: 'Updated description' }),
      })
      expect(res.status).toBe(200)

      // Restore
      await fetch(`${BASE}/${TEST_SESSION_PROPOSED_BY_NOAH_ID}`, {
        method: 'PUT',
        headers: { Cookie: noahCookies, 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: 'A proposed session from a participant.' }),
      })
    })

    it('participant author cannot change status', async () => {
      const res = await fetch(`${BASE}/${TEST_SESSION_PROPOSED_BY_NOAH_ID}`, {
        method: 'PUT',
        headers: { Cookie: noahCookies, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'published' }),
      })
      expect(res.status).toBe(403)
    })

    it('?status=proposed only returns the calling participant\'s own proposed sessions', async () => {
      const res = await fetch(`${BASE}?status=proposed`, { headers: { Cookie: noahCookies } })
      expect(res.status).toBe(200)
      const list = await res.json() as Array<{ id: string; status: string }>
      // Every returned session must be proposed
      for (const s of list) {
        expect(s.status).toBe('proposed')
      }
      // Diana's proposed session must NOT appear
      expect(list.find(s => s.id === TEST_SESSION_PROPOSED_BY_DIANA_ID)).toBeUndefined()
      // Noah's proposed session MUST appear
      expect(list.find(s => s.id === TEST_SESSION_PROPOSED_BY_NOAH_ID)).toBeDefined()
    })

    it('participant author cannot edit their own session once status is no longer proposed', async () => {
      // Create a session as noah (participant)
      const createRes = await fetch(BASE, {
        method: 'POST',
        headers: { Cookie: noahCookies, 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Noah Will Be Locked Out' }),
      })
      expect(createRes.status).toBe(200)
      const created = await createRes.json() as { id: string; status: string }
      expect(created.status).toBe('proposed')

      // Admin publishes it
      await fetch(`${BASE}/${created.id}`, {
        method: 'PUT',
        headers: { Cookie: adminCookies, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'published' }),
      })

      // Noah (participant author) can no longer edit his own session
      const editRes = await fetch(`${BASE}/${created.id}`, {
        method: 'PUT',
        headers: { Cookie: noahCookies, 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: 'Sneaky edit after publish' }),
      })
      expect(editRes.status).toBe(403)

      // Cleanup
      await fetch(`${BASE}/${created.id}`, {
        method: 'DELETE',
        headers: { Cookie: adminCookies },
      })
    })

    it('admin can change status', async () => {
      const res = await fetch(`${BASE}/${TEST_SESSION_PROPOSED_BY_DIANA_ID}`, {
        method: 'PUT',
        headers: { Cookie: adminCookies, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'published' }),
      })
      expect(res.status).toBe(200)
      const updated = await res.json() as { status: string }
      expect(updated.status).toBe('published')

      // Restore
      await fetch(`${BASE}/${TEST_SESSION_PROPOSED_BY_DIANA_ID}`, {
        method: 'PUT',
        headers: { Cookie: adminCookies, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'proposed' }),
      })
    })

    it('returns 400 for invalid status value', async () => {
      const res = await fetch(`${BASE}/${TEST_SESSION_PROPOSED_BY_DIANA_ID}`, {
        method: 'PUT',
        headers: { Cookie: adminCookies, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'invalid-status' }),
      })
      expect(res.status).toBe(400)
    })

    it('returns 404 for non-existent session', async () => {
      const res = await fetch(`${BASE}/00000000-0000-0000-0000-000000000000`, {
        method: 'PUT',
        headers: { Cookie: adminCookies, 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Ghost' }),
      })
      expect(res.status).toBe(404)
    })
  })

  // ─── DELETE /sessions/[sessionId] ────────────────────────────────────────

  describe('DELETE /api/events/[eventId]/sessions/[sessionId]', () => {
    it('returns 401 for unauthenticated request', async () => {
      const res = await fetch(`${BASE}/${TEST_SESSION_PROPOSED_BY_NOAH_ID}`, {
        method: 'DELETE',
      })
      expect(res.status).toBe(401)
    })

    it('returns 403 when non-author tries to delete', async () => {
      const res = await fetch(`${BASE}/${TEST_SESSION_PROPOSED_BY_DIANA_ID}`, {
        method: 'DELETE',
        headers: { Cookie: noahCookies },
      })
      expect(res.status).toBe(403)
    })

    it('participant author cannot delete a non-proposed session', async () => {
      // Diana's published session is authored by diana, not noah
      // We need a participant-authored non-proposed session — create one and publish as admin
      const createRes = await fetch(BASE, {
        method: 'POST',
        headers: { Cookie: noahCookies, 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'To Be Locked' }),
      })
      const created = await createRes.json() as { id: string }

      await fetch(`${BASE}/${created.id}`, {
        method: 'PUT',
        headers: { Cookie: adminCookies, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'published' }),
      })

      const deleteRes = await fetch(`${BASE}/${created.id}`, {
        method: 'DELETE',
        headers: { Cookie: noahCookies },
      })
      expect(deleteRes.status).toBe(403)

      // Cleanup
      await fetch(`${BASE}/${created.id}`, {
        method: 'DELETE',
        headers: { Cookie: adminCookies },
      })
    })

    it('author can delete their own proposed session, and GET confirms deletion', async () => {
      // Create a session to delete
      const createRes = await fetch(BASE, {
        method: 'POST',
        headers: { Cookie: noahCookies, 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'To Be Deleted' }),
      })
      const created = await createRes.json() as { id: string }

      const deleteRes = await fetch(`${BASE}/${created.id}`, {
        method: 'DELETE',
        headers: { Cookie: noahCookies },
      })
      expect(deleteRes.status).toBe(200)

      // Confirm deletion
      const getRes = await fetch(`${BASE}/${created.id}`, {
        headers: { Cookie: noahCookies },
      })
      expect(getRes.status).toBe(404)
    })

    it('admin can delete any session', async () => {
      const createRes = await fetch(BASE, {
        method: 'POST',
        headers: { Cookie: adminCookies, 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Admin Will Delete This', status: 'published' }),
      })
      const created = await createRes.json() as { id: string }

      const deleteRes = await fetch(`${BASE}/${created.id}`, {
        method: 'DELETE',
        headers: { Cookie: adminCookies },
      })
      expect(deleteRes.status).toBe(200)
    })

    it('returns 404 for non-existent session', async () => {
      const res = await fetch(`${BASE}/00000000-0000-0000-0000-000000000000`, {
        method: 'DELETE',
        headers: { Cookie: adminCookies },
      })
      expect(res.status).toBe(404)
    })
  })

  // ─── Event submissionRestricted flag ─────────────────────────────────────

  describe('Event submissionRestricted flag', () => {
    it('admin can set submissionRestricted on an event', async () => {
      const res = await fetch(`/api/events/${TEST_EVENT_ID}`, {
        method: 'PUT',
        headers: { Cookie: adminCookies, 'Content-Type': 'application/json' },
        body: JSON.stringify({ submissionRestricted: true }),
      })
      expect(res.status).toBe(200)
      const updated = await res.json() as { submissionRestricted: boolean }
      expect(updated.submissionRestricted).toBe(true)

      // Restore
      await fetch(`/api/events/${TEST_EVENT_ID}`, {
        method: 'PUT',
        headers: { Cookie: adminCookies, 'Content-Type': 'application/json' },
        body: JSON.stringify({ submissionRestricted: false }),
      })
    })
  })

  // ─── Session type (discussion vs workshop) ───────────────────────────────

  describe('Session type: POST enforcement', () => {
    it('sessions have a type field in list response', async () => {
      const res = await fetch(BASE, { headers: { Cookie: adminCookies } })
      expect(res.status).toBe(200)
      const list = await res.json() as Array<{ id: string; type: string }>
      for (const s of list) {
        expect(['discussion', 'workshop']).toContain(s.type)
      }
    })

    it('participant cannot create a workshop session', async () => {
      const res = await fetch(BASE, {
        method: 'POST',
        headers: { Cookie: noahCookies, 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Unauthorized Workshop', type: 'workshop' }),
      })
      expect(res.status).toBe(403)
    })

    it('staff can create a workshop session', async () => {
      const res = await fetch(BASE, {
        method: 'POST',
        headers: { Cookie: staffCookies, 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Staff Workshop', type: 'workshop' }),
      })
      expect(res.status).toBe(200)
      const created = await res.json() as { id: string; type: string }
      expect(created.type).toBe('workshop')

      // Cleanup
      await fetch(`${BASE}/${created.id}`, {
        method: 'DELETE',
        headers: { Cookie: adminCookies },
      })
    })

    it('admin can create a workshop session', async () => {
      const res = await fetch(BASE, {
        method: 'POST',
        headers: { Cookie: adminCookies, 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Admin Workshop', type: 'workshop' }),
      })
      expect(res.status).toBe(200)
      const created = await res.json() as { id: string; type: string }
      expect(created.type).toBe('workshop')

      // Cleanup
      await fetch(`${BASE}/${created.id}`, {
        method: 'DELETE',
        headers: { Cookie: adminCookies },
      })
    })

    it('participant creates a discussion session by default', async () => {
      const res = await fetch(BASE, {
        method: 'POST',
        headers: { Cookie: noahCookies, 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Default Type Session' }),
      })
      expect(res.status).toBe(200)
      const created = await res.json() as { id: string; type: string }
      expect(created.type).toBe('discussion')

      // Cleanup
      await fetch(`${BASE}/${created.id}`, {
        method: 'DELETE',
        headers: { Cookie: noahCookies },
      })
    })

    it('returns 400 for invalid type value', async () => {
      const res = await fetch(BASE, {
        method: 'POST',
        headers: { Cookie: adminCookies, 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Bad Type', type: 'lecture' }),
      })
      expect(res.status).toBe(400)
    })
  })

  describe('Session type: PUT enforcement', () => {
    it('participant cannot change type to workshop', async () => {
      const res = await fetch(`${BASE}/${TEST_SESSION_PROPOSED_BY_NOAH_ID}`, {
        method: 'PUT',
        headers: { Cookie: noahCookies, 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'workshop' }),
      })
      expect(res.status).toBe(403)
    })

    it('moderator author cannot change type to workshop', async () => {
      // Diana is a moderator and author of TEST_SESSION_PROPOSED_BY_DIANA_ID
      const res = await fetch(`${BASE}/${TEST_SESSION_PROPOSED_BY_DIANA_ID}`, {
        method: 'PUT',
        headers: { Cookie: dianaCookies, 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'workshop' }),
      })
      expect(res.status).toBe(403)
    })

    it('admin can change type to workshop', async () => {
      const res = await fetch(`${BASE}/${TEST_SESSION_PROPOSED_BY_DIANA_ID}`, {
        method: 'PUT',
        headers: { Cookie: adminCookies, 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'workshop' }),
      })
      expect(res.status).toBe(200)
      const updated = await res.json() as { type: string }
      expect(updated.type).toBe('workshop')

      // Restore
      await fetch(`${BASE}/${TEST_SESSION_PROPOSED_BY_DIANA_ID}`, {
        method: 'PUT',
        headers: { Cookie: adminCookies, 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'discussion' }),
      })
    })

    it('staff can change type to workshop', async () => {
      const res = await fetch(`${BASE}/${TEST_SESSION_STAFF_PUBLISHED_ID}`, {
        method: 'PUT',
        headers: { Cookie: staffCookies, 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'discussion' }),
      })
      expect(res.status).toBe(200)
      const updated = await res.json() as { type: string }
      expect(updated.type).toBe('discussion')

      // Restore
      await fetch(`${BASE}/${TEST_SESSION_STAFF_PUBLISHED_ID}`, {
        method: 'PUT',
        headers: { Cookie: adminCookies, 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'workshop' }),
      })
    })

    it('returns 400 for invalid type value', async () => {
      const res = await fetch(`${BASE}/${TEST_SESSION_PROPOSED_BY_DIANA_ID}`, {
        method: 'PUT',
        headers: { Cookie: adminCookies, 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'lecture' }),
      })
      expect(res.status).toBe(400)
    })
  })

  // ─── Session duration ────────────────────────────────────────────────────

  describe('Session duration: PUT enforcement', () => {
    it('admin can set duration on a session', async () => {
      const res = await fetch(`${BASE}/${TEST_SESSION_PUBLISHED_ID}`, {
        method: 'PUT',
        headers: { Cookie: adminCookies, 'Content-Type': 'application/json' },
        body: JSON.stringify({ duration: 45 }),
      })
      expect(res.status).toBe(200)
      const updated = await res.json() as { duration: number | null }
      expect(updated.duration).toBe(45)

      // Restore
      await fetch(`${BASE}/${TEST_SESSION_PUBLISHED_ID}`, {
        method: 'PUT',
        headers: { Cookie: adminCookies, 'Content-Type': 'application/json' },
        body: JSON.stringify({ duration: null }),
      })
    })

    it('admin can clear duration (set to null)', async () => {
      // First set a duration
      await fetch(`${BASE}/${TEST_SESSION_PUBLISHED_ID}`, {
        method: 'PUT',
        headers: { Cookie: adminCookies, 'Content-Type': 'application/json' },
        body: JSON.stringify({ duration: 60 }),
      })

      const res = await fetch(`${BASE}/${TEST_SESSION_PUBLISHED_ID}`, {
        method: 'PUT',
        headers: { Cookie: adminCookies, 'Content-Type': 'application/json' },
        body: JSON.stringify({ duration: null }),
      })
      expect(res.status).toBe(200)
      const updated = await res.json() as { duration: number | null }
      expect(updated.duration).toBeNull()
    })

    it('staff cannot set duration', async () => {
      const res = await fetch(`${BASE}/${TEST_SESSION_STAFF_PUBLISHED_ID}`, {
        method: 'PUT',
        headers: { Cookie: staffCookies, 'Content-Type': 'application/json' },
        body: JSON.stringify({ duration: 90 }),
      })
      expect(res.status).toBe(403)
    })

    it('participant cannot set duration', async () => {
      const res = await fetch(`${BASE}/${TEST_SESSION_PROPOSED_BY_NOAH_ID}`, {
        method: 'PUT',
        headers: { Cookie: noahCookies, 'Content-Type': 'application/json' },
        body: JSON.stringify({ duration: 30 }),
      })
      expect(res.status).toBe(403)
    })

    it('returns 400 for non-positive duration', async () => {
      const res = await fetch(`${BASE}/${TEST_SESSION_PUBLISHED_ID}`, {
        method: 'PUT',
        headers: { Cookie: adminCookies, 'Content-Type': 'application/json' },
        body: JSON.stringify({ duration: 0 }),
      })
      expect(res.status).toBe(400)
    })
  })

  // ─── POST /sessions/publish-scheduled ────────────────────────────────────
  describe('POST /api/events/[eventId]/sessions/publish-scheduled', () => {
    const PUBLISH_URL = `${BASE}/publish-scheduled`

    it('returns 401 for unauthenticated request', async () => {
      const res = await fetch(PUBLISH_URL, { method: 'POST' })
      expect(res.status).toBe(401)
    })

    it('returns 403 for non-admin users', async () => {
      const res = await fetch(PUBLISH_URL, {
        method: 'POST',
        headers: { Cookie: noahCookies },
      })
      expect(res.status).toBe(403)
    })

    it('returns 403 for staff users', async () => {
      const res = await fetch(PUBLISH_URL, {
        method: 'POST',
        headers: { Cookie: staffCookies },
      })
      expect(res.status).toBe(403)
    })

    it('publishes all scheduled sessions and returns count', async () => {
      // Verify there are scheduled sessions before the call
      const beforeRes = await fetch(`${BASE}?status=scheduled`, {
        headers: { Cookie: adminCookies },
      })
      const before = await beforeRes.json() as { status: string }[]
      const scheduledBefore = before.filter(s => s.status === 'scheduled').length
      expect(scheduledBefore).toBeGreaterThan(0)

      const res = await fetch(PUBLISH_URL, {
        method: 'POST',
        headers: { Cookie: adminCookies },
      })
      expect(res.status).toBe(200)
      const body = await res.json() as { published: number }
      expect(body.published).toBe(scheduledBefore)

      // Verify no scheduled sessions remain
      const afterRes = await fetch(`${BASE}?status=scheduled`, {
        headers: { Cookie: adminCookies },
      })
      const after = await afterRes.json() as { status: string }[]
      expect(after.filter(s => s.status === 'scheduled').length).toBe(0)

      // Restore scheduled sessions for subsequent tests
      await migrateAndSeed()
    })

    it('returns 0 when there are no scheduled sessions', async () => {
      // First call publishes all scheduled sessions
      await fetch(PUBLISH_URL, {
        method: 'POST',
        headers: { Cookie: adminCookies },
      })

      // Second call should find nothing to publish
      const res = await fetch(PUBLISH_URL, {
        method: 'POST',
        headers: { Cookie: adminCookies },
      })
      expect(res.status).toBe(200)
      const body = await res.json() as { published: number }
      expect(body.published).toBe(0)

      // Restore for other tests
      await migrateAndSeed()
    })
  })
})
