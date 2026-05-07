import { eq, and } from 'drizzle-orm'
import { rounds, slots, slotRegistrations, users, events } from '~/server/database/schema'
import { slotTimeWindow, windowsOverlap } from '~/server/utils/roundAlgorithm'
import type { SlotTiming } from '~/server/utils/roundAlgorithm'

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

  const httpSession = await getUserSession(event)
  const userEmail = httpSession?.user?.email

  // Fetch event durations for time-window calculations
  const eventRow = await db.query.events.findFirst({
    where: (e) => eq(e.id, eventId),
    columns: { defaultDiscussionDuration: true, defaultWorkshopDuration: true },
  })
  const timing: SlotTiming = {
    discussionDuration: eventRow?.defaultDiscussionDuration ?? 30,
    workshopDuration: eventRow?.defaultWorkshopDuration ?? 75,
    breakDuration: round.breakDuration,
  }

  // Get all slots with sessions that have remaining capacity
  const allSlots = await db.query.slots.findMany({
    where: eq(slots.roundId, roundId),
    with: {
      session: true,
      room: true,
      registrations: true,
    },
  })

  // If authenticated, compute user's booked time windows for conflict detection
  let userBookedWindows: { start: number; end: number }[] = []
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
      userBookedWindows = allSlots
        .filter((s) => mySlotIds.has(s.id))
        .map((s) => slotTimeWindow(s.slotIndex, (s.session?.type ?? 'discussion') as 'discussion' | 'workshop', timing))
    }
  }

  return allSlots
    .filter((slot) => {
      if (!slot.session) return false
      const seatsLeft = slot.room.maxCapacity - slot.registrations.length
      if (seatsLeft <= 0) return false
      // Exclude slots whose time window overlaps with any of the user's bookings
      if (userBookedWindows.length > 0) {
        const candidateWindow = slotTimeWindow(slot.slotIndex, slot.session.type as 'discussion' | 'workshop', timing)
        if (userBookedWindows.some((w) => windowsOverlap(candidateWindow, w))) return false
      }
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
