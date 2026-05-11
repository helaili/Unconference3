import { count } from 'drizzle-orm'
import { createConsola } from 'consola'
import { useDB } from '../database'
import { events } from '../database/schema'
import { seedData } from '../database/seed'

const logger = createConsola().withTag('seed')

export default defineNitroPlugin(async () => {
  // Only auto-seed in dev, and never during automated tests
  if (!import.meta.dev || process.env.VITEST) return

  const db = useDB()

  try {
    const [{ value }] = await db.select({ value: count() }).from(events)
    if (value > 0) return

    await seedData(db)
  } catch (err) {
    logger.warn('Auto-seed skipped or failed:', err)
  }
})
