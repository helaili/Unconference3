<script setup lang="ts">
definePageMeta({ middleware: 'auth' })
useHead({ title: 'Dashboard' })

const { user } = useUserSession()

const { data: profile, status, error } = useFetch('/api/me', { lazy: false })
</script>

<template>
  <div class="d-flex flex-column align-center justify-center" style="min-height: 60vh;">
    <!-- Loading -->
    <div v-if="status === 'pending'" class="d-flex flex-column align-center">
      <v-progress-circular indeterminate color="primary" size="48" class="mb-4" />
      <p class="text-body-1 text-grey">Loading your dashboard…</p>
    </div>

    <!-- Error -->
    <v-alert v-else-if="status === 'error'" type="error" variant="tonal" class="mb-6" max-width="600">
      {{ error?.message || 'Failed to load your profile. Please try again later.' }}
    </v-alert>

    <!-- Dashboard content -->
    <template v-else-if="profile">
      <h1 class="text-h4 mb-6">
        Welcome{{ profile.firstName ? `, ${profile.firstName}` : '' }}!
      </h1>

      <h2 class="text-h5 mb-4">Your Events</h2>

      <div v-if="profile.events && profile.events.length > 0" class="d-flex flex-column ga-4" style="width: 100%; max-width: 600px;">
        <v-card v-for="event in profile.events" :key="event.id" variant="outlined">
          <v-card-title>{{ event.name }}</v-card-title>
          <v-card-subtitle>
            {{ event.date ? new Date(event.date).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) : 'No date set' }}
          </v-card-subtitle>
          <v-card-text v-if="event.description">{{ event.description }}</v-card-text>
        </v-card>
      </div>

      <v-alert v-else type="info" variant="tonal" max-width="600">
        You're not part of any events yet.
      </v-alert>
    </template>
  </div>
</template>
