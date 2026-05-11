import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createConsola } from 'consola'
import * as schema from './schema'

const logger = createConsola().withTag('seed')

const __dirname = dirname(fileURLToPath(import.meta.url))

function loadJson(filename: string) {
  const path = resolve(__dirname, '../../test/db', filename)
  return JSON.parse(readFileSync(path, 'utf-8'))
}

const client = postgres(process.env.DATABASE_URL!)
const db = drizzle(client, { schema })

async function seed() {
  logger.info('Seeding database...')

  await migrate(db, { migrationsFolder: resolve(__dirname, '../../drizzle') })

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

  await db.insert(schema.sessions).values(loadJson('sessions.json'))

  await db.insert(schema.sessionStars).values(loadJson('session-stars.json'))

  await db.insert(schema.rooms).values(loadJson('rooms.json'))

  const roundsData = loadJson('rounds.json')
  if (roundsData.length > 0) {
    await db.insert(schema.rounds).values(
      roundsData.map((r: Record<string, unknown>) => ({
        ...r,
        ...(r.startTime ? { startTime: new Date(r.startTime as string) } : {}),
      })),
    )

    const roundRoomsData = loadJson('round-rooms.json')
    if (roundRoomsData.length > 0) {
      await db.insert(schema.roundRooms).values(roundRoomsData)
    }

    const slotsData = loadJson('slots.json')
    if (slotsData.length > 0) {
      await db.insert(schema.slots).values(slotsData)

      const slotRegistrationsData = loadJson('slot-registrations.json')
      if (slotRegistrationsData.length > 0) {
        await db.insert(schema.slotRegistrations).values(slotRegistrationsData)
      }
    }
  }

  logger.success('Seeding complete!')
  await client.end()
}

seed().catch((err) => {
  logger.error('Seeding failed:', err)
  process.exit(1)
})
