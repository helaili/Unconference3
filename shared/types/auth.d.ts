declare module '#auth-utils' {
  interface User {
    githubId: number
    login: string
    name: string | null
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
