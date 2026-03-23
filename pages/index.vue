<script setup lang="ts">
const { loggedIn } = useUserSession()

// Redirect authenticated users to chat
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
    <p class="text-body-1 text-grey mb-6">Sign in with GitHub to start the journey</p>
    <v-btn color="primary" size="large" href="/auth/github">
      <v-icon start>mdi-github</v-icon>
      Login with GitHub
    </v-btn>
  </div>
</template>
