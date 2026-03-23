import { describe, expect, it } from 'vitest'

describe('invitation expiry logic', () => {
  function isInvitationValid(invitation: { usedAt: Date | null, expiresAt: Date } | null): boolean {
    if (!invitation) return false
    if (invitation.usedAt) return false
    if (invitation.expiresAt <= new Date()) return false
    return true
  }

  it('returns false for null invitation', () => {
    expect(isInvitationValid(null)).toBe(false)
  })

  it('returns false for used invitation', () => {
    expect(isInvitationValid({
      usedAt: new Date('2024-01-01'),
      expiresAt: new Date(Date.now() + 86400000),
    })).toBe(false)
  })

  it('returns false for expired invitation', () => {
    expect(isInvitationValid({
      usedAt: null,
      expiresAt: new Date('2020-01-01'),
    })).toBe(false)
  })

  it('returns true for valid invitation', () => {
    expect(isInvitationValid({
      usedAt: null,
      expiresAt: new Date(Date.now() + 86400000),
    })).toBe(true)
  })

  it('returns false for invitation expiring exactly now', () => {
    const now = new Date()
    expect(isInvitationValid({
      usedAt: null,
      expiresAt: now,
    })).toBe(false)
  })
})
