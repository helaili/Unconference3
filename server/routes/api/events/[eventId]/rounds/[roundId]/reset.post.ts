import { eq, and, inArray } from 'drizzle-orm'
import { rounds, roundRooms, slots, slotRegistrations } from '~/server/database/schema'

export default defineEventHandler(async (event) => {
  const eventId = getRouterParam(event, 'eventId')
  const roundId = getRouterParam(event, 'roundId')
  if (!eventId || !roundId) {
    throw createError({ statusCode: 400, statusMessage: 'Event ID and Round ID are required' })
  }

  await requireAdmin(event)

  const db = useDB()

  const [round] = await db
    .select()
    .from(rounds)
    .where(and(eq(rounds.id, roundId), eq(rounds.eventId, eventId)))
    .limit(1)

  if (!round) {
    throw createError({ statusCode: 404, statusMessage: 'Round not found' })
  }

  // Collect slot IDs so we can cascade-delete registrations first
  const roundSlots = await db
    .select({ id: slots.id })
    .from(slots)
    .where(eq(slots.roundId, roundId))

  if (roundSlots.length) {
    const slotIds = roundSlots.map((s) => s.id)
    await db.delete(slotRegistrations).where(inArray(slotRegistrations.slotId, slotIds))
    await db.delete(slots).where(eq(slots.roundId, roundId))
  }

  await db.delete(roundRooms).where(eq(roundRooms.roundId, roundId))

  const [updated] = await db
    .update(rounds)
    .set({ status: 'draft', updatedAt: new Date() })
    .where(eq(rounds.id, roundId))
    .returning()

  return updated
})
