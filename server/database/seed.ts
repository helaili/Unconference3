import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as schema from './schema'

const __dirname = dirname(fileURLToPath(import.meta.url))

function loadJson(filename: string) {
  const path = resolve(__dirname, '../../test/db', filename)
  return JSON.parse(readFileSync(path, 'utf-8'))
}

const client = postgres(process.env.DATABASE_URL!)
const db = drizzle(client, { schema })

async function seed() {
  console.log('Seeding database...')

  await db.insert(schema.events).values(
    loadJson('events.json').map((e: Record<string, unknown>) => ({ ...e, date: new Date(e.date as string) })),
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

  console.log('Seeding complete!')
  await client.end()
}

seed().catch((err) => {
  console.error(err)
  process.exit(1)
})
