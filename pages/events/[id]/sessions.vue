<script setup lang="ts">
definePageMeta({ middleware: 'auth' })

const route = useRoute()
const eventId = route.params.id as string

type SessionStatus = 'proposed' | 'published' | 'scheduled' | 'delivered'

interface SessionItem {
  id: string
  eventId: string
  authorId: string
  authorFirstName: string | null
  authorLastName: string | null
  authorEmail: string | null
  title: string
  description: string | null
  tags: string[]
  status: SessionStatus
  starCount: number
  isStarred: boolean
  createdAt: string
  updatedAt: string
}

interface EventInfo {
  id: string
  name: string
  minStars: number
  maxStars: number
}

const statusColors: Record<SessionStatus, string> = {
  proposed: 'grey',
  published: 'blue',
  scheduled: 'green',
  delivered: 'purple',
}

const { data: eventInfo } = useAsyncData(`event-info-${eventId}`, () =>
  $fetch<EventInfo>(`/api/events/${eventId}`),
)

useHead({ title: () => `Sessions — ${eventInfo.value?.name ?? 'Loading...'}` })

// ── Fetch sessions ──────────────────────────────────────────────────────────
const { data: sessions, status: fetchStatus, refresh } = useAsyncData(
  `participant-sessions-${eventId}`,
  () => $fetch<SessionItem[]>(`/api/events/${eventId}/sessions`),
)

// ── Starred filter ──────────────────────────────────────────────────────────
const showStarredOnly = ref(false)

const filteredSessions = computed(() => {
  if (!sessions.value) return []
  if (showStarredOnly.value) return sessions.value.filter(s => s.isStarred)
  return sessions.value
})

// ── Star budget ─────────────────────────────────────────────────────────────
const starredCount = computed(() => sessions.value?.filter(s => s.isStarred).length ?? 0)
const maxStars = computed(() => eventInfo.value?.maxStars ?? 6)
const minStars = computed(() => eventInfo.value?.minStars ?? 4)
const starsRemaining = computed(() => maxStars.value - starredCount.value)

// ── Toggle star ─────────────────────────────────────────────────────────────
const starringId = ref<string | null>(null)
const starError = ref('')

async function toggleStar(session: SessionItem) {
  if (starringId.value) return
  starringId.value = session.id
  starError.value = ''

  try {
    if (session.isStarred) {
      await $fetch(`/api/events/${eventId}/sessions/${session.id}/star`, { method: 'DELETE' })
    } else {
      await $fetch(`/api/events/${eventId}/sessions/${session.id}/star`, { method: 'POST' })
    }
    await refresh()
  } catch (err: unknown) {
    starError.value = (err as { data?: { message?: string } })?.data?.message
      ?? (err instanceof Error ? err.message : 'Failed to update star')
  } finally {
    starringId.value = null
  }
}

function authorName(session: SessionItem): string {
  const parts = [session.authorFirstName, session.authorLastName].filter(Boolean)
  return parts.length ? parts.join(' ') : (session.authorEmail ?? 'Unknown')
}
</script>

<template>
  <v-container>
    <v-btn
      variant="text"
      to="/dashboard"
      prepend-icon="mdi-arrow-left"
      class="mb-4"
    >
      Back to Dashboard
    </v-btn>

    <div class="d-flex align-center justify-space-between mb-4 flex-wrap ga-2">
      <h1 class="text-h4">
        Sessions — {{ eventInfo?.name ?? 'Loading...' }}
      </h1>

      <!-- Stars budget -->
      <div
        v-if="eventInfo"
        class="d-flex align-center ga-2"
      >
        <v-icon color="amber-darken-2">mdi-star</v-icon>
        <span class="text-body-2">
          <strong>{{ starredCount }}</strong> / {{ maxStars }} stars used
          <span v-if="minStars > 0" class="text-grey ml-1">(min {{ minStars }})</span>
        </span>
      </div>
    </div>

    <!-- Starred-only toggle -->
    <div class="d-flex align-center ga-3 mb-4">
      <v-btn
        :color="showStarredOnly ? 'amber-darken-2' : undefined"
        :variant="showStarredOnly ? 'flat' : 'outlined'"
        size="small"
        prepend-icon="mdi-star"
        @click="showStarredOnly = !showStarredOnly"
      >
        Starred only
      </v-btn>
      <v-btn
        v-if="showStarredOnly"
        size="small"
        variant="text"
        color="grey"
        @click="showStarredOnly = false"
      >
        Show all
      </v-btn>
    </div>

    <v-alert
      v-if="starError"
      type="error"
      variant="tonal"
      class="mb-4"
      closable
      @click:close="starError = ''"
    >
      {{ starError }}
    </v-alert>

    <div v-if="fetchStatus === 'pending'" class="d-flex flex-column align-center pa-8">
      <v-progress-circular indeterminate color="primary" size="48" class="mb-4" />
      <p class="text-body-1 text-grey">Loading sessions…</p>
    </div>

    <v-alert v-else-if="fetchStatus === 'error'" type="error" variant="tonal" class="mb-4">
      Failed to load sessions. Please try again.
    </v-alert>

    <template v-else>
      <v-alert
        v-if="filteredSessions.length === 0"
        type="info"
        variant="tonal"
      >
        {{ showStarredOnly ? 'You have not starred any sessions yet.' : 'No sessions available.' }}
      </v-alert>

      <v-row v-else>
        <v-col
          v-for="session in filteredSessions"
          :key="session.id"
          cols="12"
          sm="6"
          lg="4"
        >
          <v-card variant="outlined" height="100%">
            <v-card-title class="text-body-1 font-weight-bold pb-1 d-flex align-start justify-space-between">
              <span>{{ session.title }}</span>
              <v-btn
                v-if="session.status === 'published' || session.status === 'scheduled'"
                :icon="session.isStarred ? 'mdi-star' : 'mdi-star-outline'"
                :color="session.isStarred ? 'amber-darken-2' : undefined"
                :disabled="starringId === session.id || (!session.isStarred && starsRemaining <= 0)"
                :loading="starringId === session.id"
                size="small"
                variant="text"
                @click="toggleStar(session)"
              >
                <v-tooltip
                  activator="parent"
                  location="top"
                >
                  {{ session.isStarred
                    ? 'Remove star'
                    : starsRemaining <= 0
                      ? `Maximum stars reached (${maxStars})`
                      : 'Star this session' }}
                </v-tooltip>
              </v-btn>
            </v-card-title>

            <v-card-subtitle class="pb-1">
              {{ authorName(session) }}
            </v-card-subtitle>

            <v-card-text class="pb-1">
              <div class="d-flex align-center ga-2 mb-2">
                <v-chip :color="statusColors[session.status]" size="x-small">
                  {{ session.status }}
                </v-chip>
                <span class="d-flex align-center ga-1 text-caption text-grey">
                  <v-icon size="x-small" color="amber-darken-2">mdi-star</v-icon>
                  {{ session.starCount }}
                </span>
              </div>
              <p v-if="session.description" class="text-body-2 text-medium-emphasis mb-2">
                {{ session.description }}
              </p>
              <div v-if="session.tags.length" class="d-flex flex-wrap ga-1">
                <v-chip
                  v-for="tag in session.tags"
                  :key="tag"
                  size="x-small"
                  variant="outlined"
                >{{ tag }}</v-chip>
              </div>
            </v-card-text>
          </v-card>
        </v-col>
      </v-row>
    </template>
  </v-container>
</template>
