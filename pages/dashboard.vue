<script setup lang="ts">
definePageMeta({ middleware: 'auth' })
useHead({ title: 'Dashboard' })

interface EventStats {
  id: string
  name: string
  description: string | null
  date: string | null
  inviteeCount: number
  sessionCount: number
}

interface Profile {
  firstName?: string
  events: Array<{ id: string; name: string; description: string | null; date: string | null }>
}

const { data: adminCheck } = useFetch<{ isAdmin: boolean }>('/api/admin/check', { lazy: false })
const { data: profile, status: profileStatus, error: profileError } = useFetch<Profile>('/api/me', { lazy: false })
const { data: events, status: eventsStatus } = useFetch<EventStats[]>('/api/events', {
  lazy: false,
  immediate: computed(() => adminCheck.value?.isAdmin === true),
})

// Redirect non-admin participants who belong to exactly one event directly to that event
watch(
  [profile, adminCheck],
  ([p, a]) => {
    if (p && a !== undefined && !a.isAdmin && p.events?.length === 1) {
      navigateTo(`/events/${p.events[0].id}`)
    }
  },
  { immediate: true },
)
</script>

<template>
  <div>
    <!-- ── Loading ─────────────────────────────────────────────────────────── -->
    <div
      v-if="profileStatus === 'pending'"
      class="d-flex flex-column align-center justify-center"
      style="min-height: 60vh;"
    >
      <v-progress-circular indeterminate color="primary" size="48" class="mb-4" />
      <p class="text-body-1 text-grey">Loading your dashboard…</p>
    </div>

    <!-- ── Error ──────────────────────────────────────────────────────────── -->
    <v-alert
      v-else-if="profileStatus === 'error'"
      type="error"
      variant="tonal"
      class="mb-6"
      max-width="600"
    >
      {{ profileError?.message || 'Failed to load your profile. Please try again later.' }}
    </v-alert>

    <template v-else-if="profile">
      <h1 class="text-h4 mb-6">
        Welcome{{ profile.firstName ? `, ${profile.firstName}` : '' }}!
      </h1>

      <!-- ── Admin view: event stats ──────────────────────────────────────── -->
      <template v-if="adminCheck?.isAdmin">
        <div class="d-flex align-center justify-space-between mb-4">
          <h2 class="text-h5">All Events</h2>
        </div>

        <v-progress-linear v-if="eventsStatus === 'pending'" indeterminate color="primary" class="mb-4" />

        <v-row v-else-if="events && events.length > 0">
          <v-col
            v-for="ev in events"
            :key="ev.id"
            cols="12"
            sm="6"
            lg="4"
          >
            <v-card variant="outlined" height="100%">
              <v-card-title class="text-body-1 font-weight-bold pb-1">
                {{ ev.name }}
              </v-card-title>
              <v-card-subtitle class="pb-1">
                {{ ev.date
                  ? new Date(ev.date).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
                  : 'No date set' }}
              </v-card-subtitle>
              <v-card-text class="pb-1">
                <p v-if="ev.description" class="text-body-2 mb-3 text-medium-emphasis">
                  {{ ev.description }}
                </p>
                <div class="d-flex ga-4">
                  <div class="d-flex align-center ga-1">
                    <v-icon size="small" color="secondary">mdi-account-multiple</v-icon>
                    <span class="text-body-2">{{ ev.inviteeCount }} participant{{ ev.inviteeCount !== 1 ? 's' : '' }}</span>
                  </div>
                  <div class="d-flex align-center ga-1">
                    <v-icon size="small" color="teal">mdi-presentation</v-icon>
                    <span class="text-body-2">{{ ev.sessionCount }} session{{ ev.sessionCount !== 1 ? 's' : '' }}</span>
                  </div>
                </div>
              </v-card-text>
              <v-card-actions class="pt-0">
                <v-btn
                  size="small"
                  variant="text"
                  color="secondary"
                  :to="`/admin/events/${ev.id}/invitees`"
                  prepend-icon="mdi-account-multiple"
                >
                  Invitees
                </v-btn>
                <v-btn
                  size="small"
                  variant="text"
                  color="teal"
                  :to="`/admin/events/${ev.id}/sessions`"
                  prepend-icon="mdi-presentation"
                >
                  Sessions
                </v-btn>
                <v-btn
                  size="small"
                  variant="text"
                  color="deep-purple"
                  :to="`/admin/events/${ev.id}/rooms`"
                  prepend-icon="mdi-door"
                >
                  Rooms
                </v-btn>
                <v-btn
                  size="small"
                  variant="text"
                  color="orange-darken-2"
                  :to="`/admin/events/${ev.id}/rounds`"
                  prepend-icon="mdi-timer-play-outline"
                >
                  Rounds
                </v-btn>
                <v-btn
                  size="small"
                  variant="text"
                  color="deep-purple"
                  :to="`/admin/events/${ev.id}/introduction`"
                  prepend-icon="mdi-account-group-outline"
                >
                  Introduction
                </v-btn>
                <v-btn
                  size="small"
                  variant="text"
                  color="primary"
                  to="/admin/events"
                  prepend-icon="mdi-pencil"
                >
                  Edit
                </v-btn>
              </v-card-actions>
            </v-card>
          </v-col>
        </v-row>

        <v-alert v-else type="info" variant="tonal" max-width="600">
          No events yet. <v-btn variant="text" to="/admin/events">Create one</v-btn>
        </v-alert>
      </template>

      <!-- ── Participant view: own events ────────────────────────────────── -->
      <template v-else>
        <h2 class="text-h5 mb-4">Your Events</h2>

        <div
          v-if="profile.events && profile.events.length > 0"
          class="d-flex flex-column ga-4"
          style="width: 100%; max-width: 600px;"
        >
          <v-card
            v-for="event in profile.events"
            :key="event.id"
            variant="outlined"
          >
            <v-card-title>{{ event.name }}</v-card-title>
            <v-card-subtitle>
              {{ event.date
                ? new Date(event.date).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
                : 'No date set' }}
            </v-card-subtitle>
            <v-card-text v-if="event.description">{{ event.description }}</v-card-text>
            <v-card-actions>
              <v-btn
                size="small"
                variant="text"
                color="primary"
                :to="`/events/${event.id}`"
                prepend-icon="mdi-presentation"
              >
                View Sessions
              </v-btn>
            </v-card-actions>
          </v-card>
        </div>

        <v-alert v-else type="info" variant="tonal" max-width="600">
          You're not part of any events yet.
        </v-alert>
      </template>
    </template>
  </div>
</template>

