import { describe, it, expect, beforeAll } from 'vitest'
import { setup, fetch } from '@nuxt/test-utils/e2e'
import { fileURLToPath } from 'node:url'
import {
  migrateAndSeed,
  loginAs,
  ADMIN_EMAIL,
  REGULAR_USER_EMAIL,
  PARTICIPANT_USER_EMAIL,
  OUTSIDER_EMAIL,
  TEST_EVENT_ID,
} from './helpers'

describe('Participant Event Flow', async () => {
  let adminCookies: string
  let participantCookies: string
  let outsiderCookies: string
  let editSessionId: string

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
    participantCookies = await loginAs(fetch, PARTICIPANT_USER_EMAIL)
    outsiderCookies = await loginAs(fetch, OUTSIDER_EMAIL)

    // Pre-create a session used by the PUT edit tests
    const res = await fetch(`/api/events/${TEST_EVENT_ID}/sessions`, {
      method: 'POST',
      headers: { Cookie: participantCookies, 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Edit Me', description: 'Original description' }),
    })
    const session = await res.json() as { id: string }
    editSessionId = session.id
  })

  // ─── GET /api/events/:id (participant access) ────────────────────

  describe('GET /api/events/:id', () => {
    it('returns 401 for unauthenticated request', async () => {
      const res = await fetch(`/api/events/${TEST_EVENT_ID}`)
      expect(res.status).toBe(401)
    })

    it('returns 403 for user not in the event', async () => {
      const res = await fetch(`/api/events/${TEST_EVENT_ID}`, {
        headers: { Cookie: outsiderCookies },
      })
      expect(res.status).toBe(403)
    })

    it('returns 200 with event details for a participant', async () => {
      const res = await fetch(`/api/events/${TEST_EVENT_ID}`, {
        headers: { Cookie: participantCookies },
      })
      expect(res.status).toBe(200)
      const event = await res.json() as Record<string, unknown>
      expect(event.id).toBe(TEST_EVENT_ID)
      expect(event.name).toBe('Unconference 2026')
      expect(typeof event.submissionRestricted).toBe('boolean')
    })
  })

  // ─── GET /api/events/:id/sessions (participant view) ─────────────

  describe('GET /api/events/:id/sessions', () => {
    it('returns 401 for unauthenticated request', async () => {
      const res = await fetch(`/api/events/${TEST_EVENT_ID}/sessions`)
      expect(res.status).toBe(401)
    })

    it('returns 403 for user not in the event', async () => {
      const res = await fetch(`/api/events/${TEST_EVENT_ID}/sessions`, {
        headers: { Cookie: outsiderCookies },
      })
      expect(res.status).toBe(403)
    })

    it('returns only published and scheduled sessions by default (plus own proposed)', async () => {
      const res = await fetch(`/api/events/${TEST_EVENT_ID}/sessions`, {
        headers: { Cookie: participantCookies },
      })
      expect(res.status).toBe(200)
      const sessions = await res.json() as Array<{ status: string; authorId: string }>
      // Published and scheduled sessions must be present
      expect(sessions.some(s => s.status === 'published')).toBe(true)
      expect(sessions.some(s => s.status === 'scheduled')).toBe(true)
      // Delivered should not appear without the flag
      expect(sessions.some(s => s.status === 'delivered')).toBe(false)
      // Noah's own proposed session (d0000000-0000-0000-0000-000000000005) is included
      const proposedSessions = sessions.filter(s => s.status === 'proposed')
      // Only own proposed sessions should appear — no other authors' proposed sessions
      const participantDbId = 'b0000000-0000-0000-0000-000000000019'
      for (const s of proposedSessions) {
        expect(s.authorId).toBe(participantDbId)
      }
    })

    it('includes delivered sessions when includeDelivered=true', async () => {
      const res = await fetch(`/api/events/${TEST_EVENT_ID}/sessions?includeDelivered=true`, {
        headers: { Cookie: participantCookies },
      })
      expect(res.status).toBe(200)
      const sessions = await res.json() as Array<{ status: string }>
      expect(sessions.some(s => s.status === 'delivered')).toBe(true)
    })
  })

  // ─── POST /api/events/:id/sessions (propose) ─────────────────────

  describe('POST /api/events/:id/sessions', () => {
    it('returns 401 for unauthenticated request', async () => {
      const res = await fetch(`/api/events/${TEST_EVENT_ID}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Anon session' }),
      })
      expect(res.status).toBe(401)
    })

    it('returns 403 for user not in the event', async () => {
      const res = await fetch(`/api/events/${TEST_EVENT_ID}/sessions`, {
        method: 'POST',
        headers: { Cookie: outsiderCookies, 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Outsider session' }),
      })
      expect(res.status).toBe(403)
    })

    it('returns 400 when title is missing', async () => {
      const res = await fetch(`/api/events/${TEST_EVENT_ID}/sessions`, {
        method: 'POST',
        headers: { Cookie: participantCookies, 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: 'No title' }),
      })
      expect(res.status).toBe(400)
    })

    it('creates a proposed session for a participant', async () => {
      const res = await fetch(`/api/events/${TEST_EVENT_ID}/sessions`, {
        method: 'POST',
        headers: { Cookie: participantCookies, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'My New Proposal',
          description: 'A session I want to run',
          tags: ['testing', 'demo'],
        }),
      })
      expect(res.status).toBe(200)
      const session = await res.json() as Record<string, unknown>
      expect(session.title).toBe('My New Proposal')
      expect(session.status).toBe('proposed')
      expect(session.tags).toEqual(['testing', 'demo'])

      // Round-trip: participant should now see their proposed session
      const listRes = await fetch(`/api/events/${TEST_EVENT_ID}/sessions`, {
        headers: { Cookie: participantCookies },
      })
      const sessions = await listRes.json() as Array<{ id: string; title: string; status: string }>
      const created = sessions.find(s => s.title === 'My New Proposal')
      expect(created).toBeDefined()
      expect(created!.status).toBe('proposed')

      // Clean up: delete via admin
      await fetch(`/api/events/${TEST_EVENT_ID}/sessions/${created!.id}`, {
        method: 'DELETE',
        headers: { Cookie: adminCookies },
      })
    })

    it('does not allow participant to set an initial status', async () => {
      const res = await fetch(`/api/events/${TEST_EVENT_ID}/sessions`, {
        method: 'POST',
        headers: { Cookie: participantCookies, 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Sneaky session', status: 'published' }),
      })
      expect(res.status).toBe(403)
    })
  })

  // ─── PUT /api/events/:id/sessions/:sessionId (edit own proposed) ──

  describe('PUT /api/events/:id/sessions/:sessionId (participant edit)', () => {
    it('allows participant to edit their own proposed session', async () => {
      const res = await fetch(`/api/events/${TEST_EVENT_ID}/sessions/${editSessionId}`, {
        method: 'PUT',
        headers: { Cookie: participantCookies, 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Edit Me — Updated', description: 'New description' }),
      })
      expect(res.status).toBe(200)
      const updated = await res.json() as Record<string, unknown>
      expect(updated.title).toBe('Edit Me — Updated')
      expect(updated.description).toBe('New description')
    })

    it('does not allow participant to change session status', async () => {
      const res = await fetch(`/api/events/${TEST_EVENT_ID}/sessions/${editSessionId}`, {
        method: 'PUT',
        headers: { Cookie: participantCookies, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'published' }),
      })
      expect(res.status).toBe(403)
    })

    it('returns 404 for non-existent session', async () => {
      const res = await fetch(`/api/events/${TEST_EVENT_ID}/sessions/00000000-0000-0000-0000-000000000000`, {
        method: 'PUT',
        headers: { Cookie: participantCookies, 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Ghost' }),
      })
      expect(res.status).toBe(404)
    })

    it('admin can delete the test session', async () => {
      const res = await fetch(`/api/events/${TEST_EVENT_ID}/sessions/${editSessionId}`, {
        method: 'DELETE',
        headers: { Cookie: adminCookies },
      })
      expect(res.status).toBe(200)
    })
  })
})
