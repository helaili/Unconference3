import { eq, and } from 'drizzle-orm'
import { rounds, slots, slotRegistrations, users } from '~/server/database/schema'
import { slotTimeWindow, windowsOverlap } from '~/server/utils/roundAlgorithm'
import type { SlotTiming } from '~/server/utils/roundAlgorithm'

const logger = useLogger('rounds')

export default defineEventHandler(async (event) => {
  const eventId = getRouterParam(event, 'eventId')
  const roundId = getRouterParam(event, 'roundId')
  const slotId = getRouterParam(event, 'slotId')
  if (!eventId || !roundId || !slotId) {
    throw createError({ statusCode: 400, statusMessage: 'Event ID, Round ID, and Slot ID are required' })
  }

  await requireEventAccess(event, eventId)

  const httpSession = await getUserSession(event)
  const userEmail = httpSession?.user?.email
  if (!userEmail) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

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

  const targetSlot = await db.query.slots.findFirst({
    where: and(eq(slots.id, slotId), eq(slots.roundId, roundId)),
    with: { room: true, session: true },
  })

  if (!targetSlot || !targetSlot.sessionId) {
    throw createError({ statusCode: 404, statusMessage: 'Slot not found or has no session assigned' })
  }

  const [dbUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, userEmail))
    .limit(1)

  if (!dbUser) {
    throw createError({ statusCode: 403, statusMessage: 'User not found' })
  }

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

  // Compute target slot's time window
  const targetType = (targetSlot.session?.type ?? 'discussion') as 'discussion' | 'workshop'
  const targetWindow = slotTimeWindow(targetSlot.slotIndex, targetType, timing)

  // Get all user's existing registrations for this round with slot/session info
  const existingRegs = await db.query.slotRegistrations.findMany({
    where: eq(slotRegistrations.userId, dbUser.id),
    with: {
      slot: {
        with: { session: true },
      },
    },
  })

  const roundRegs = existingRegs.filter((r) => r.slot?.roundId === roundId)

  // Check for time-window conflict
  for (const reg of roundRegs) {
    if (!reg.slot) continue
    const regType = (reg.slot.session?.type ?? 'discussion') as 'discussion' | 'workshop'
    const regWindow = slotTimeWindow(reg.slot.slotIndex, regType, timing)
    if (windowsOverlap(targetWindow, regWindow)) {
      throw createError({ statusCode: 409, statusMessage: 'You are already booked for another session at this time' })
    }
  }

  // Check room capacity
  const registrationCount = await db.$count(slotRegistrations, eq(slotRegistrations.slotId, slotId))
  if (registrationCount >= targetSlot.room.maxCapacity) {
    throw createError({ statusCode: 409, statusMessage: 'This session is full' })
  }

  // Check if already registered
  const alreadyRegistered = await db.query.slotRegistrations.findFirst({
    where: and(eq(slotRegistrations.slotId, slotId), eq(slotRegistrations.userId, dbUser.id)),
  })

  if (alreadyRegistered) {
    throw createError({ statusCode: 409, statusMessage: 'Already registered for this slot' })
  }

  await db.insert(slotRegistrations).values({ slotId, userId: dbUser.id })

  logger.info(`User ${dbUser.id} registered for slot ${slotId}`)
  return { success: true }
})
