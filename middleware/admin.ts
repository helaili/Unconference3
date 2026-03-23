export default defineNuxtRouteMiddleware(async () => {
  const { loggedIn } = useUserSession()

  if (!loggedIn.value) {
    return navigateTo('/')
  }

  try {
    const { isAdmin } = await $fetch<{ isAdmin: boolean }>('/api/admin/check')
    if (!isAdmin) {
      return navigateTo('/dashboard')
    }
  } catch {
    return navigateTo('/dashboard')
  }
})
