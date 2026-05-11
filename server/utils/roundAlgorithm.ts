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

/**
 * Timing parameters used to compute slot counts and time-window overlaps.
 * breakDuration is the gap between consecutive discussion slots.
 */
export interface SlotTiming {
  discussionDuration: number
  workshopDuration: number
  breakDuration: number
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
 * Number of sessions of duration `sessionDuration` that fit in a round of
 * `roundDuration` with `breakDuration` between them (no trailing break).
 *
 * Formula: floor((roundDuration + breakDuration) / (sessionDuration + breakDuration))
 *
 * Examples:
 *   countSlots(75, 30, 15) = floor(90/45) = 2  ✓
 *   countSlots(60, 30, 15) = floor(75/45) = 1  (not 2!)
 *   countSlots(75, 75, 15) = floor(90/90) = 1  ✓
 */
export function countSlots(roundDuration: number, sessionDuration: number, breakDuration: number): number {
  if (roundDuration < sessionDuration) return 0
  if (breakDuration <= 0) return Math.floor(roundDuration / sessionDuration)
  return Math.floor((roundDuration + breakDuration) / (sessionDuration + breakDuration))
}

/**
 * Returns the time window (minutes from round start) occupied by a slot.
 * Discussion and workshop slots use their respective durations as the unit.
 */
export function slotTimeWindow(
  slotIndex: number,
  sessionType: 'discussion' | 'workshop',
  timing: SlotTiming,
): { start: number; end: number } {
  if (sessionType === 'workshop') {
    const start = slotIndex * (timing.workshopDuration + timing.breakDuration)
    return { start, end: start + timing.workshopDuration }
  }
  const start = slotIndex * (timing.discussionDuration + timing.breakDuration)
  return { start, end: start + timing.discussionDuration }
}

/** True when two half-open [start, end) intervals overlap. */
export function windowsOverlap(
  a: { start: number; end: number },
  b: { start: number; end: number },
): boolean {
  return a.start < b.end && b.start < a.end
}

/**
 * Returns all discussion slot indices whose time window overlaps with the
 * workshop at `workshopSlotIndex`.
 *
 * Example (W=75, D=30, B=15):
 *   workshop at slotIndex 0 → [0, 30) → [0, 75) → blocks discussion 0 and 1
 */
export function workshopBlockedSlots(workshopSlotIndex: number, timing: SlotTiming): number[] {
  const ww = slotTimeWindow(workshopSlotIndex, 'workshop', timing)
  const blocked: number[] = []
  const discUnit = timing.discussionDuration + timing.breakDuration
  for (let j = 0; j * discUnit < ww.end; j++) {
    const dw = slotTimeWindow(j, 'discussion', timing)
    if (windowsOverlap(ww, dw)) blocked.push(j)
  }
  return blocked
}

/**
 * Returns the set of slot indices that a registration for `sessionType` at
 * `slotIndex` blocks for future assignment.
 * - Workshops block all overlapping discussion indices (via workshopBlockedSlots).
 * - Discussions block only their own slotIndex.
 * When `timing` is absent, falls back to single-index blocking.
 */
function blockedSlotsFor(
  slotIndex: number,
  sessionType: 'discussion' | 'workshop',
  timing?: SlotTiming,
): number[] {
  if (timing && sessionType === 'workshop') {
    return workshopBlockedSlots(slotIndex, timing)
  }
  return [slotIndex]
}

/**
 * Builds a slot plan for one session type (either all workshops or all discussions).
 *
 * Rules:
 *  - Slots are created: countSlots(roundDuration, defaultDuration, breakDuration) per room.
 *  - Sessions are assigned most-popular-first to biggest-room-first.
 *  - Each session is assigned to exactly one slot (no duplication within a round).
 *  - Remaining slots after all sessions are assigned get sessionId = null.
 */
export function buildSlotPlan(
  sessions: AlgoSession[],
  rooms: AlgoRoom[],
  roundDuration: number,
  defaultDuration: number,
  breakDuration = 0,
): SlotPlan[] {
  // Sort rooms by capacity DESC (deterministic: stable sort)
  const sortedRooms = [...rooms].sort((a, b) => b.maxCapacity - a.maxCapacity)

  // Build the slot queue: (room, slotIndex) pairs, biggest room first then by slotIndex
  const queue: { roomId: string; slotIndex: number; capacity: number }[] = []
  for (const room of sortedRooms) {
    const count = countSlots(roundDuration, defaultDuration, breakDuration)
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

    plan.push({ roomId: first.roomId, slotIndex: first.slotIndex, sessionId: session.id, capacity: first.capacity })

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
 *  - A user cannot be booked into two slots whose time windows overlap.
 *  - A user can only attend one instance of a duplicated session.
 *  - First-come first-served (voters array is pre-sorted by star timestamp).
 *  - Slot capacity is respected.
 *
 *  When `timing` is provided, workshop registrations block all overlapping
 *  discussion slot indices (based on the time-window model). Without timing,
 *  only exact slotIndex conflicts are prevented.
 */
export function assignParticipants(
  slots: SlotPlan[],
  voters: VoterRecord[],
  sessions: AlgoSession[],
  timing?: SlotTiming,
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

  // Build lookup: sessionId → session (for type lookup)
  const sessionTypeMap = new Map<string, 'discussion' | 'workshop'>()
  for (const s of sessions) sessionTypeMap.set(s.id, s.type)

  const assignments: ParticipantAssignment[] = []
  // Mutable fill counters per slotId
  const slotFill = new Map<string, number>()
  // userId → slotIndexes effectively blocked (discussion-index space)
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

      // Find a slot with capacity and no time-window conflict
      const target = sessionSlots.find((sl) => {
        const fill = slotFill.get(slotKey(sl)) ?? 0
        if (fill >= sl.capacity) return false
        const candidateBlocked = blockedSlotsFor(sl.slotIndex, session.type, timing)
        return !candidateBlocked.some((idx) => userIndexes.has(idx))
      })
      if (!target) continue

      const key = slotKey(target)
      slotFill.set(key, (slotFill.get(key) ?? 0) + 1)

      // Record all discussion slot indices blocked by this assignment
      const blocked = blockedSlotsFor(target.slotIndex, session.type, timing)
      for (const idx of blocked) userIndexes.add(idx)
      userIndexBookings.set(userId, userIndexes)

      userSessions.add(session.id)
      userSessionBookings.set(userId, userSessions)

      assignments.push({ slotIndex: target.slotIndex, roomId: target.roomId, sessionId: session.id, userId })
    }
  }

  return assignments
}

