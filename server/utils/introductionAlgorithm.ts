/**
 * Pure-function core of the introduction round dispatch algorithm.
 * No database dependencies — all inputs are plain objects.
 *
 * Rules:
 *  - Room capacity (maxCapacity) and type are intentionally NOT checked per spec.
 *  - groupSize is the sole per-room capacity limit.
 *  - Hard-best-effort: minimise same-email-domain co-placement (weight 1000).
 *  - Soft: minimise repeat co-inhabitants across slots (weight 1).
 */

export interface IntroParticipant {
  userId: string
  email: string
}

export interface IntroRoom {
  id: string
}

export interface IntroAssignment {
  userId: string
  roomId: string
  slotIndex: number
}

function emailDomain(email: string): string {
  return (email.split('@')[1] ?? 'unknown').toLowerCase()
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const copy = [...arr]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j]!, copy[i]!]
  }
  return copy
}

/**
 * Dispatch all participants into rooms for every slot.
 *
 * @param participants  Registered users to dispatch.
 * @param rooms         Available rooms for this event (all used, capped to
 *                      ceil(participants.length / groupSize)).
 * @param numSlots      Number of introduction slots.
 * @param groupSize     Maximum participants per room per slot.
 * @param rng           Optional seeded random function (defaults to Math.random).
 * @returns             Flat list of assignments across all slots.
 */
export function dispatchIntroductionRound(
  participants: IntroParticipant[],
  rooms: IntroRoom[],
  numSlots: number,
  groupSize: number,
  rng: () => number = Math.random,
): IntroAssignment[] {
  if (participants.length === 0 || rooms.length === 0 || numSlots < 1 || groupSize < 1) {
    return []
  }

  const numRooms = Math.min(rooms.length, Math.ceil(participants.length / groupSize))
  const selectedRooms = rooms.slice(0, numRooms)

  // userId -> domain (precomputed)
  const domainOf = new Map<string, string>(participants.map(p => [p.userId, emailDomain(p.email)]))

  const allAssignments: IntroAssignment[] = []

  // userId -> Set<userId> of all previous co-habitants
  const cohabited = new Map<string, Set<string>>()

  for (let slot = 0; slot < numSlots; slot++) {
    const shuffled = shuffle(participants, rng)

    // roomId -> assigned userId[]
    const roomFill = new Map<string, string[]>()
    for (const room of selectedRooms) roomFill.set(room.id, [])

    for (const participant of shuffled) {
      const pDomain = domainOf.get(participant.userId)!
      const myPrevious = cohabited.get(participant.userId) ?? new Set<string>()

      let bestRoomId: string | null = null
      let bestScore = Infinity

      for (const room of selectedRooms) {
        const occupants = roomFill.get(room.id)!
        if (occupants.length >= groupSize) continue

        const sameDomainCount = occupants.filter(uid => domainOf.get(uid) === pDomain).length
        const repeatCount = occupants.filter(uid => myPrevious.has(uid)).length
        const score = sameDomainCount * 1000 + repeatCount

        if (score < bestScore) {
          bestScore = score
          bestRoomId = room.id
        }
      }

      if (bestRoomId === null) {
        // All rooms full (shouldn't happen with correct numRooms, but handle gracefully)
        bestRoomId = selectedRooms[slot % selectedRooms.length]!.id
      }

      roomFill.get(bestRoomId)!.push(participant.userId)
      allAssignments.push({ userId: participant.userId, roomId: bestRoomId, slotIndex: slot })
    }

    // Update cohabitation tracking
    for (const occupants of roomFill.values()) {
      for (const uid of occupants) {
        const s = cohabited.get(uid) ?? new Set<string>()
        for (const other of occupants) {
          if (other !== uid) s.add(other)
        }
        cohabited.set(uid, s)
      }
    }
  }

  return allAssignments
}
