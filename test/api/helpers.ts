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
    DROP TABLE IF EXISTS user_events CASCADE;
    DROP TABLE IF EXISTS invitations CASCADE;
    DROP TABLE IF EXISTS invitees CASCADE;
    DROP TABLE IF EXISTS users CASCADE;
    DROP TABLE IF EXISTS events CASCADE;
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
