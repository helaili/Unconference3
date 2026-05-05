<script setup lang="ts">
definePageMeta({ middleware: 'auth' })

const route = useRoute()
const eventId = route.params.id as string

type SessionStatus = 'proposed' | 'published' | 'scheduled' | 'delivered'
type SessionType = 'discussion' | 'workshop'

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
  type: SessionType
  duration: number | null
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
  defaultDiscussionDuration: number
  defaultWorkshopDuration: number
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
const typeFilter = ref<'discussion' | 'workshop' | null>(null)

const filteredSessions = computed(() => {
  let result = sessions.value ?? []
  if (showStarredOnly.value) result = result.filter(s => s.isStarred)
  if (typeFilter.value) result = result.filter(s => s.type === typeFilter.value)
  return result
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

function effectiveDuration(session: SessionItem): string {
  if (session.duration !== null) return `${session.duration} min`
  if (!eventInfo.value) return '—'
  const def = session.type === 'workshop'
    ? eventInfo.value.defaultWorkshopDuration
    : eventInfo.value.defaultDiscussionDuration
  return `${def} min`
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

    <!-- Filters -->
    <div class="d-flex flex-wrap align-center ga-2 mb-4">
      <v-btn
        :color="showStarredOnly ? 'amber-darken-2' : undefined"
        :variant="showStarredOnly ? 'flat' : 'outlined'"
        size="small"
        prepend-icon="mdi-star"
        @click="showStarredOnly = !showStarredOnly"
      >
        Starred only
      </v-btn>

      <v-divider vertical class="mx-1" style="height:24px" />

      <v-chip
        :variant="typeFilter === null ? 'flat' : 'outlined'"
        :color="typeFilter === null ? 'primary' : undefined"
        size="small"
        clickable
        @click="typeFilter = null"
      >
        All types
      </v-chip>
      <v-chip
        :variant="typeFilter === 'discussion' ? 'flat' : 'outlined'"
        :color="typeFilter === 'discussion' ? 'teal' : undefined"
        size="small"
        clickable
        @click="typeFilter = typeFilter === 'discussion' ? null : 'discussion'"
      >
        <v-icon start size="x-small">mdi-forum-outline</v-icon>
        Discussion
      </v-chip>
      <v-chip
        :variant="typeFilter === 'workshop' ? 'flat' : 'outlined'"
        :color="typeFilter === 'workshop' ? 'orange' : undefined"
        size="small"
        clickable
        @click="typeFilter = typeFilter === 'workshop' ? null : 'workshop'"
      >
        <v-icon start size="x-small">mdi-tools</v-icon>
        Workshop
      </v-chip>
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
        <span v-if="showStarredOnly && typeFilter">No starred {{ typeFilter }} sessions.</span>
        <span v-else-if="showStarredOnly">You have not starred any sessions yet.</span>
        <span v-else-if="typeFilter">No {{ typeFilter }} sessions available.</span>
        <span v-else>No sessions available.</span>
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
            <v-card-title class="text-body-1 font-weight-bold pb-1">
              {{ session.title }}
            </v-card-title>

            <v-card-subtitle class="pb-1">
              {{ authorName(session) }}
            </v-card-subtitle>

            <v-card-text class="pb-1">
              <div class="d-flex align-center ga-2 mb-2">
                <v-chip :color="statusColors[session.status]" size="x-small">
                  {{ session.status }}
                </v-chip>
                <v-chip
                  :color="session.type === 'workshop' ? 'orange' : 'blue'"
                  size="x-small"
                  variant="tonal"
                >
                  {{ session.type }}
                </v-chip>
                <span class="d-flex align-center ga-1 text-caption text-grey">
                  <v-icon size="x-small">mdi-clock-outline</v-icon>
                  {{ effectiveDuration(session) }}
                </span>
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

            <v-card-actions v-if="session.status === 'published' || session.status === 'scheduled'">
              <v-btn
                :color="session.isStarred ? 'amber-darken-2' : 'default'"
                :variant="session.isStarred ? 'tonal' : 'outlined'"
                :prepend-icon="session.isStarred ? 'mdi-star' : 'mdi-star-outline'"
                :disabled="starringId === session.id || (!session.isStarred && starsRemaining <= 0)"
                :loading="starringId === session.id"
                size="small"
                @click="toggleStar(session)"
              >
                {{ session.isStarred ? 'Remove star' : starsRemaining <= 0 ? `Max stars reached (${maxStars})` : 'Star this session' }}
              </v-btn>
            </v-card-actions>
          </v-card>
        </v-col>
      </v-row>
    </template>
  </v-container>
</template>
