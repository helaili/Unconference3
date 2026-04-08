import { describe, it, expect, beforeAll } from 'vitest'
import { setup, fetch } from '@nuxt/test-utils/e2e'
import { fileURLToPath } from 'node:url'
import {
  migrateAndSeed,
  loginAs,
  ADMIN_EMAIL,
  REGULAR_USER_EMAIL,
  OUTSIDER_EMAIL,
  TEST_EVENT_ID,
  TEST_ROOM_MAIN_HALL_ID,
  TEST_ROOM_WORKSHOP_A_ID,
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

  // ─── GET /rooms ────────────────────────────────────────────────────────────

  describe('GET /api/events/[eventId]/rooms', () => {
    it('returns 401 for unauthenticated request', async () => {
      const res = await fetch(BASE)
      expect(res.status).toBe(401)
    })

    it('returns 403 for user not in the event', async () => {
      const outsiderCookies = await loginAs(fetch, OUTSIDER_EMAIL)
      const res = await fetch(BASE, { headers: { Cookie: outsiderCookies } })
      expect(res.status).toBe(403)
    })

    it('returns 200 with rooms list for event member', async () => {
      const res = await fetch(BASE, { headers: { Cookie: userCookies } })
      expect(res.status).toBe(200)
      const list = await res.json() as Array<{ id: string; name: string }>
      expect(Array.isArray(list)).toBe(true)
      expect(list.length).toBeGreaterThanOrEqual(3)
    })

    it('returns rooms sorted by name', async () => {
      const res = await fetch(BASE, { headers: { Cookie: adminCookies } })
      expect(res.status).toBe(200)
      const list = await res.json() as Array<{ name: string }>
      const names = list.map(r => r.name)
      expect(names).toEqual([...names].sort())
    })

    it('includes expected fields on each room', async () => {
      const res = await fetch(BASE, { headers: { Cookie: adminCookies } })
      const list = await res.json() as Array<Record<string, unknown>>
      const room = list.find(r => r.id === TEST_ROOM_MAIN_HALL_ID)
      expect(room).toBeDefined()
      expect(room!.name).toBe('Main Hall')
      expect(room!.capacity).toBe(200)
      expect(room!.eventId).toBe(TEST_EVENT_ID)
    })
  })

  // ─── POST /rooms ───────────────────────────────────────────────────────────

  describe('POST /api/events/[eventId]/rooms', () => {
    it('returns 401 for unauthenticated request', async () => {
      const res = await fetch(BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'New Room' }),
      })
      expect(res.status).toBe(401)
    })

    it('returns 403 for non-admin user', async () => {
      const res = await fetch(BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: userCookies },
        body: JSON.stringify({ name: 'New Room' }),
      })
      expect(res.status).toBe(403)
    })

    it('returns 400 when name is missing', async () => {
      const res = await fetch(BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookies },
        body: JSON.stringify({ description: 'No name here' }),
      })
      expect(res.status).toBe(400)
    })

    it('returns 400 for invalid capacity (non-integer)', async () => {
      const res = await fetch(BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookies },
        body: JSON.stringify({ name: 'Bad Room', capacity: 1.5 }),
      })
      expect(res.status).toBe(400)
    })

    it('returns 400 for capacity less than 1', async () => {
      const res = await fetch(BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookies },
        body: JSON.stringify({ name: 'Zero Cap', capacity: 0 }),
      })
      expect(res.status).toBe(400)
    })

    it('creates a room with full fields and returns 201', async () => {
      const res = await fetch(BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookies },
        body: JSON.stringify({ name: 'Conference Room B', description: 'Boardroom style', capacity: 12 }),
      })
      expect(res.status).toBe(201)
      const room = await res.json() as Record<string, unknown>
      expect(room.name).toBe('Conference Room B')
      expect(room.description).toBe('Boardroom style')
      expect(room.capacity).toBe(12)
      expect(room.id).toBeDefined()
      expect(room.eventId).toBe(TEST_EVENT_ID)

      // Cleanup — delete the created room
      await fetch(`${BASE}/${room.id}`, { method: 'DELETE', headers: { Cookie: adminCookies } })
    })

    it('creates a room without optional fields', async () => {
      const res = await fetch(BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookies },
        body: JSON.stringify({ name: 'Minimal Room' }),
      })
      expect(res.status).toBe(201)
      const room = await res.json() as Record<string, unknown>
      expect(room.name).toBe('Minimal Room')
      expect(room.description).toBeNull()
      expect(room.capacity).toBeNull()

      // Cleanup
      await fetch(`${BASE}/${room.id}`, { method: 'DELETE', headers: { Cookie: adminCookies } })
    })
  })

  // ─── PUT /rooms/[roomId] ───────────────────────────────────────────────────

  describe('PUT /api/events/[eventId]/rooms/[roomId]', () => {
    it('returns 401 for unauthenticated request', async () => {
      const res = await fetch(`${BASE}/${TEST_ROOM_WORKSHOP_A_ID}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Updated' }),
      })
      expect(res.status).toBe(401)
    })

    it('returns 403 for non-admin user', async () => {
      const res = await fetch(`${BASE}/${TEST_ROOM_WORKSHOP_A_ID}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Cookie: userCookies },
        body: JSON.stringify({ name: 'Updated' }),
      })
      expect(res.status).toBe(403)
    })

    it('returns 404 for unknown room ID', async () => {
      const res = await fetch(`${BASE}/00000000-0000-0000-0000-000000000000`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookies },
        body: JSON.stringify({ name: 'Ghost' }),
      })
      expect(res.status).toBe(404)
    })

    it('returns 400 when name is an empty string', async () => {
      const res = await fetch(`${BASE}/${TEST_ROOM_WORKSHOP_A_ID}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookies },
        body: JSON.stringify({ name: '   ' }),
      })
      expect(res.status).toBe(400)
    })

    it('updates a room and verifies via GET', async () => {
      const res = await fetch(`${BASE}/${TEST_ROOM_WORKSHOP_A_ID}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookies },
        body: JSON.stringify({ name: 'Workshop Room A (Updated)', capacity: 25 }),
      })
      expect(res.status).toBe(200)
      const updated = await res.json() as Record<string, unknown>
      expect(updated.name).toBe('Workshop Room A (Updated)')
      expect(updated.capacity).toBe(25)

      // Verify via GET
      const listRes = await fetch(BASE, { headers: { Cookie: adminCookies } })
      const list = await listRes.json() as Array<Record<string, unknown>>
      const found = list.find(r => r.id === TEST_ROOM_WORKSHOP_A_ID)
      expect(found?.name).toBe('Workshop Room A (Updated)')

      // Restore original values
      await fetch(`${BASE}/${TEST_ROOM_WORKSHOP_A_ID}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookies },
        body: JSON.stringify({ name: 'Workshop Room A', capacity: 30 }),
      })
    })
  })

  // ─── DELETE /rooms/[roomId] ────────────────────────────────────────────────

  describe('DELETE /api/events/[eventId]/rooms/[roomId]', () => {
    it('returns 401 for unauthenticated request', async () => {
      const res = await fetch(`${BASE}/${TEST_ROOM_MAIN_HALL_ID}`, { method: 'DELETE' })
      expect(res.status).toBe(401)
    })

    it('returns 403 for non-admin user', async () => {
      const res = await fetch(`${BASE}/${TEST_ROOM_MAIN_HALL_ID}`, {
        method: 'DELETE',
        headers: { Cookie: userCookies },
      })
      expect(res.status).toBe(403)
    })

    it('returns 404 for unknown room ID', async () => {
      const res = await fetch(`${BASE}/00000000-0000-0000-0000-000000000000`, {
        method: 'DELETE',
        headers: { Cookie: adminCookies },
      })
      expect(res.status).toBe(404)
    })

    it('deletes a room and verifies via GET', async () => {
      // First create a room to delete
      const createRes = await fetch(BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookies },
        body: JSON.stringify({ name: 'Temp Room' }),
      })
      expect(createRes.status).toBe(201)
      const { id } = await createRes.json() as { id: string }

      const deleteRes = await fetch(`${BASE}/${id}`, {
        method: 'DELETE',
        headers: { Cookie: adminCookies },
      })
      expect(deleteRes.status).toBe(200)
      const body = await deleteRes.json() as { success: boolean }
      expect(body.success).toBe(true)

      // Verify it's gone
      const listRes = await fetch(BASE, { headers: { Cookie: adminCookies } })
      const list = await listRes.json() as Array<{ id: string }>
      expect(list.find(r => r.id === id)).toBeUndefined()
    })
  })
})
