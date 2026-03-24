<script setup lang="ts">
useHead({ title: 'Sign In' })

const { loggedIn } = useUserSession()
const { authMode } = useRuntimeConfig().public

// Redirect if already logged in or not in local mode
watchEffect(() => {
  if (loggedIn.value) {
    navigateTo('/dashboard')
  }
  if (authMode !== 'local') {
    navigateTo('/')
  }
})

const email = ref('')
const password = ref('')
const showPassword = ref(false)
const loading = ref(false)
const error = ref('')

const login = async () => {
  error.value = ''
  loading.value = true
  try {
    await $fetch('/api/auth/login', {
      method: 'POST',
      body: { email: email.value, password: password.value },
    })
    // Refresh session and redirect
    await useUserSession().fetch()
    navigateTo('/dashboard')
  } catch (e: unknown) {
    const message = e && typeof e === 'object' && 'data' in e
      ? (e as { data?: { message?: string } }).data?.message
      : undefined
    error.value = message || 'Login failed. Please try again.'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="d-flex flex-column align-center justify-center" style="min-height: 60vh;">
    <v-card max-width="440" width="100%" class="pa-6">
      <v-card-title class="text-h5 text-center mb-4">Sign In</v-card-title>

      <v-alert v-if="error" type="error" variant="tonal" class="mb-4" closable @click:close="error = ''">
        {{ error }}
      </v-alert>

      <v-form @submit.prevent="login">
        <v-text-field
          v-model="email"
          label="Email"
          type="email"
          prepend-inner-icon="mdi-email"
          required
          autocomplete="email"
          class="mb-2"
        />
        <v-text-field
          v-model="password"
          label="Password"
          :type="showPassword ? 'text' : 'password'"
          prepend-inner-icon="mdi-lock"
          :append-inner-icon="showPassword ? 'mdi-eye-off' : 'mdi-eye'"
          required
          autocomplete="current-password"
          class="mb-4"
          @click:append-inner="showPassword = !showPassword"
        />
        <v-btn
          type="submit"
          color="primary"
          size="large"
          block
          :loading="loading"
          :disabled="!email || !password"
        >
          Sign In
        </v-btn>
      </v-form>

      <p class="text-body-2 text-grey text-center mt-4">
        New here? Check your email for an invitation link.
      </p>
    </v-card>
  </div>
</template>
