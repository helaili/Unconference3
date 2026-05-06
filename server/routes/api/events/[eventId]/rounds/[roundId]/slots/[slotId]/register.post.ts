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

  const session = await getUserSession(event)
  const userEmail = session?.user?.email
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

  const [slot] = await db
    .select()
    .from(slots)
    .where(and(eq(slots.id, slotId), eq(slots.roundId, roundId)))
    .limit(1)

  if (!slot || !slot.sessionId) {
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

  // Check for slotIndex conflict
  const existingAtSameTime = await db.query.slotRegistrations.findFirst({
    where: eq(slotRegistrations.userId, dbUser.id),
    with: {
      slot: {
        where: and(eq(slots.roundId, roundId), eq(slots.slotIndex, slot.slotIndex)),
      },
    },
  })

  if (existingAtSameTime?.slot?.id) {
    throw createError({ statusCode: 409, statusMessage: 'You are already booked for another session at this time' })
  }

  // Check room capacity
  const registrationCount = await db.$count(slotRegistrations, eq(slotRegistrations.slotId, slotId))
  const [roomRow] = await db
    .select({ maxCapacity: slots.roundId })
    .from(slots)
    .where(eq(slots.id, slotId))
    .limit(1)

  // Get actual capacity from the room
  const slotWithRoom = await db.query.slots.findFirst({
    where: eq(slots.id, slotId),
    with: { room: true },
  })

  if (!slotWithRoom) {
    throw createError({ statusCode: 404, statusMessage: 'Slot not found' })
  }

  if (registrationCount >= slotWithRoom.room.maxCapacity) {
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
