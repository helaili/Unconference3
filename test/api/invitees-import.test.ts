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
} from './helpers'

const IMPORT_URL = `/api/events/${TEST_EVENT_ID}/invitees/import`

describe('Invitees Import Endpoint', async () => {
  let adminCookies: string
  let participantCookies: string
  let staffCookies: string
  let outsiderCookies: string

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
    staffCookies = await loginAs(fetch, STAFF_USER_EMAIL)
    outsiderCookies = await loginAs(fetch, OUTSIDER_EMAIL)
  })

  // ─── Auth ─────────────────────────────────────────────────────────

  it('returns 401 when unauthenticated', async () => {
    const res = await fetch(IMPORT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ participants: [{ fullName: 'Test User', email: 'test@example.com' }] }),
    })
    expect(res.status).toBe(401)
  })

  it('returns 403 for a non-staff participant of the event', async () => {
    const res = await fetch(IMPORT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: participantCookies },
      body: JSON.stringify({ participants: [{ fullName: 'Test User', email: 'test@example.com' }] }),
    })
    expect(res.status).toBe(403)
  })

  it('returns 403 for a user who is not an invitee of the event at all', async () => {
    const res = await fetch(IMPORT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: outsiderCookies },
      body: JSON.stringify({ participants: [{ fullName: 'Test User', email: 'test@example.com' }] }),
    })
    expect(res.status).toBe(403)
  })

  // ─── Validation ───────────────────────────────────────────────────

  it('returns 400 when participants is missing', async () => {
    const res = await fetch(IMPORT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookies },
      body: JSON.stringify({}),
    })
    expect(res.status).toBe(400)
  })

  it('returns 400 when participants is empty', async () => {
    const res = await fetch(IMPORT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookies },
      body: JSON.stringify({ participants: [] }),
    })
    expect(res.status).toBe(400)
  })

  it('returns 400 when registerParticipants is true but defaultPassword is missing', async () => {
    const res = await fetch(IMPORT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookies },
      body: JSON.stringify({
        participants: [{ fullName: 'Test User', email: 'newuser@example.com' }],
        registerParticipants: true,
      }),
    })
    expect(res.status).toBe(400)
  })

  it('returns 400 when registerParticipants is true but defaultPassword is too short', async () => {
    const res = await fetch(IMPORT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookies },
      body: JSON.stringify({
        participants: [{ fullName: 'Test User', email: 'newuser2@example.com' }],
        registerParticipants: true,
        defaultPassword: 'short',
      }),
    })
    expect(res.status).toBe(400)
  })

  it('returns 400 when all rows are invalid (no valid rows remain)', async () => {
    const res = await fetch(IMPORT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookies },
      body: JSON.stringify({
        participants: [
          { fullName: '', email: 'noemail@example.com' },
          { fullName: 'No Email', email: '' },
        ],
      }),
    })
    expect(res.status).toBe(400)
  })

  // ─── Happy path ───────────────────────────────────────────────────

  it('imports new invitees successfully as admin', async () => {
    const res = await fetch(IMPORT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookies },
      body: JSON.stringify({
        participants: [
          { fullName: 'Imported One', email: 'imported.one@example.com' },
          { fullName: 'Imported Two', email: 'imported.two@example.com' },
        ],
      }),
    })
    expect(res.status).toBe(200)
    const body = await res.json() as { imported: number; skipped: number; registered: number }
    expect(body.imported).toBe(2)
    expect(body.skipped).toBe(0)
    expect(body.registered).toBe(0)

    // Verify via GET
    const listRes = await fetch(`/api/events/${TEST_EVENT_ID}/invitees`, {
      headers: { Cookie: adminCookies },
    })
    const list = await listRes.json() as Array<{ email: string; firstName: string; lastName: string }>
    const emails = list.map(i => i.email)
    expect(emails).toContain('imported.one@example.com')
    expect(emails).toContain('imported.two@example.com')

    const one = list.find(i => i.email === 'imported.one@example.com')
    expect(one?.firstName).toBe('Imported')
    expect(one?.lastName).toBe('One')
  })

  it('allows staff to import invitees', async () => {
    const res = await fetch(IMPORT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: staffCookies },
      body: JSON.stringify({
        participants: [{ fullName: 'Staff Imported', email: 'staff.imported@example.com' }],
      }),
    })
    expect(res.status).toBe(200)
    const body = await res.json() as { imported: number }
    expect(body.imported).toBe(1)
  })

  it('skips already-existing invitees and reports counts correctly', async () => {
    // alice@example.com is already in the seed data
    const res = await fetch(IMPORT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookies },
      body: JSON.stringify({
        participants: [
          { fullName: 'Alice Smith', email: 'alice@example.com' },
          { fullName: 'Brand New', email: 'brand.new@example.com' },
        ],
      }),
    })
    expect(res.status).toBe(200)
    const body = await res.json() as { imported: number; skipped: number }
    expect(body.imported).toBe(1)
    expect(body.skipped).toBe(1)
  })

  it('deduplicates duplicate emails within the same payload', async () => {
    const res = await fetch(IMPORT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookies },
      body: JSON.stringify({
        participants: [
          { fullName: 'Dup User', email: 'dup.user@example.com' },
          { fullName: 'Dup User Again', email: 'dup.user@example.com' },
        ],
      }),
    })
    expect(res.status).toBe(200)
    const body = await res.json() as { imported: number }
    expect(body.imported).toBe(1)
  })

  it('handles multi-word last names correctly', async () => {
    const res = await fetch(IMPORT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookies },
      body: JSON.stringify({
        participants: [{ fullName: 'Jan van der Berg', email: 'jan.vdberg@example.com' }],
      }),
    })
    expect(res.status).toBe(200)
    const listRes = await fetch(`/api/events/${TEST_EVENT_ID}/invitees`, { headers: { Cookie: adminCookies } })
    const list = await listRes.json() as Array<{ email: string; firstName: string; lastName: string }>
    const entry = list.find(i => i.email === 'jan.vdberg@example.com')
    expect(entry?.firstName).toBe('Jan')
    expect(entry?.lastName).toBe('van der Berg')
  })

  it('imports with registerParticipants=true, creating user accounts and event membership', async () => {
    const email = 'registered.import@example.com'
    const res = await fetch(IMPORT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookies },
      body: JSON.stringify({
        participants: [{ fullName: 'Registered Import', email }],
        registerParticipants: true,
        defaultPassword: 'EurocatsBBVA2026',
      }),
    })
    expect(res.status).toBe(200)
    const body = await res.json() as { imported: number; registered: number }
    expect(body.imported).toBe(1)
    expect(body.registered).toBe(1)

    // User should be able to log in with the default password
    const loginRes = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'EurocatsBBVA2026' }),
    })
    expect(loginRes.status).toBe(200)
  })

  it('registerParticipants=true skips existing users but still links them to the event', async () => {
    // diana.rivera@example.com already exists as a user in seed data
    const email = REGULAR_USER_EMAIL
    const res = await fetch(IMPORT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookies },
      body: JSON.stringify({
        participants: [{ fullName: 'Diana Rivera', email }],
        registerParticipants: true,
        defaultPassword: 'EurocatsBBVA2026',
      }),
    })
    expect(res.status).toBe(200)
    // The user already existed AND was already in this event → both skipped, no error
    const body = await res.json() as { imported: number; skipped: number; registered: number }
    expect(body.imported).toBe(0) // already an invitee
    expect(body.skipped).toBe(1)
    expect(body.registered).toBe(0) // already a member of the event
  })
})
