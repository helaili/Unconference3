import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { isAdmin } from '../../server/utils/admin'

describe('isAdmin', () => {
  const originalEnv = process.env.ADMIN_GITHUB_LOGINS

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.ADMIN_GITHUB_LOGINS
    } else {
      process.env.ADMIN_GITHUB_LOGINS = originalEnv
    }
  })

  it('returns true when login is in ADMIN_GITHUB_LOGINS', () => {
    process.env.ADMIN_GITHUB_LOGINS = 'admin1'
    expect(isAdmin('admin1')).toBe(true)
  })

  it('returns false when login is not in ADMIN_GITHUB_LOGINS', () => {
    process.env.ADMIN_GITHUB_LOGINS = 'admin1'
    expect(isAdmin('someone-else')).toBe(false)
  })

  it('returns false when ADMIN_GITHUB_LOGINS is empty', () => {
    process.env.ADMIN_GITHUB_LOGINS = ''
    expect(isAdmin('admin1')).toBe(false)
  })

  it('returns false when ADMIN_GITHUB_LOGINS is not set', () => {
    delete process.env.ADMIN_GITHUB_LOGINS
    expect(isAdmin('admin1')).toBe(false)
  })

  it('handles whitespace in the env var', () => {
    process.env.ADMIN_GITHUB_LOGINS = 'admin1 , admin2'
    expect(isAdmin('admin1')).toBe(true)
    expect(isAdmin('admin2')).toBe(true)
  })

  it('handles multiple admins', () => {
    process.env.ADMIN_GITHUB_LOGINS = 'admin1,admin2,admin3'
    expect(isAdmin('admin1')).toBe(true)
    expect(isAdmin('admin2')).toBe(true)
    expect(isAdmin('admin3')).toBe(true)
    expect(isAdmin('admin4')).toBe(false)
  })
})
