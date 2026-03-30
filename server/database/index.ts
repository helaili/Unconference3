import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { createConsola, LogLevels } from 'consola'
import * as schema from './schema'

const logger = createConsola({
  level: import.meta.dev ? LogLevels.Debug : LogLevels.Warn,
}).withTag('database')

let _db: PostgresJsDatabase<typeof schema> | null = null

export function useDB(): PostgresJsDatabase<typeof schema> {
  if (!_db) {
    const connectionString = process.env.DATABASE_URL
    if (!connectionString) {
      throw new Error('DATABASE_URL environment variable is not set')
    }
    const client = postgres(connectionString)
    _db = drizzle(client, { schema })
    logger.info('Database connection established')
  }
  return _db
}
