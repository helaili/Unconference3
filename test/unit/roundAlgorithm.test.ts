import { describe, it, expect } from 'vitest'
import {
  roomMatchesSessionType,
  buildSlotPlan,
  assignParticipants,
} from '../../server/utils/roundAlgorithm'
import type { AlgoRoom, AlgoSession, VoterRecord } from '../../server/utils/roundAlgorithm'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function room(id: string, type: AlgoRoom['type'], cap: number): AlgoRoom {
  return { id, type, maxCapacity: cap }
}

function session(id: string, type: AlgoSession['type'], stars: number): AlgoSession {
  return { id, type, starCount: stars }
}

function vote(userId: string, sessionId: string): VoterRecord {
  return { userId, sessionId }
}

// ─── roomMatchesSessionType ───────────────────────────────────────────────────

describe('roomMatchesSessionType', () => {
  it('meeting room matches discussion', () => {
    expect(roomMatchesSessionType('meeting', 'discussion')).toBe(true)
  })

  it('meeting room does NOT match workshop', () => {
    expect(roomMatchesSessionType('meeting', 'workshop')).toBe(false)
  })

  it('workshop room matches workshop', () => {
    expect(roomMatchesSessionType('workshop', 'workshop')).toBe(true)
  })

  it('workshop room does NOT match discussion', () => {
    expect(roomMatchesSessionType('workshop', 'discussion')).toBe(false)
  })

  it('both room matches discussion', () => {
    expect(roomMatchesSessionType('both', 'discussion')).toBe(true)
  })

  it('both room matches workshop', () => {
    expect(roomMatchesSessionType('both', 'workshop')).toBe(true)
  })
})

// ─── buildSlotPlan ────────────────────────────────────────────────────────────

