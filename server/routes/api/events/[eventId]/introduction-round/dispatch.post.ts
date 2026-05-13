import { eq, and, inArray } from 'drizzle-orm'
import { events, introductionRounds, introductionSlotAssignments, userEvents, users, rooms } from '~/server/database/schema'
import { dispatchIntroductionRound } from '~/server/utils/introductionAlgorithm'

const logger = useLogger('introduction-round')

export default defineEventHandler(async (event) => {
  const eventId = getRouterParam(event, 'eventId')
  if (!eventId) {
    throw createError({ statusCode: 400, statusMessage: 'Event ID is required' })
  }

  await requireAdmin(event)

  const db = useDB()

  const [eventRow] = await db.select().from(events).where(eq(events.id, eventId)).limit(1)
  if (!eventRow) {
    throw createError({ statusCode: 404, statusMessage: 'Event not found' })
  }

  const [introRound] = await db
    .select()
    .from(introductionRounds)
    .where(eq(introductionRounds.eventId, eventId))
    .limit(1)

  if (!introRound) {
    throw createError({ statusCode: 404, statusMessage: 'No introduction round configured for this event' })
  }

  // Fetch registered participants (users with user_events records for this event)
  const participantRows = await db
    .select({ userId: users.id, email: users.email })
    .from(userEvents)
    .innerJoin(users, eq(userEvents.userId, users.id))
    .where(and(eq(userEvents.eventId, eventId)))

  if (participantRows.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'No registered participants found for this event' })
  }

  const participants = participantRows.map(r => ({
    userId: r.userId,
    email: r.email ?? '',
  }))

  // Fetch rooms: use selected roomIds if configured, otherwise all event rooms
  let eventRooms: { id: string }[]
  if (introRound.roomIds && introRound.roomIds.length > 0) {
    eventRooms = await db
      .select({ id: rooms.id })
      .from(rooms)
      .where(and(eq(rooms.eventId, eventId), inArray(rooms.id, introRound.roomIds)))
  } else {
    eventRooms = await db
      .select({ id: rooms.id })
      .from(rooms)
      .where(eq(rooms.eventId, eventId))
  }

  if (eventRooms.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'No rooms found for this event' })
  }

  logger.info(`Dispatching introduction round for event ${eventId}: ${participants.length} participants, ${eventRooms.length} rooms, ${introRound.numSlots} slots, groupSize=${introRound.groupSize}`)

  const assignments = dispatchIntroductionRound(
    participants,
    eventRooms,
    introRound.numSlots,
    introRound.groupSize,
  )

  // Persist inside a transaction: delete old assignments and insert new ones
  await db.transaction(async (tx) => {
    await tx
      .delete(introductionSlotAssignments)
      .where(eq(introductionSlotAssignments.introRoundId, introRound.id))

    if (assignments.length > 0) {
      await tx.insert(introductionSlotAssignments).values(
        assignments.map(a => ({
          introRoundId: introRound.id,
          slotIndex: a.slotIndex,
          userId: a.userId,
          roomId: a.roomId,
        })),
      )
    }

    await tx
      .update(introductionRounds)
      .set({ status: 'open', updatedAt: new Date() })
      .where(eq(introductionRounds.id, introRound.id))
  })

  logger.info(`Introduction round dispatched: ${assignments.length} assignments created`)

  const [updated] = await db.select().from(introductionRounds).where(eq(introductionRounds.id, introRound.id)).limit(1)
  return updated
})
