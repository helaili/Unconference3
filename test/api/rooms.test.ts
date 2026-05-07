import { describe, it, expect, beforeAll } from 'vitest'
import { setup, fetch } from '@nuxt/test-utils/e2e'
import { fileURLToPath } from 'node:url'
import {
  migrateAndSeed,
  loginAs,
  ADMIN_EMAIL,
  REGULAR_USER_EMAIL,
  TEST_EVENT_ID,
  TEST_ROOM_WORKSHOP_ID,
  TEST_ROOM_MEETING_1_ID,
} from './helpers'

const BASE = `/api/events/${TEST_EVENT_ID}/rooms`

describe('Rooms Endpoints', async () => {
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

  // ─── GET /rooms (list) ───────────────────────────────────────────────────

  describe('GET /api/events/[eventId]/rooms', () => {
    it('returns 401 for unauthenticated request', async () => {
      const res = await fetch(BASE)
      expect(res.status).toBe(401)
    })

    it('returns rooms list for event member', async () => {
      const res = await fetch(BASE, { headers: { Cookie: userCookies } })
      expect(res.status).toBe(200)
      const list = await res.json() as Array<{ id: string; type: string }>
      expect(list.length).toBe(8)
      const types = list.map(r => r.type)
      expect(types).toContain('workshop')
      expect(types.filter(t => t === 'meeting').length).toBe(7)
    })

    it('returns rooms list for admin', async () => {
      const res = await fetch(BASE, { headers: { Cookie: adminCookies } })
      expect(res.status).toBe(200)
      const list = await res.json() as Array<{ id: string }>
      expect(list.length).toBe(8)
    })
  })

  // ─── GET /rooms/[roomId] ─────────────────────────────────────────────────

  describe('GET /api/events/[eventId]/rooms/[roomId]', () => {
    it('returns 401 for unauthenticated request', async () => {
      const res = await fetch(`${BASE}/${TEST_ROOM_WORKSHOP_ID}`)
      expect(res.status).toBe(401)
    })

    it('returns the workshop room for event member', async () => {
      const res = await fetch(`${BASE}/${TEST_ROOM_WORKSHOP_ID}`, {
        headers: { Cookie: userCookies },
      })
      expect(res.status).toBe(200)
      const room = await res.json() as { id: string; type: string; maxCapacity: number; name: string }
      expect(room.id).toBe(TEST_ROOM_WORKSHOP_ID)
      expect(room.type).toBe('workshop')
      expect(room.name).toBe('Main Workshop Hall')
    })

    it('returns 404 for non-existent room', async () => {
      const res = await fetch(`${BASE}/00000000-0000-0000-0000-000000000000`, {
        headers: { Cookie: userCookies },
      })
      expect(res.status).toBe(404)
    })
  })

  // ─── POST /rooms (create) ────────────────────────────────────────────────

  describe('POST /api/events/[eventId]/rooms', () => {
    it('returns 401 for unauthenticated request', async () => {
      const res = await fetch(BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'New Room', maxCapacity: 10, type: 'meeting' }),
      })
      expect(res.status).toBe(401)
    })

    it('returns 403 for non-admin user', async () => {
      const res = await fetch(BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: userCookies },
        body: JSON.stringify({ name: 'New Room', maxCapacity: 10, type: 'meeting' }),
      })
      expect(res.status).toBe(403)
    })

    it('returns 400 when name is missing', async () => {
      const res = await fetch(BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookies },
        body: JSON.stringify({ maxCapacity: 10, type: 'meeting' }),
      })
      expect(res.status).toBe(400)
    })

    it('returns 400 when maxCapacity is missing', async () => {
      const res = await fetch(BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookies },
        body: JSON.stringify({ name: 'New Room', type: 'meeting' }),
      })
      expect(res.status).toBe(400)
    })

    it('returns 400 when type is invalid', async () => {
      const res = await fetch(BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookies },
        body: JSON.stringify({ name: 'New Room', maxCapacity: 10, type: 'invalid' }),
      })
      expect(res.status).toBe(400)
    })

    it('creates a room and returns it', async () => {
      const res = await fetch(BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookies },
        body: JSON.stringify({ name: 'Both Room', maxCapacity: 20, type: 'both', description: 'Multi-purpose' }),
      })
      expect(res.status).toBe(200)
      const created = await res.json() as { id: string; name: string; type: string; maxCapacity: number; description: string }
      expect(created.name).toBe('Both Room')
      expect(created.type).toBe('both')
      expect(created.maxCapacity).toBe(20)
      expect(created.description).toBe('Multi-purpose')

      // Verify it appears in the list
      const listRes = await fetch(BASE, { headers: { Cookie: adminCookies } })
      const list = await listRes.json() as Array<{ id: string }>
      expect(list.some(r => r.id === created.id)).toBe(true)
    })
  })

  // ─── PUT /rooms/[roomId] (update) ────────────────────────────────────────

  describe('PUT /api/events/[eventId]/rooms/[roomId]', () => {
    it('returns 401 for unauthenticated request', async () => {
      const res = await fetch(`${BASE}/${TEST_ROOM_MEETING_1_ID}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Updated' }),
      })
      expect(res.status).toBe(401)
    })

    it('returns 403 for non-admin user', async () => {
      const res = await fetch(`${BASE}/${TEST_ROOM_MEETING_1_ID}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Cookie: userCookies },
        body: JSON.stringify({ name: 'Updated' }),
      })
      expect(res.status).toBe(403)
    })

    it('returns 404 for non-existent room', async () => {
      const res = await fetch(`${BASE}/00000000-0000-0000-0000-000000000000`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookies },
        body: JSON.stringify({ name: 'Updated' }),
      })
      expect(res.status).toBe(404)
    })

    it('updates a room and returns the updated record', async () => {
      const res = await fetch(`${BASE}/${TEST_ROOM_MEETING_1_ID}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookies },
        body: JSON.stringify({ name: 'Meeting Room 1 Updated', maxCapacity: 12 }),
      })
      expect(res.status).toBe(200)
      const updated = await res.json() as { id: string; name: string; maxCapacity: number }
      expect(updated.name).toBe('Meeting Room 1 Updated')
      expect(updated.maxCapacity).toBe(12)

      // Verify via GET
      const getRes = await fetch(`${BASE}/${TEST_ROOM_MEETING_1_ID}`, { headers: { Cookie: adminCookies } })
      const fetched = await getRes.json() as { name: string; maxCapacity: number }
      expect(fetched.name).toBe('Meeting Room 1 Updated')
      expect(fetched.maxCapacity).toBe(12)

      // Restore original values
      await fetch(`${BASE}/${TEST_ROOM_MEETING_1_ID}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookies },
        body: JSON.stringify({ name: 'Meeting Room 1', maxCapacity: 8 }),
      })
    })
  })

  // ─── DELETE /rooms/[roomId] ──────────────────────────────────────────────

  describe('DELETE /api/events/[eventId]/rooms/[roomId]', () => {
    it('returns 401 for unauthenticated request', async () => {
      const res = await fetch(`${BASE}/${TEST_ROOM_MEETING_1_ID}`, { method: 'DELETE' })
      expect(res.status).toBe(401)
    })

    it('returns 403 for non-admin user', async () => {
      const res = await fetch(`${BASE}/${TEST_ROOM_MEETING_1_ID}`, {
        method: 'DELETE',
        headers: { Cookie: userCookies },
      })
      expect(res.status).toBe(403)
    })

    it('returns 404 for non-existent room', async () => {
      const res = await fetch(`${BASE}/00000000-0000-0000-0000-000000000000`, {
        method: 'DELETE',
        headers: { Cookie: adminCookies },
      })
      expect(res.status).toBe(404)
    })

    it('deletes a room and confirms it is gone', async () => {
      // First create a room to delete
      const createRes = await fetch(BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookies },
        body: JSON.stringify({ name: 'Room To Delete', maxCapacity: 5, type: 'meeting' }),
      })
      const created = await createRes.json() as { id: string }

      const deleteRes = await fetch(`${BASE}/${created.id}`, {
        method: 'DELETE',
        headers: { Cookie: adminCookies },
      })
      expect(deleteRes.status).toBe(200)
      const result = await deleteRes.json() as { success: boolean }
      expect(result.success).toBe(true)

      // Verify it's gone
      const getRes = await fetch(`${BASE}/${created.id}`, { headers: { Cookie: adminCookies } })
      expect(getRes.status).toBe(404)
    })
  })
})
