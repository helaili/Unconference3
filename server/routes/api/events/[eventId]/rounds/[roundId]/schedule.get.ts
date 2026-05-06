import { eq, and } from 'drizzle-orm'
import { rounds, slots, slotRegistrations, users } from '~/server/database/schema'

export default defineEventHandler(async (event) => {
  const eventId = getRouterParam(event, 'eventId')
  const roundId = getRouterParam(event, 'roundId')
  if (!eventId || !roundId) {
    throw createError({ statusCode: 400, statusMessage: 'Event ID and Round ID are required' })
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

  const [dbUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, userEmail))
    .limit(1)

  if (!dbUser) {
    return []
  }

  // Find all slots this user is registered for in this round
  const mySlots = await db.query.slotRegistrations.findMany({
    where: eq(slotRegistrations.userId, dbUser.id),
    with: {
      slot: {
        with: {
          session: true,
          room: true,
        },
        where: eq(slots.roundId, roundId),
      },
    },
  })

  return mySlots
    .filter((r) => r.slot.roundId === roundId)
    .map((r) => ({
      slotId: r.slot.id,
      slotIndex: r.slot.slotIndex,
      room: r.slot.room,
      session: r.slot.session,
    }))
    .sort((a, b) => a.slotIndex - b.slotIndex)
})
