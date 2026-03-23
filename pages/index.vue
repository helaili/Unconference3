<script setup lang="ts">
useHead({ title: 'Unconference', titleTemplate: '' })

const { loggedIn } = useUserSession()
const route = useRoute()

const errorParam = computed(() => route.query.error as string | undefined)

const errorMessages: Record<string, string> = {
  auth: 'Authentication failed. Please try again.',
  'no-invitation': 'You need an invitation to access this app. Please contact the event organizer.',
  'invalid-invitation': 'Your invitation link was invalid or expired. Please request a new invitation.',
}

// Redirect authenticated users to dashboard
watchEffect(() => {
  if (loggedIn.value) {
    navigateTo('/dashboard')
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

    <p class="text-body-1 text-grey mb-6">
      Access is by invitation only. Check your email for an invitation link.
    </p>
  </div>
</template>
