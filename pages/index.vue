<script setup lang="ts">
useHead({ title: 'Unconference', titleTemplate: '' })

const { loggedIn } = useUserSession()
const { authMode } = useRuntimeConfig().public
const route = useRoute()

const errorParam = computed(() => route.query.error as string | undefined)

const errorMessages: Record<string, string> = {
  auth: 'Authentication failed. Please try again.',
  'no-invitation': 'You need an invitation to access this app. Please contact the event organizer.',
  'invalid-invitation': 'Your invitation link was invalid or expired. Please request a new invitation.',
}

// Redirect authenticated users to dashboard only if they have events or are admin
watchEffect(async () => {
  if (loggedIn.value) {
    try {
      const [meData, adminData] = await Promise.all([
        $fetch<{ events: unknown[] }>('/api/me'),
        $fetch<{ isAdmin: boolean }>('/api/admin/check'),
      ])
      if (meData.events.length > 0 || adminData.isAdmin) {
        navigateTo('/dashboard')
      }
    } catch {
      // If API calls fail, stay on the index page
    }
  }
})
</script>

<template>
  <div class="d-flex flex-column align-center justify-center" style="min-height: 60vh;">
    <v-icon size="80" color="primary" class="mb-4">mdi-chat-processing</v-icon>
    <h1 class="text-h4 mb-2">Welcome to Unconference</h1>

    <v-alert
      v-if="errorParam && errorMessages[errorParam]"
      type="error"
      variant="tonal"
      class="mb-6"
      max-width="500"
    >
      {{ errorMessages[errorParam] }}
    </v-alert>

    <template v-if="loggedIn">
      <p class="text-body-1 text-grey mb-6">
        You are not currently associated with any event. Please contact the event organizer.
      </p>
    </template>
    <template v-else-if="authMode === 'local'">
      <p class="text-body-1 text-grey mb-6">
        Sign in to access your events.
      </p>
      <v-btn color="primary" size="large" to="/login" prepend-icon="mdi-login">
        Sign In
      </v-btn>
      <p class="text-body-2 text-grey mt-4">
        New here? Check your email for an invitation link.
      </p>
    </template>
    <template v-else>
      <p class="text-body-1 text-grey mb-6">
        Log in with your GitHub account or use an invitation link from the event organizer.
      </p>
      <v-btn color="primary" size="large" href="/auth/github" prepend-icon="mdi-github">
        Login with GitHub
      </v-btn>
    </template>
  </div>
</template>
