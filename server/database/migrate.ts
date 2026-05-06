import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { createConsola } from 'consola'

const logger = createConsola().withTag('migrate')

const __dirname = dirname(fileURLToPath(import.meta.url))
const migrationsFolder = resolve(__dirname, '../../drizzle')

const client = postgres(process.env.DATABASE_URL!)
const db = drizzle(client)

// Backfill drizzle.__drizzle_migrations when tables already exist but tracking
// is empty (e.g. DB was initialized via Docker init scripts without tracking).
async function backfillMigrationHistory() {
  const journal = JSON.parse(readFileSync(resolve(migrationsFolder, 'meta/_journal.json'), 'utf-8'))
  for (const entry of journal.entries) {
    const content = readFileSync(resolve(migrationsFolder, `${entry.tag}.sql`), 'utf-8')
    const hash = createHash('sha256').update(content).digest('hex')
    await client`INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES (${hash}, ${entry.when})`
  }
}

async function runMigrations() {
  logger.info('Running migrations...')
  try {
    await migrate(db, { migrationsFolder })
  } catch (err: unknown) {
    const cause = (err as { cause?: { message?: string } })?.cause
    if (cause?.message?.includes('already exists')) {
      logger.warn('Tables exist without migration tracking — backfilling migration history')
      await backfillMigrationHistory()
      await migrate(db, { migrationsFolder })
    } else {
      throw err
    }
  }
  logger.success('Migrations complete!')
  await client.end()
}

runMigrations().catch((err) => {
  logger.error('Migration failed:', err)
  process.exit(1)
})