describe('buildSlotPlan', () => {
  it('Scenario 1: correct slot counts for 75-min round with 30-min discussions', () => {
    const rooms = [room('A', 'meeting', 20), room('B', 'meeting', 15)]
    const sessions: AlgoSession[] = []
    const plan = buildSlotPlan(sessions, rooms, 75, 30)
    // floor(75/30) = 2 slots per room → 4 total, all unassigned
    expect(plan).toHaveLength(4)
    expect(plan.every((s) => s.sessionId === null)).toBe(true)
  })

  it('Scenario 1: correct slot counts for 75-min round with 75-min workshops', () => {
    const plan = buildSlotPlan([], [room('W', 'workshop', 30)], 75, 75)
    expect(plan).toHaveLength(1)
  })

  it('assigns most popular session to biggest room', () => {
    const rooms = [room('Small', 'meeting', 8), room('Big', 'meeting', 15)]
    const sessions = [session('Popular', 'discussion', 10), session('Niche', 'discussion', 3)]
    const plan = buildSlotPlan(sessions, rooms, 30, 30)

    // 2 rooms × 1 slot each = 2 slots
    expect(plan).toHaveLength(2)
    const bigSlot = plan.find((s) => s.roomId === 'Big')!
    expect(bigSlot.sessionId).toBe('Popular')
    const smallSlot = plan.find((s) => s.roomId === 'Small')!
    expect(smallSlot.sessionId).toBe('Niche')
  })

  it('Scenario 2: leaves a slot unassigned when fewer sessions than slots', () => {
    const rooms = [room('A', 'meeting', 15), room('B', 'meeting', 10)]
    const sessions = [session('Alpha', 'discussion', 12), session('Beta', 'discussion', 8), session('Gamma', 'discussion', 5)]
    // 2 rooms × 2 slots (floor(60/30)) = 4 slots, 3 sessions
    const plan = buildSlotPlan(sessions, rooms, 60, 30)

    expect(plan).toHaveLength(4)
    const assigned = plan.filter((s) => s.sessionId !== null)
    expect(assigned).toHaveLength(3)
    const unassigned = plan.filter((s) => s.sessionId === null)
    expect(unassigned).toHaveLength(1)
  })

  it('Scenario 3: duplicates a popular session at a DIFFERENT slotIndex', () => {
    // 2 meeting rooms (cap 8), round=75min, discussion=30min → 4 slots (slotIndex 0 and 1 in each room)
    const rooms = [room('R1', 'meeting', 8), room('R2', 'meeting', 8)]
    const sessions = [
      session('A', 'discussion', 15), // 15 > 8 → duplicate
      session('B', 'discussion', 8),
      session('C', 'discussion', 5),
    ]
    const plan = buildSlotPlan(sessions, rooms, 75, 30)

    expect(plan).toHaveLength(4)

    const aSlots = plan.filter((s) => s.sessionId === 'A')
    expect(aSlots).toHaveLength(2)
    // The two instances must be at DIFFERENT slotIndexes
    expect(aSlots[0].slotIndex).not.toBe(aSlots[1].slotIndex)
  })

  it('fills all 4 slots correctly in Scenario 3 (A twice, B once, C once)', () => {
    const rooms = [room('R1', 'meeting', 8), room('R2', 'meeting', 8)]
    const sessions = [
      session('A', 'discussion', 15),
      session('B', 'discussion', 8),
      session('C', 'discussion', 5),
    ]
    const plan = buildSlotPlan(sessions, rooms, 75, 30)

    const ids = plan.map((s) => s.sessionId).sort()
    expect(ids).toEqual(['A', 'A', 'B', 'C'])
  })

  it('Scenario 5: duplicated workshop occupies same slotIndex when round = workshop duration', () => {
    // Both workshop slots are slotIndex 0 → duplicate instances are concurrent
    const rooms = [room('Hall', 'workshop', 20), room('Annex', 'workshop', 15)]
    const sessions = [session('W1', 'workshop', 28)] // 28 > 20 → duplicate
    const plan = buildSlotPlan(sessions, rooms, 75, 75)

    expect(plan).toHaveLength(2)
    const w1Slots = plan.filter((s) => s.sessionId === 'W1')
    expect(w1Slots).toHaveLength(2)
    // Both at slotIndex 0 (the only slot available)
    expect(w1Slots.every((s) => s.slotIndex === 0)).toBe(true)
  })

  it('returns empty plan when no rooms', () => {
    const plan = buildSlotPlan([session('A', 'discussion', 5)], [], 75, 30)
    expect(plan).toHaveLength(0)
  })

  it('returns unassigned slots when no sessions', () => {
    const plan = buildSlotPlan([], [room('R', 'meeting', 10)], 30, 30)
    expect(plan.every((s) => s.sessionId === null)).toBe(true)
  })

  it('does not duplicate when only one slot available', () => {
    const rooms = [room('R', 'meeting', 5)]
    const sessions = [session('A', 'discussion', 10)] // 10 > 5, but only 1 slot
    const plan = buildSlotPlan(sessions, rooms, 30, 30)
    expect(plan).toHaveLength(1)
    expect(plan[0].sessionId).toBe('A') // assigned once, no duplicate
  })
})

// ─── assignParticipants ───────────────────────────────────────────────────────

