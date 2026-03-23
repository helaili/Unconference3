export default defineOAuthGitHubEventHandler({
  config: {
    emailRequired: true
  },
  async onSuccess(event, { user, tokens }) {
    await setUserSession(event, {
      user: {
        githubId: user.id,
        login: user.login,
        name: user.name,
        email: user.email,
        avatarUrl: user.avatar_url
      },
      secure: {
        accessToken: tokens.access_token
      }
    })
    return sendRedirect(event, '/chat')
  },
  onError(event, error) {
    console.error('GitHub OAuth error:', error)
    return sendRedirect(event, '/?error=auth')
  },
})
