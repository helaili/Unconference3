export default defineNuxtRouteMiddleware(async () => {
  const { loggedIn } = useUserSession()

  if (!loggedIn.value) {
    return navigateTo('/')
  }

  try {
    const [adminCheck, staffCheck] = await Promise.all([
      $fetch<{ isAdmin: boolean }>('/api/admin/check'),
      $fetch<{ isStaff: boolean }>('/api/staff/check'),
    ])
    if (!adminCheck.isAdmin && !staffCheck.isStaff) {
      return navigateTo('/dashboard')
    }
  } catch {
    return navigateTo('/dashboard')
  }
})
