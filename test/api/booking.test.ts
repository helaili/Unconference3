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
  TEST_OPEN_SLOT_MEETING1_ID,
  TEST_OPEN_SLOT_MEETING2_ID,
} from './helpers'

const BASE = `/api/events/${TEST_EVENT_ID}/rounds`
const OPEN_ROUND = `${BASE}/${TEST_ROUND_OPEN_ID}`
const DRAFT_ROUND = `${BASE}/${TEST_ROUND_DRAFT_ID}`

const slot1BookUrl = `${OPEN_ROUND}/slots/${TEST_OPEN_SLOT_MEETING1_ID}/book`
const slot2BookUrl = `${OPEN_ROUND}/slots/${TEST_OPEN_SLOT_MEETING2_ID}/book`

describe('Slot Booking (POST .../slots/[slotId]/book)', async () => {
  let adminCookies: string
  let dianaCookes: string
  let noahCookies: string

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
    dianaCookes = await loginAs(fetch, REGULAR_USER_EMAIL) // diana
    noahCookies = await loginAs(fetch, 'noah.williams@example.com')
  })

  // ── Auth / access ─────────────────────────────────────────────────────────

  it('returns 401 for unauthenticated request', async () => {
    const res = await fetch(slot1BookUrl, { method: 'POST' })
    expect(res.status).toBe(401)
  })

  it('returns 403 for non-open round (draft)', async () => {
    const draftSlotUrl = `${DRAFT_ROUND}/slots/ab000000-0000-0000-0000-000000000001/book`
    const res = await fetch(draftSlotUrl, { method: 'POST', headers: { Cookie: noahCookies } })
    expect(res.status).toBe(403)
  })

  it('returns 403 for non-open round (assigned)', async () => {
    const assignedSlotUrl = `${BASE}/${TEST_ROUND_ASSIGNED_ID}/slots/ab000000-0000-0000-0000-000000000001/book`
    const res = await fetch(assignedSlotUrl, { method: 'POST', headers: { Cookie: noahCookies } })
    expect(res.status).toBe(403)
  })

  it('returns 404 for non-existent slot', async () => {
    const res = await fetch(
      `${OPEN_ROUND}/slots/00000000-0000-0000-0000-000000000000/book`,
      { method: 'POST', headers: { Cookie: noahCookies } },
    )
    expect(res.status).toBe(404)
  })

  // ── Happy path: first booking ─────────────────────────────────────────────

  it('books the user into the target slot', async () => {
    const res = await fetch(slot1BookUrl, { method: 'POST', headers: { Cookie: noahCookies } })
    expect(res.status).toBe(200)
    const body = await res.json() as { success: boolean }
    expect(body.success).toBe(true)

    // Cleanup
    await fetch(`${OPEN_ROUND}/slots/${TEST_OPEN_SLOT_MEETING1_ID}/register`, {
      method: 'DELETE',
      headers: { Cookie: noahCookies },
    })
  })

  // ── Idempotent: booking same slot again is a no-op ────────────────────────

  it('is idempotent when user books the same slot twice', async () => {
    await fetch(slot1BookUrl, { method: 'POST', headers: { Cookie: noahCookies } })
    const res = await fetch(slot1BookUrl, { method: 'POST', headers: { Cookie: noahCookies } })
    expect(res.status).toBe(200)

    // Cleanup
    await fetch(`${OPEN_ROUND}/slots/${TEST_OPEN_SLOT_MEETING1_ID}/register`, {
      method: 'DELETE',
      headers: { Cookie: noahCookies },
    })
  })

  // ── Swap: booking slot B removes user from slot A (same slotIndex) ─────────

  it('swaps: moves user from slot1 to slot2 at same slotIndex', async () => {
    // Book slot 1 first
    const book1 = await fetch(slot1BookUrl, { method: 'POST', headers: { Cookie: noahCookies } })
    expect(book1.status).toBe(200)

    // Now book slot 2 (same slotIndex 0) — should remove slot 1 and add slot 2
    const book2 = await fetch(slot2BookUrl, { method: 'POST', headers: { Cookie: noahCookies } })
    expect(book2.status).toBe(200)

    // Verify via schedule endpoint: user should only be in slot 2
    const schedRes = await fetch(`${OPEN_ROUND}/schedule`, { headers: { Cookie: noahCookies } })
    expect(schedRes.status).toBe(200)
    const schedule = await schedRes.json() as Array<{ slotId: string }>
    const slotIds = schedule.map((s) => s.slotId)
    expect(slotIds).not.toContain(TEST_OPEN_SLOT_MEETING1_ID)
    expect(slotIds).toContain(TEST_OPEN_SLOT_MEETING2_ID)

    // Cleanup
    await fetch(`${OPEN_ROUND}/slots/${TEST_OPEN_SLOT_MEETING2_ID}/register`, {
      method: 'DELETE',
      headers: { Cookie: noahCookies },
    })
  })

  // ── Capacity: returns 409 when slot is full ────────────────────────────────

  it('returns 409 when slot is fully booked', async () => {
    // Meeting Room 2 has maxCapacity 8. Fill it with 8 users.
    const emails = [
      'diana.rivera@example.com',
      'marcus.chen@example.com',
      'fatima.al-rashid@example.com',
      'kenji.tanaka@example.com',
      'sophia.petrov@example.com',
      'liam.obrien@example.com',
      'amara.okafor@example.com',
      'raj.patel@example.com',
    ]

    const cookies: string[] = []
    for (const email of emails) {
      const c = await loginAs(fetch, email)
      cookies.push(c)
      await fetch(slot1BookUrl, { method: 'POST', headers: { Cookie: c } })
    }

    // One more user tries to book — should get 409
    const res = await fetch(slot1BookUrl, { method: 'POST', headers: { Cookie: noahCookies } })
    expect(res.status).toBe(409)

    // Cleanup: remove all registrations
    for (const c of cookies) {
      await fetch(`${OPEN_ROUND}/slots/${TEST_OPEN_SLOT_MEETING1_ID}/register`, {
        method: 'DELETE',
        headers: { Cookie: c },
      })
    }
  })
})
