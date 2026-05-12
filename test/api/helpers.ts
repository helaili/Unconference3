import { readFileSync, readdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import * as schema from '../../server/database/schema'

const __dirname = dirname(fileURLToPath(import.meta.url))

function loadJson(filename: string) {
  const path = resolve(__dirname, '../db', filename)
  return JSON.parse(readFileSync(path, 'utf-8'))
}

/**
 * Apply SQL migrations and seed the test database with fixture data.
 */
export async function migrateAndSeed() {
  const client = postgres(process.env.DATABASE_URL!)

  // Drop all tables and custom types so migrations are idempotent across test files
  await client.unsafe(`
    DROP TABLE IF EXISTS slot_registrations CASCADE;
    DROP TABLE IF EXISTS slots CASCADE;
    DROP TABLE IF EXISTS round_rooms CASCADE;
    DROP TABLE IF EXISTS rounds CASCADE;
    DROP TABLE IF EXISTS rooms CASCADE;
    DROP TABLE IF EXISTS session_stars CASCADE;
    DROP TABLE IF EXISTS sessions CASCADE;
    DROP TABLE IF EXISTS user_events CASCADE;
    DROP TABLE IF EXISTS invitations CASCADE;
    DROP TABLE IF EXISTS invitees CASCADE;
    DROP TABLE IF EXISTS users CASCADE;
    DROP TABLE IF EXISTS events CASCADE;
    DROP TYPE IF EXISTS round_status;
    DROP TYPE IF EXISTS room_type;
    DROP TYPE IF EXISTS session_type;
    DROP TYPE IF EXISTS session_status;
    DROP TYPE IF EXISTS invitee_role;
  `)

  const migrationsDir = resolve(__dirname, '../../drizzle')
  const sqlFiles = readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort()

  for (const file of sqlFiles) {
    const sql = readFileSync(resolve(migrationsDir, file), 'utf-8')
    const statements = sql
      .split('--> statement-breakpoint')
      .map(s => s.trim())
      .filter(Boolean)

    for (const stmt of statements) {
      await client.unsafe(stmt)
    }
  }

  const db = drizzle(client, { schema })

  await db.insert(schema.events).values(
    loadJson('events.json').map((e: Record<string, unknown>) => ({
      ...e,
      date: new Date(e.date as string),
    })),
  )

  await db.insert(schema.users).values(loadJson('users.json'))
  await db.insert(schema.invitees).values(loadJson('invitees.json'))

  await db.insert(schema.invitations).values(
    loadJson('invitations.json').map((i: Record<string, unknown>) => ({
      ...i,
      expiresAt: new Date(i.expiresAt as string),
      ...(i.usedAt ? { usedAt: new Date(i.usedAt as string) } : {}),
    })),
  )

  await db.insert(schema.userEvents).values(loadJson('user-events.json'))

  await db.insert(schema.sessions).values(
    loadJson('sessions.json').map((s: Record<string, unknown>) => ({
      ...s,
    })),
  )

  await db.insert(schema.rooms).values(loadJson('rooms.json'))
  await db.insert(schema.sessionStars).values(loadJson('session-stars.json'))

  const roundsFixture = loadJson('rounds.json')
  if (roundsFixture.length > 0) {
    await db.insert(schema.rounds).values(
      roundsFixture.map((r: Record<string, unknown>) => ({
        ...r,
        ...(r.startTime ? { startTime: new Date(r.startTime as string) } : {}),
      })),
    )
    const roundRoomsFixture = loadJson('round-rooms.json')
    if (roundRoomsFixture.length > 0) {
      await db.insert(schema.roundRooms).values(roundRoomsFixture)
    }
    const slotsFixture = loadJson('slots.json')
    if (slotsFixture.length > 0) {
      await db.insert(schema.slots).values(slotsFixture)
    }
    const slotRegistrationsFixture = loadJson('slot-registrations.json')
    if (slotRegistrationsFixture.length > 0) {
      await db.insert(schema.slotRegistrations).values(slotRegistrationsFixture)
    }
  }

  await client.end()
}

// ─── Shared constants ─────────────────────────────────────────
export const ADMIN_EMAIL = 'helaili@github.com'
export const REGULAR_USER_EMAIL = 'diana.rivera@example.com'
export const TEST_PASSWORD = 'unconference'

// Well-known IDs from test/db/ fixture files
export const TEST_EVENT_ID = 'a0000000-0000-0000-0000-000000000001'
export const TEST_INVITEE_ALICE_ID = 'c0000000-0000-0000-0000-000000000001'
export const TEST_INVITEE_BOB_ID = 'c0000000-0000-0000-0000-000000000002'
export const TEST_INVITEE_DIANA_ID = 'c0000000-0000-0000-0000-000000000010'
export const TEST_INVITEE_WITHACCOUNT_ID = 'c0000000-0000-0000-0000-000000000040'
export const TEST_INVITEE_WITHOUTACCOUNT_ID = 'c0000000-0000-0000-0000-000000000041'
export const TEST_INVITATION_TOKEN_WITHACCOUNT = 'f0000000-0000-0000-0000-000000000040'
export const TEST_INVITATION_TOKEN_WITHOUTACCOUNT = 'f0000000-0000-0000-0000-000000000041'
export const WITHACCOUNT_EMAIL = 'halain987+withaccount@gmail.com'
export const WITHOUTACCOUNT_EMAIL = 'halain987+withaoutccount@gmail.com'

// Session fixture IDs
export const TEST_SESSION_PROPOSED_BY_DIANA_ID = 'd0000000-0000-0000-0000-000000000001'
export const TEST_SESSION_PUBLISHED_ID = 'd0000000-0000-0000-0000-000000000002'
export const TEST_SESSION_SCHEDULED_ID = 'd0000000-0000-0000-0000-000000000003'
export const TEST_SESSION_DELIVERED_ID = 'd0000000-0000-0000-0000-000000000004'
export const TEST_SESSION_PROPOSED_BY_NOAH_ID = 'd0000000-0000-0000-0000-000000000005'
export const TEST_SESSION_STAFF_PUBLISHED_ID = 'd0000000-0000-0000-0000-000000000006'

// Room fixture IDs
export const TEST_ROOM_WORKSHOP_ID = 'e0000000-0000-0000-0000-000000000001'
export const TEST_ROOM_MEETING_1_ID = 'e0000000-0000-0000-0000-000000000002'

// Star-related fixture IDs (sessions Diana has starred in seed data)
export const TEST_SESSION_STARRED_BY_DIANA_1 = 'd0000000-0000-0000-0000-000000000002'
export const TEST_SESSION_STARRED_BY_DIANA_2 = 'd0000000-0000-0000-0000-000000000003'
export const TEST_SESSION_STARRED_BY_DIANA_3 = 'd0000000-0000-0000-0000-000000000007'
export const TEST_SESSION_STARRED_BY_DIANA_4 = 'd0000000-0000-0000-0000-000000000008'
// Unstarred published session Diana can star as her 5th star
export const TEST_SESSION_UNSTARRED_PUBLISHED_ID = 'd0000000-0000-0000-0000-000000000006'

// Additional user emails for test logins
export const STAFF_USER_EMAIL = 'liam.obrien@example.com'
export const PARTICIPANT_USER_EMAIL = 'noah.williams@example.com'
export const OUTSIDER_EMAIL = 'test@example.com' // valid user but NOT in the test event's invitees

// Sessions assigned to slots in Round 2 (assigned round)
export const TEST_SESSION_IN_ASSIGNED_ROUND_1 = 'd0000000-0000-0000-0000-000000000002' // published
export const TEST_SESSION_IN_ASSIGNED_ROUND_2 = 'd0000000-0000-0000-0000-000000000007' // scheduled
export const TEST_SESSION_IN_ASSIGNED_ROUND_3 = 'd0000000-0000-0000-0000-000000000008' // published
// Sessions assigned to slots in Round 3 (open round)
export const TEST_SESSION_IN_OPEN_ROUND_1 = 'd0000000-0000-0000-0000-000000000009' // scheduled
export const TEST_SESSION_IN_OPEN_ROUND_2 = 'd0000000-0000-0000-0000-000000000012' // scheduled
export const TEST_ROUND_ASSIGNED_ID = 'aa000000-0000-0000-0000-000000000002'
export const TEST_ROUND_OPEN_ID = 'aa000000-0000-0000-0000-000000000003'

// Slot fixture IDs for the open round
export const TEST_OPEN_SLOT_MEETING1_ID = 'ab000000-0000-0000-0000-000000000010'
export const TEST_OPEN_SLOT_MEETING2_ID = 'ab000000-0000-0000-0000-000000000011'

/** Login via the API and return the session cookies string */
export async function loginAs(
  fetchFn: (path: string, options?: RequestInit) => Promise<Response>,
  email: string,
  password = TEST_PASSWORD,
): Promise<string> {
  const res = await fetchFn('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
    redirect: 'manual',
  })
  if (!res.ok) {
    throw new Error(`Login failed for ${email}: ${res.status} ${await res.text()}`)
  }
  const setCookies = res.headers.getSetCookie()
  return setCookies.map(c => c.split(';')[0]).join('; ')
}
