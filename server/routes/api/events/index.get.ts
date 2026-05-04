import { sql } from 'drizzle-orm'
import { events } from '~/server/database/schema'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  return useDB().select({
    id: events.id,
    name: events.name,
    description: events.description,
    date: events.date,
    submissionRestricted: events.submissionRestricted,
    minStars: events.minStars,
    maxStars: events.maxStars,
    createdAt: events.createdAt,
    updatedAt: events.updatedAt,
    inviteeCount: sql<number>`(select count(*)::int from invitees where invitees.event_id = events.id)`,
    sessionCount: sql<number>`(select count(*)::int from sessions where sessions.event_id = events.id)`,
  }).from(events).orderBy(events.createdAt)
})
