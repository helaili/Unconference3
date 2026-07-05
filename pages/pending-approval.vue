<script setup lang="ts">
useHead({ title: 'Pending Approval' })
</script>

<template>
  <div class="d-flex flex-column align-center justify-center" style="min-height: 60vh;">
    <v-card max-width="520" width="100%" class="pa-6">
      <v-card-title class="text-h5 text-center mb-4">Your account is pending approval</v-card-title>
      <v-alert type="info" variant="tonal" class="mb-4">
        Your account has been created and an administrator has been notified to review it.
      </v-alert>
      <p class="text-body-1 mb-4">
        We will email you as soon as your account is approved.
      </p>
      <p class="text-body-2 text-grey-darken-1">
        Once approved, return to the sign-in page to access the platform.
      </p>
      <div class="mt-6">
        <v-btn to="/login" color="primary" block>
          Go to Sign In
        </v-btn>
      </div>
    </v-card>
  </div>
</template>
