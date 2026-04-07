<script setup lang="ts">
useHead({ title: 'Register' })

const { loggedIn } = useUserSession()
const { authMode } = useRuntimeConfig().public

watchEffect(() => {
  if (loggedIn.value) {
    navigateTo('/dashboard')
  }
  if (authMode !== 'local') {
    navigateTo('/')
  }
})

const firstName = ref('')
const lastName = ref('')
const email = ref('')
const password = ref('')
const confirmPassword = ref('')
const showPassword = ref(false)
const loading = ref(false)
const error = ref('')
const invitationLoaded = ref(false)
const hasInvitation = ref(false)

onMounted(async () => {
  try {
    const info = await $fetch<{ firstName: string; lastName: string; email: string }>('/api/auth/invitation-info')
    firstName.value = info.firstName
    lastName.value = info.lastName
    email.value = info.email
    hasInvitation.value = true
  } catch {
    // No valid invitation cookie — registration is not allowed
    hasInvitation.value = false
  } finally {
    invitationLoaded.value = true
  }
})

const passwordsMatch = computed(() => password.value === confirmPassword.value)
const canSubmit = computed(() =>
  hasInvitation.value
  && firstName.value.trim()
  && lastName.value.trim()
  && password.value.length >= 8
  && passwordsMatch.value,
)

const register = async () => {
  error.value = ''

  if (!passwordsMatch.value) {
    error.value = 'Passwords do not match.'
    return
  }

  loading.value = true
  try {
    await $fetch('/api/auth/register', {
      method: 'POST',
      body: {
        firstName: firstName.value.trim(),
        lastName: lastName.value.trim(),
        email: email.value.trim(),
        password: password.value,
      },
    })
    await useUserSession().fetch()
    navigateTo('/dashboard')
  } catch (e: unknown) {
    const message = e && typeof e === 'object' && 'data' in e
      ? (e as { data?: { message?: string } }).data?.message
      : undefined
    error.value = message || 'Registration failed. Please try again.'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="d-flex flex-column align-center justify-center" style="min-height: 60vh;">
    <v-card max-width="500" width="100%" class="pa-6">
      <v-card-title class="text-h5 text-center mb-4">Create Your Account</v-card-title>

      <template v-if="!invitationLoaded">
        <v-progress-circular indeterminate color="primary" class="d-block mx-auto mb-4" />
      </template>

      <template v-else-if="!hasInvitation">
        <v-alert type="warning" variant="tonal" class="mb-4">
          Registration requires a valid invitation link. Please check your email for an invitation.
        </v-alert>
      </template>

      <template v-else>
        <v-alert type="info" variant="tonal" class="mb-4">
          An account needs to be created to finalize accepting the invitation.
        </v-alert>

        <v-alert v-if="error" type="error" variant="tonal" class="mb-4" closable @click:close="error = ''">
          {{ error }}
        </v-alert>

        <v-form @submit.prevent="register">
          <v-row>
            <v-col cols="6">
              <v-text-field
                v-model="firstName"
                label="First Name"
                prepend-inner-icon="mdi-account"
                required
                autocomplete="given-name"
              />
            </v-col>
            <v-col cols="6">
              <v-text-field
                v-model="lastName"
                label="Last Name"
                prepend-inner-icon="mdi-account"
                required
                autocomplete="family-name"
              />
            </v-col>
          </v-row>

          <v-text-field
            v-model="email"
            label="Email"
            type="email"
            prepend-inner-icon="mdi-email"
            required
            readonly
            autocomplete="email"
            class="mb-2"
            hint="Email address from your invitation"
            persistent-hint
          />

          <v-text-field
            v-model="password"
            label="Password"
            :type="showPassword ? 'text' : 'password'"
            prepend-inner-icon="mdi-lock"
            :append-inner-icon="showPassword ? 'mdi-eye-off' : 'mdi-eye'"
            required
            autocomplete="new-password"
            hint="At least 8 characters"
            persistent-hint
            class="mb-2"
            @click:append-inner="showPassword = !showPassword"
          />

          <v-text-field
            v-model="confirmPassword"
            label="Confirm Password"
            :type="showPassword ? 'text' : 'password'"
            prepend-inner-icon="mdi-lock-check"
            required
            autocomplete="new-password"
            :error-messages="confirmPassword && !passwordsMatch ? ['Passwords do not match'] : []"
            class="mb-4"
          />

          <v-btn
            type="submit"
            color="primary"
            size="large"
            block
            :loading="loading"
            :disabled="!canSubmit"
          >
            Create Account
          </v-btn>
        </v-form>

        <p class="text-body-2 text-grey text-center mt-4">
          Already have an account?
          <NuxtLink to="/login">Sign in</NuxtLink>
        </p>
      </template>
    </v-card>
  </div>
</template>
