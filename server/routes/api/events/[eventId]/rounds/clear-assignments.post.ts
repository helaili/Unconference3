import { eq, inArray } from 'drizzle-orm'
import { rounds, slots, slotRegistrations } from '~/server/database/schema'

export default defineEventHandler(async (event) => {
  const eventId = getRouterParam(event, 'eventId')
  if (!eventId) {
    throw createError({ statusCode: 400, statusMessage: 'Event ID is required' })
  }

  await requireAdmin(event)

  const db = useDB()

  const eventRounds = await db
    .select({ id: rounds.id })
    .from(rounds)
    .where(eq(rounds.eventId, eventId))

  if (eventRounds.length === 0) {
    return { cleared: 0 }
  }

  const roundIds = eventRounds.map((r) => r.id)

  const eventSlots = await db
    .select({ id: slots.id })
    .from(slots)
    .where(inArray(slots.roundId, roundIds))

  if (eventSlots.length > 0) {
    const slotIds = eventSlots.map((s) => s.id)
    await db.delete(slotRegistrations).where(inArray(slotRegistrations.slotId, slotIds))
    await db.delete(slots).where(inArray(slots.id, slotIds))
  }

  await db
    .update(rounds)
    .set({ status: 'draft', updatedAt: new Date() })
    .where(inArray(rounds.id, roundIds))

  return { cleared: roundIds.length }
})
