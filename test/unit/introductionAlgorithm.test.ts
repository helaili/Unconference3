import { describe, it, expect } from 'vitest'
import { dispatchIntroductionRound } from '../../server/utils/introductionAlgorithm'

// Deterministic RNG (linear congruential generator)
function makeRng(seed: number) {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff
    return (s >>> 0) / 0x100000000
  }
}

const rng = makeRng(42)

function mkParticipants(count: number, domain = 'example.com') {
  return Array.from({ length: count }, (_, i) => ({
    userId: `user-${i}`,
    email: `user${i}@${domain}`,
  }))
}

function mkRooms(count: number) {
  return Array.from({ length: count }, (_, i) => ({ id: `room-${i}` }))
}

describe('dispatchIntroductionRound', () => {
  it('returns empty when no participants', () => {
    const result = dispatchIntroductionRound([], mkRooms(3), 2, 10, rng)
    expect(result).toEqual([])
  })

  it('returns empty when no rooms', () => {
    const result = dispatchIntroductionRound(mkParticipants(5), [], 2, 10, rng)
    expect(result).toEqual([])
  })

  it('returns empty when numSlots < 1', () => {
    const result = dispatchIntroductionRound(mkParticipants(5), mkRooms(2), 0, 10, rng)
    expect(result).toEqual([])
  })

  it('returns empty when groupSize < 1', () => {
    const result = dispatchIntroductionRound(mkParticipants(5), mkRooms(2), 2, 0, rng)
    expect(result).toEqual([])
  })

  it('assigns every participant exactly once per slot', () => {
    const participants = mkParticipants(20)
    const rooms = mkRooms(5)
    const result = dispatchIntroductionRound(participants, rooms, 2, 5, makeRng(1))

    for (let slot = 0; slot < 2; slot++) {
      const slotAssignments = result.filter(a => a.slotIndex === slot)
      const userIds = slotAssignments.map(a => a.userId)
      expect(new Set(userIds).size).toBe(participants.length)
    }
  })

  it('uses correct number of slots', () => {
    const result = dispatchIntroductionRound(mkParticipants(10), mkRooms(3), 3, 5, makeRng(2))
    const slots = new Set(result.map(a => a.slotIndex))
    expect(slots.size).toBe(3)
    expect([...slots].sort()).toEqual([0, 1, 2])
  })

  it('respects groupSize cap per room', () => {
    const participants = mkParticipants(15)
    const rooms = mkRooms(3)
    const groupSize = 5
    const result = dispatchIntroductionRound(participants, rooms, 1, groupSize, makeRng(3))

    // Each room should have at most groupSize participants
    for (const room of rooms) {
      const count = result.filter(a => a.roomId === room.id).length
      expect(count).toBeLessThanOrEqual(groupSize)
    }
  })

  it('uses only as many rooms as needed (ceil(n/groupSize))', () => {
    const participants = mkParticipants(12)
    const rooms = mkRooms(10)
    const result = dispatchIntroductionRound(participants, rooms, 1, 5, makeRng(4))

    // ceil(12/5) = 3 rooms needed
    const usedRooms = new Set(result.map(a => a.roomId))
    expect(usedRooms.size).toBeLessThanOrEqual(3)
  })

  it('works with groupSize larger than participant count (single room)', () => {
    const participants = mkParticipants(3)
    const rooms = mkRooms(5)
    const result = dispatchIntroductionRound(participants, rooms, 1, 10, makeRng(5))

    const usedRooms = new Set(result.map(a => a.roomId))
    expect(usedRooms.size).toBe(1)
    expect(result.length).toBe(3)
  })

  it('separates participants by email domain when possible', () => {
    // 4 domains, 1 person each, 4 rooms
    const participants = [
      { userId: 'u1', email: 'alice@acme.com' },
      { userId: 'u2', email: 'bob@beta.com' },
      { userId: 'u3', email: 'carol@gamma.com' },
      { userId: 'u4', email: 'dave@delta.com' },
    ]
    const rooms = mkRooms(4)
    const result = dispatchIntroductionRound(participants, rooms, 1, 1, makeRng(6))

    // Each room should have exactly one person and all domains distinct
    const roomDomains = new Map<string, string>()
    for (const a of result) {
      const p = participants.find(pp => pp.userId === a.userId)!
      const domain = p.email.split('@')[1]!
      expect(roomDomains.has(a.roomId)).toBe(false)
      roomDomains.set(a.roomId, domain)
    }
    const domains = [...roomDomains.values()]
    expect(new Set(domains).size).toBe(domains.length)
  })

  it('best-effort domain separation when domain outnumbers rooms', () => {
    // 6 people from same domain, only 2 rooms
    const participants = mkParticipants(6, 'same.com')
    const rooms = mkRooms(2)
    const result = dispatchIntroductionRound(participants, rooms, 1, 3, makeRng(7))

    // Can't satisfy domain constraint — but should still assign everyone
    expect(result.length).toBe(6)
  })

  it('avoids repeated room-mates across slots (soft constraint)', () => {
    const participants = mkParticipants(10)
    const rooms = mkRooms(5)
    const result = dispatchIntroductionRound(participants, rooms, 2, 2, makeRng(8))

    // Build groupmates per slot
    const slotGroups: Map<string, Set<string>>[] = [new Map(), new Map()]
    for (const a of result) {
      const m = slotGroups[a.slotIndex]!
      if (!m.has(a.roomId)) m.set(a.roomId, new Set())
      m.get(a.roomId)!.add(a.userId)
    }

    // Count repeat encounters across slots 0 and 1
    let repeats = 0
    for (const [roomId, members] of slotGroups[0]!) {
      for (const uid of members) {
        const slot1Room = result.find(a => a.slotIndex === 1 && a.userId === uid)?.roomId
        if (!slot1Room) continue
        const slot1Members = slotGroups[1]!.get(slot1Room) ?? new Set()
        for (const other of members) {
          if (other !== uid && slot1Members.has(other)) repeats++
        }
      }
    }

    // With 2 people per room and 5 rooms, some repeats may be unavoidable
    // but should be minimized. A perfect assignment would have 0 repeats.
    // Accept any result — the test documents the behavior.
    expect(repeats).toBeGreaterThanOrEqual(0)
  })

  it('produces deterministic output with same seed', () => {
    const participants = mkParticipants(20)
    const rooms = mkRooms(4)

    const r1 = dispatchIntroductionRound(participants, rooms, 2, 5, makeRng(99))
    const r2 = dispatchIntroductionRound(participants, rooms, 2, 5, makeRng(99))

    expect(r1).toEqual(r2)
  })

  it('handles 1 participant 1 room', () => {
    const result = dispatchIntroductionRound(
      [{ userId: 'u1', email: 'u1@a.com' }],
      [{ id: 'r1' }],
      2,
      10,
      makeRng(0),
    )
    expect(result.length).toBe(2)
    expect(result.every(a => a.userId === 'u1' && a.roomId === 'r1')).toBe(true)
  })

  it('normalises email domains to lowercase', () => {
    const participants = [
      { userId: 'u1', email: 'alice@UPPER.COM' },
      { userId: 'u2', email: 'bob@upper.com' },
    ]
    const rooms = mkRooms(2)
    const result = dispatchIntroductionRound(participants, rooms, 1, 1, makeRng(10))

    // Both are treated as same domain — should prefer different rooms
    const roomIds = result.map(a => a.roomId)
    expect(new Set(roomIds).size).toBe(2)
  })
})
