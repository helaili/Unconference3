/**
 * Pure-function core of the round scheduling algorithm.
 * No database dependencies — all inputs are plain objects.
 */

export interface AlgoRoom {
  id: string
  type: 'workshop' | 'meeting' | 'both'
  maxCapacity: number
}

export interface AlgoSession {
  id: string
  type: 'discussion' | 'workshop'
  /** Custom duration; falls back to defaultDuration when null/undefined. */
  duration?: number | null
  starCount: number
}

export interface SlotPlan {
  roomId: string
  slotIndex: number
  sessionId: string | null
  capacity: number
}

export interface ParticipantAssignment {
  slotIndex: number
  roomId: string
  sessionId: string
  userId: string
}

/** True if a room can host the given session type. */
export function roomMatchesSessionType(
  roomType: 'workshop' | 'meeting' | 'both',
  sessionType: 'discussion' | 'workshop',
): boolean {
  if (roomType === 'both') return true
  if (sessionType === 'discussion' && roomType === 'meeting') return true
  if (sessionType === 'workshop' && roomType === 'workshop') return true
  return false
}

/**
 * Builds a slot plan for one session type (either all workshops or all discussions).
 *
 * Rules:
 *  - Slots are created: floor(roundDuration / defaultDuration) per room.
 *  - Sessions are assigned most-popular-first to biggest-room-first.
 *  - A session is duplicated when starCount > top-room capacity AND a spare slot
 *    at a different slotIndex exists.  If no different-index slot exists, both
 *    instances are placed at slotIndex 0 (concurrent rooms).
 *  - Remaining slots after all sessions are assigned get sessionId = null.
 */
export function buildSlotPlan(
  sessions: AlgoSession[],
  rooms: AlgoRoom[],
  roundDuration: number,
  defaultDuration: number,
): SlotPlan[] {
  // Sort rooms by capacity DESC (deterministic: stable sort)
  const sortedRooms = [...rooms].sort((a, b) => b.maxCapacity - a.maxCapacity)

  // Build the slot queue: (room, slotIndex) pairs, biggest room first then by slotIndex
  const queue: { roomId: string; slotIndex: number; capacity: number }[] = []
  for (const room of sortedRooms) {
    const count = Math.floor(roundDuration / defaultDuration)
    for (let i = 0; i < count; i++) {
      queue.push({ roomId: room.id, slotIndex: i, capacity: room.maxCapacity })
    }
  }

  if (queue.length === 0 || sessions.length === 0) {
    return queue.map((s) => ({ ...s, sessionId: null }))
  }

  const plan: SlotPlan[] = []
  // Work on a mutable copy of the queue
  const remaining = [...queue]
  let sessionIdx = 0

  while (remaining.length > 0 && sessionIdx < sessions.length) {
    const session = sessions[sessionIdx]
    const first = remaining.shift()! // biggest available slot

    const shouldDuplicate = session.starCount > first.capacity && remaining.length > 0

    if (shouldDuplicate) {
      // Prefer a second slot at a DIFFERENT slotIndex
      const secondPos = remaining.findIndex((s) => s.slotIndex !== first.slotIndex)
      const usePos = secondPos !== -1 ? secondPos : 0
      const second = remaining.splice(usePos, 1)[0]

      plan.push({ roomId: first.roomId, slotIndex: first.slotIndex, sessionId: session.id, capacity: first.capacity })
      plan.push({ roomId: second.roomId, slotIndex: second.slotIndex, sessionId: session.id, capacity: second.capacity })
    } else {
      plan.push({ roomId: first.roomId, slotIndex: first.slotIndex, sessionId: session.id, capacity: first.capacity })
    }

    sessionIdx++
  }

  // Fill leftover slots as unassigned
  for (const s of remaining) {
    plan.push({ roomId: s.roomId, slotIndex: s.slotIndex, sessionId: null, capacity: s.capacity })
  }

  return plan
}

export interface VoterRecord {
  sessionId: string
  userId: string
}

/**
 * Assigns participants (voters) to slots according to these rules:
 *  - Process workshop slots first, then discussion slots (within each group: most-popular first).
 *  - A user cannot be booked into two slots at the same slotIndex.
 *  - A user can only attend one instance of a duplicated session.
 *  - First-come first-served (voters array is pre-sorted by star timestamp).
 *  - Slot capacity is respected.
 */
export function assignParticipants(
  slots: SlotPlan[],
  voters: VoterRecord[],
  sessions: AlgoSession[],
): ParticipantAssignment[] {
  // Sort sessions: workshops first, then discussions; within each group sort by starCount DESC
  const orderedSessions = [...sessions].sort((a, b) => {
    if (a.type !== b.type) return a.type === 'workshop' ? -1 : 1
    return b.starCount - a.starCount
  })

  // Build lookup: sessionId → slots for that session
  const sessionSlotMap = new Map<string, SlotPlan[]>()
  for (const slot of slots) {
    if (!slot.sessionId) continue
    const arr = sessionSlotMap.get(slot.sessionId) ?? []
    arr.push(slot)
    sessionSlotMap.set(slot.sessionId, arr)
  }

  // Build lookup: sessionId → voters (in order)
  const sessionVotersMap = new Map<string, string[]>()
  for (const v of voters) {
    const arr = sessionVotersMap.get(v.sessionId) ?? []
    arr.push(v.userId)
    sessionVotersMap.set(v.sessionId, arr)
  }

  const assignments: ParticipantAssignment[] = []
  // Mutable fill counters per slotId
  const slotFill = new Map<string, number>()
  // userId → slotIndexes booked
  const userIndexBookings = new Map<string, Set<number>>()
  // userId → sessionIds booked
  const userSessionBookings = new Map<string, Set<string>>()

  const slotKey = (s: SlotPlan) => `${s.roomId}|${s.slotIndex}`

  for (const session of orderedSessions) {
    const sessionSlots = sessionSlotMap.get(session.id) ?? []
    if (sessionSlots.length === 0) continue

    const sessionVoters = sessionVotersMap.get(session.id) ?? []

    for (const userId of sessionVoters) {
      const userIndexes = userIndexBookings.get(userId) ?? new Set<number>()
      const userSessions = userSessionBookings.get(userId) ?? new Set<string>()

      // Skip if already assigned to this session (another instance)
      if (userSessions.has(session.id)) continue

      // Find a slot with capacity and no time conflict
      const target = sessionSlots.find((sl) => {
        const fill = slotFill.get(slotKey(sl)) ?? 0
        return fill < sl.capacity && !userIndexes.has(sl.slotIndex)
      })
      if (!target) continue

      const key = slotKey(target)
      slotFill.set(key, (slotFill.get(key) ?? 0) + 1)

      userIndexes.add(target.slotIndex)
      userIndexBookings.set(userId, userIndexes)

      userSessions.add(session.id)
      userSessionBookings.set(userId, userSessions)

      assignments.push({ slotIndex: target.slotIndex, roomId: target.roomId, sessionId: session.id, userId })
    }
  }

  return assignments
}
