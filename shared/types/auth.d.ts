declare module '#auth-utils' {
  interface User {
    dbId?: string
    githubId: number
    login: string
    firstName: string | null
    lastName: string | null
    email: string | null
    avatarUrl: string
  }

  interface UserSession {
    loggedInAt?: Date
  }

  interface SecureSessionData {
    accessToken: string
  }
}

export {}
