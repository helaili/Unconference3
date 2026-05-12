import { eq, and } from 'drizzle-orm'
import { introductionRounds, introductionSlotAssignments, users, rooms } from '~/server/database/schema'

export default defineEventHandler(async (event) => {
  const eventId = getRouterParam(event, 'eventId')
  if (!eventId) {
    throw createError({ statusCode: 400, statusMessage: 'Event ID is required' })
  }

  const session = await getUserSession(event)
  const currentUser = session?.user
  if (!currentUser) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const db = useDB()
  const adminUser = (currentUser.login && isAdmin(currentUser.login)) ||
    (currentUser.email && isAdminEmail(currentUser.email))

  const [introRound] = await db
    .select()
    .from(introductionRounds)
    .where(eq(introductionRounds.eventId, eventId))
    .limit(1)

  if (!introRound) {
    // Admins get a 404 with explicit message; participants too (no draft info leaked)
    throw createError({ statusCode: 404, statusMessage: 'No introduction round for this event' })
  }

  // Participants only see data when round is open
  if (!adminUser && introRound.status !== 'open') {
    throw createError({ statusCode: 404, statusMessage: 'No introduction round for this event' })
  }

  // Fetch all assignments for this round
  const assignments = await db
    .select({
      id: introductionSlotAssignments.id,
      slotIndex: introductionSlotAssignments.slotIndex,
      userId: introductionSlotAssignments.userId,
      roomId: introductionSlotAssignments.roomId,
      userFirstName: users.firstName,
      userLastName: users.lastName,
      userEmail: users.email,
      roomName: rooms.name,
    })
    .from(introductionSlotAssignments)
    .innerJoin(users, eq(introductionSlotAssignments.userId, users.id))
    .innerJoin(rooms, eq(introductionSlotAssignments.roomId, rooms.id))
    .where(eq(introductionSlotAssignments.introRoundId, introRound.id))

  if (adminUser) {
    // Admin sees all slots with all groups
    const slotMap = new Map<number, Map<string, { roomName: string; participants: object[] }>>()

    for (const a of assignments) {
      if (!slotMap.has(a.slotIndex)) slotMap.set(a.slotIndex, new Map())
      const roomMap = slotMap.get(a.slotIndex)!
      if (!roomMap.has(a.roomId)) {
        roomMap.set(a.roomId, { roomName: a.roomName, participants: [] })
      }
      roomMap.get(a.roomId)!.participants.push({
        userId: a.userId,
        firstName: a.userFirstName,
        lastName: a.userLastName,
        email: a.userEmail,
      })
    }

    const slots = Array.from(slotMap.entries())
      .sort(([a], [b]) => a - b)
      .map(([slotIndex, roomMap]) => ({
        slotIndex,
        groups: Array.from(roomMap.entries()).map(([roomId, data]) => ({
          roomId,
          roomName: data.roomName,
          participants: data.participants,
        })),
      }))

    return {
      id: introRound.id,
      eventId: introRound.eventId,
      numSlots: introRound.numSlots,
      groupSize: introRound.groupSize,
      status: introRound.status,
      createdAt: introRound.createdAt,
      updatedAt: introRound.updatedAt,
      slots,
    }
  }

  // Participant: find current user's DB id, then return only their assignments
  const [dbUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, currentUser.email ?? ''))
    .limit(1)

  if (!dbUser) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }

  const myAssignments = assignments
    .filter(a => a.userId === dbUser.id)
    .sort((a, b) => a.slotIndex - b.slotIndex)
    .map(a => ({ slotIndex: a.slotIndex, roomId: a.roomId, roomName: a.roomName }))

  return {
    id: introRound.id,
    eventId: introRound.eventId,
    numSlots: introRound.numSlots,
    groupSize: introRound.groupSize,
    status: introRound.status,
    myAssignments,
  }
})