describe('assignParticipants', () => {
  it('assigns voters to the correct session slots', () => {
    const slots = [
      { roomId: 'R1', slotIndex: 0, sessionId: 'A', capacity: 5 },
      { roomId: 'R2', slotIndex: 0, sessionId: 'B', capacity: 5 },
    ]
    const voters: VoterRecord[] = [
      vote('u1', 'A'),
      vote('u2', 'B'),
      vote('u3', 'A'),
    ]
    const sessions = [session('A', 'discussion', 2), session('B', 'discussion', 1)]
    const result = assignParticipants(slots, voters, sessions)

    const aAssigned = result.filter((r) => r.sessionId === 'A').map((r) => r.userId)
    const bAssigned = result.filter((r) => r.sessionId === 'B').map((r) => r.userId)
    expect(aAssigned.sort()).toEqual(['u1', 'u3'])
    expect(bAssigned).toEqual(['u2'])
  })

  it('Scenario 6: conflict resolution — popular session takes priority at same slotIndex', () => {
    // A (15 stars, slot 0 in R1) and B (5 stars, slot 0 in R2) are concurrent
    // u01 voted for both A and B → should be assigned to A (higher priority)
    const slots = [
      { roomId: 'R1', slotIndex: 0, sessionId: 'A', capacity: 8 },
      { roomId: 'R2', slotIndex: 0, sessionId: 'B', capacity: 8 },
    ]
    const voters: VoterRecord[] = [
      vote('u01', 'A'),
      vote('u01', 'B'), // u01 voted for both
      vote('u02', 'B'),
    ]
    const sessions = [session('A', 'discussion', 15), session('B', 'discussion', 5)]
    const result = assignParticipants(slots, voters, sessions)

    const u01Assignments = result.filter((r) => r.userId === 'u01')
    // u01 should be assigned to A (processed first as most popular)
    expect(u01Assignments.map((a) => a.sessionId)).toEqual(['A'])
    // u01 should NOT also be assigned to B (same slotIndex conflict)
    const u01InB = result.find((r) => r.userId === 'u01' && r.sessionId === 'B')
    expect(u01InB).toBeUndefined()
  })

  it('Scenario 3: splits votes across duplicate session instances', () => {
    // A duplicated in R1/slot0 and R2/slot1
    const slots = [
      { roomId: 'R1', slotIndex: 0, sessionId: 'A', capacity: 8 },
      { roomId: 'R2', slotIndex: 0, sessionId: 'B', capacity: 8 },
      { roomId: 'R1', slotIndex: 1, sessionId: 'C', capacity: 8 },
      { roomId: 'R2', slotIndex: 1, sessionId: 'A', capacity: 8 },
    ]
    // 15 voters for A, 5 for B, 5 for C
    const voters: VoterRecord[] = [
      ...Array.from({ length: 15 }, (_, i) => vote(`u${String(i + 1).padStart(2, '0')}`, 'A')),
      ...['u01', 'u02', 'u16', 'u17', 'u18'].map((u) => vote(u, 'B')),
      ...['u03', 'u04', 'u19', 'u20', 'u21'].map((u) => vote(u, 'C')),
    ]
    const sessions = [
      session('A', 'discussion', 15),
      session('B', 'discussion', 5),
      session('C', 'discussion', 5),
    ]
    const result = assignParticipants(slots, voters, sessions)

    // All 15 A-voters should be assigned (8 to instance 1, 7 to instance 2)
    const aAssigned = result.filter((r) => r.sessionId === 'A')
    expect(aAssigned).toHaveLength(15)

    // No user is assigned to A twice
    const aUserIds = aAssigned.map((r) => r.userId)
    expect(new Set(aUserIds).size).toBe(15)
  })

  it('respects room capacity', () => {
    const slots = [{ roomId: 'R', slotIndex: 0, sessionId: 'A', capacity: 2 }]
    const voters: VoterRecord[] = ['u1', 'u2', 'u3', 'u4'].map((u) => vote(u, 'A'))
    const sessions = [session('A', 'discussion', 4)]
    const result = assignParticipants(slots, voters, sessions)

    // Only 2 seats
    expect(result).toHaveLength(2)
  })

  it('processes workshops before discussions', () => {
    const slots = [
      { roomId: 'Wshop', slotIndex: 0, sessionId: 'W', capacity: 10 },
      { roomId: 'Room', slotIndex: 0, sessionId: 'D', capacity: 10 },
    ]
    // u1 voted for both W and D (same slotIndex → conflict)
    const voters: VoterRecord[] = [vote('u1', 'W'), vote('u1', 'D')]
    const sessions = [session('W', 'workshop', 1), session('D', 'discussion', 1)]
    const result = assignParticipants(slots, voters, sessions)

    const u1Assignments = result.filter((r) => r.userId === 'u1')
    // u1 should get workshop (processed first) not discussion
    expect(u1Assignments).toHaveLength(1)
    expect(u1Assignments[0].sessionId).toBe('W')
  })

  it('returns no assignments when no voters', () => {
    const slots = [{ roomId: 'R', slotIndex: 0, sessionId: 'A', capacity: 10 }]
    const result = assignParticipants(slots, [], [session('A', 'discussion', 0)])
    expect(result).toHaveLength(0)
  })

  it('Scenario 7: participant who voted for no selected session gets no auto-assignment', () => {
    const slots = [{ roomId: 'R', slotIndex: 0, sessionId: 'A', capacity: 10 }]
    const voters: VoterRecord[] = [vote('u1', 'A'), vote('u99', 'B')] // u99 voted for unscheduled B
    const sessions = [session('A', 'discussion', 1)]
    const result = assignParticipants(slots, voters, sessions)

    const u99 = result.find((r) => r.userId === 'u99')
    expect(u99).toBeUndefined()
  })
})
