import { eq, and, sql } from 'drizzle-orm'
import { rounds, slots, slotRegistrations, users } from '~/server/database/schema'

export default defineEventHandler(async (event) => {
  const eventId = getRouterParam(event, 'eventId')
  const roundId = getRouterParam(event, 'roundId')
  if (!eventId || !roundId) {
    throw createError({ statusCode: 400, statusMessage: 'Event ID and Round ID are required' })
  }

  await requireEventAccess(event, eventId)

  const db = useDB()

  const [round] = await db
    .select()
    .from(rounds)
    .where(and(eq(rounds.id, roundId), eq(rounds.eventId, eventId)))
    .limit(1)

  if (!round) {
    throw createError({ statusCode: 404, statusMessage: 'Round not found' })
  }

  if (round.status === 'draft') {
    throw createError({ statusCode: 403, statusMessage: 'Round is not yet open for booking' })
  }

  const session = await getUserSession(event)
  const userEmail = session?.user?.email

  // Get all slots with sessions that have remaining capacity
  const allSlots = await db.query.slots.findMany({
    where: eq(slots.roundId, roundId),
    with: {
      session: true,
      room: true,
      registrations: true,
    },
  })

  // If authenticated, exclude slots the user is already registered for
  let userBookedSlotIndexes: Set<number> = new Set()
  if (userEmail) {
    const [dbUser] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, userEmail))
      .limit(1)

    if (dbUser) {
      const myRegs = await db
        .select({ slotId: slotRegistrations.slotId })
        .from(slotRegistrations)
        .where(eq(slotRegistrations.userId, dbUser.id))

      const mySlotIds = new Set(myRegs.map((r) => r.slotId))
      userBookedSlotIndexes = new Set(
        allSlots
          .filter((s) => mySlotIds.has(s.id))
          .map((s) => s.slotIndex),
      )
    }
  }

  return allSlots
    .filter((slot) => {
      if (!slot.session) return false
      const seatsLeft = slot.room.maxCapacity - slot.registrations.length
      if (seatsLeft <= 0) return false
      // Exclude slots at times the user is already booked
      if (userBookedSlotIndexes.has(slot.slotIndex)) return false
      return true
    })
    .map((slot) => ({
      slotId: slot.id,
      slotIndex: slot.slotIndex,
      session: slot.session,
      room: slot.room,
      seatsLeft: slot.room.maxCapacity - slot.registrations.length,
    }))
    .sort((a, b) => a.slotIndex - b.slotIndex)
})
