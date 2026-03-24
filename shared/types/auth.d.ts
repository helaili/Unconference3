declare module '#auth-utils' {
  interface User {
    dbId?: string
    githubId?: number | null
    login?: string | null
    firstName: string | null
    lastName: string | null
    email: string | null
    avatarUrl?: string | null
  }

  interface UserSession {
    loggedInAt?: Date
  }

  interface SecureSessionData {
    accessToken?: string
  }
}

export {}
