import { eq, and } from 'drizzle-orm'
import { rounds, slots, slotRegistrations, users } from '~/server/database/schema'

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

  if (round.status !== 'open') {
    throw createError({ statusCode: 403, statusMessage: 'Round is not open for booking' })
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

  // Find all slots in this round at the same slotIndex for conflict removal
  const sameIndexSlots = await db
    .select({ id: slots.id })
    .from(slots)
    .where(and(eq(slots.roundId, roundId), eq(slots.slotIndex, targetSlot.slotIndex)))

  const conflictSlotIds = sameIndexSlots.map((s) => s.id).filter((id) => id !== slotId)

  await db.transaction(async (tx) => {
    // Re-check capacity inside the transaction for safety
    const registrationCount = await tx.$count(slotRegistrations, eq(slotRegistrations.slotId, slotId))

    // Check if user is already registered for this exact slot
    const alreadyHere = await tx.query.slotRegistrations.findFirst({
      where: and(eq(slotRegistrations.slotId, slotId), eq(slotRegistrations.userId, dbUser.id)),
    })
    if (alreadyHere) return // idempotent

    if (registrationCount >= targetSlot.room.maxCapacity) {
      throw createError({ statusCode: 409, statusMessage: 'This session is full' })
    }

    // Remove existing registrations for the user at the same time slot
    for (const sid of conflictSlotIds) {
      await tx
        .delete(slotRegistrations)
        .where(and(eq(slotRegistrations.slotId, sid), eq(slotRegistrations.userId, dbUser.id)))
    }

    await tx.insert(slotRegistrations).values({ slotId, userId: dbUser.id })
  })

  logger.info(`User ${dbUser.id} booked slot ${slotId} (round ${roundId})`)
  return { success: true }
})
