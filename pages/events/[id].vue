<script setup lang="ts">
definePageMeta({ middleware: 'auth' })

interface EventDetail {
  id: string
  name: string
  description: string | null
  date: string | null
  submissionRestricted: boolean
}

interface SessionRow {
  id: string
  eventId: string
  authorId: string
  authorFirstName: string | null
  authorLastName: string | null
  authorEmail: string | null
  title: string
  description: string | null
  tags: string[]
  status: 'proposed' | 'published' | 'scheduled' | 'delivered'
  createdAt: string
  updatedAt: string
}

const route = useRoute()
const eventId = route.params.id as string

const { user } = useUserSession()
const includeDelivered = ref(false)

const { data: eventDetail, status: eventStatus, error: eventError } = useFetch<EventDetail>(
  `/api/events/${eventId}`,
  { lazy: false },
)
const {
  data: sessions,
  status: sessionsStatus,
  refresh: refreshSessions,
} = useFetch<SessionRow[]>(`/api/events/${eventId}/sessions`, {
  lazy: false,
  query: computed(() => includeDelivered.value ? { includeDelivered: 'true' } : {}),
})

useHead(computed(() => ({ title: eventDetail.value?.name ?? 'Event' })))

// ── Propose session dialog ────────────────────────────────────────────────────
const proposeOpen = ref(false)
const proposeForm = reactive({ title: '', description: '', tags: '' })
const proposeLoading = ref(false)
const proposeError = ref('')

function openPropose() {
  proposeForm.title = ''
  proposeForm.description = ''
  proposeForm.tags = ''
  proposeError.value = ''
  proposeOpen.value = true
}

async function submitPropose() {
  if (!proposeForm.title.trim()) return
  proposeLoading.value = true
  proposeError.value = ''
  try {
    await $fetch(`/api/events/${eventId}/sessions`, {
      method: 'POST',
      body: {
        title: proposeForm.title.trim(),
        description: proposeForm.description.trim() || undefined,
        tags: proposeForm.tags
          .split(',')
          .map(t => t.trim())
          .filter(Boolean),
      },
    })
    proposeOpen.value = false
    await refreshSessions()
  } catch (e: unknown) {
    const msg = e && typeof e === 'object' && 'data' in e
      ? (e as { data?: { message?: string } }).data?.message
      : undefined
    proposeError.value = msg || 'Failed to propose session. Please try again.'
  } finally {
    proposeLoading.value = false
  }
}

// ── Edit session dialog ───────────────────────────────────────────────────────
const editOpen = ref(false)
const editTarget = ref<SessionRow | null>(null)
const editForm = reactive({ title: '', description: '', tags: '' })
const editLoading = ref(false)
const editError = ref('')

function openEdit(session: SessionRow) {
  editTarget.value = session
  editForm.title = session.title
  editForm.description = session.description ?? ''
  editForm.tags = session.tags.join(', ')
  editError.value = ''
  editOpen.value = true
}

async function submitEdit() {
  if (!editTarget.value || !editForm.title.trim()) return
  editLoading.value = true
  editError.value = ''
  try {
    await $fetch(`/api/events/${eventId}/sessions/${editTarget.value.id}`, {
      method: 'PUT',
      body: {
        title: editForm.title.trim(),
        description: editForm.description.trim() || undefined,
        tags: editForm.tags
          .split(',')
          .map(t => t.trim())
          .filter(Boolean),
      },
    })
    editOpen.value = false
    await refreshSessions()
  } catch (e: unknown) {
    const msg = e && typeof e === 'object' && 'data' in e
      ? (e as { data?: { message?: string } }).data?.message
      : undefined
    editError.value = msg || 'Failed to update session. Please try again.'
  } finally {
    editLoading.value = false
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function isMySession(session: SessionRow) {
  return !!user.value?.dbId && session.authorId === user.value.dbId
}

function authorName(session: SessionRow) {
  const parts = [session.authorFirstName, session.authorLastName].filter(Boolean)
  return parts.length > 0 ? parts.join(' ') : (session.authorEmail ?? 'Unknown')
}

function statusColor(status: SessionRow['status']) {
  switch (status) {
    case 'published': return 'green'
    case 'scheduled': return 'blue'
    case 'delivered': return 'grey'
    case 'proposed': return 'orange'
    default: return 'default'
  }
}
</script>

<template>
  <div>
    <!-- Loading event -->
    <div
      v-if="eventStatus === 'pending'"
      class="d-flex flex-column align-center justify-center"
      style="min-height: 60vh;"
    >
      <v-progress-circular indeterminate color="primary" size="48" class="mb-4" />
      <p class="text-body-1 text-grey">Loading event…</p>
    </div>

    <!-- Error loading event -->
    <v-alert
      v-else-if="eventStatus === 'error'"
      type="error"
      variant="tonal"
      class="mb-6"
      max-width="600"
    >
      {{ eventError?.message || 'Failed to load event. Please try again later.' }}
    </v-alert>

    <template v-else-if="eventDetail">
      <!-- Event header -->
      <div class="d-flex align-start justify-space-between flex-wrap ga-4 mb-6">
        <div>
          <h1 class="text-h4 mb-1">{{ eventDetail.name }}</h1>
          <p v-if="eventDetail.date" class="text-body-2 text-medium-emphasis mb-1">
            <v-icon size="small" class="mr-1">mdi-calendar</v-icon>
            {{ new Date(eventDetail.date).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) }}
          </p>
          <p v-if="eventDetail.description" class="text-body-2 text-medium-emphasis">
            {{ eventDetail.description }}
          </p>
        </div>
        <v-btn
          v-if="!eventDetail.submissionRestricted"
          color="primary"
          prepend-icon="mdi-plus"
          @click="openPropose"
        >
          Propose a Session
        </v-btn>
        <v-chip
          v-else
          variant="tonal"
          color="grey"
          prepend-icon="mdi-lock"
        >
          Session proposals are closed
        </v-chip>
      </div>

      <!-- Filter bar -->
      <div class="d-flex align-center mb-5">
        <v-switch
          v-model="includeDelivered"
          label="Show delivered sessions"
          hide-details
          density="compact"
          color="primary"
        />
      </div>

      <!-- Sessions loading -->
      <v-progress-linear v-if="sessionsStatus === 'pending'" indeterminate color="primary" class="mb-4" />

      <!-- Sessions grid -->
      <template v-else-if="sessions && sessions.length > 0">
        <v-row>
          <v-col
            v-for="session in sessions"
            :key="session.id"
            cols="12"
            sm="6"
            lg="4"
          >
            <v-card
              variant="outlined"
              height="100%"
              :class="{ 'border-primary': isMySession(session) }"
            >
              <v-card-title class="text-body-1 font-weight-bold pt-4 pb-1 text-wrap">
                {{ session.title }}
              </v-card-title>

              <v-card-subtitle class="pb-2">
                <v-chip
                  :color="statusColor(session.status)"
                  size="x-small"
                  variant="tonal"
                  class="mr-1"
                >
                  {{ session.status }}
                </v-chip>
                <span v-if="isMySession(session)" class="text-caption text-primary font-weight-medium">My proposal</span>
              </v-card-subtitle>

              <v-card-text class="pb-2">
                <p
                  v-if="session.description"
                  class="text-body-2 text-medium-emphasis mb-3"
                  style="display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;"
                >
                  {{ session.description }}
                </p>

                <div v-if="session.tags.length > 0" class="d-flex flex-wrap ga-1 mb-2">
                  <v-chip
                    v-for="tag in session.tags"
                    :key="tag"
                    size="x-small"
                    variant="outlined"
                  >
                    {{ tag }}
                  </v-chip>
                </div>

                <p class="text-caption text-medium-emphasis">
                  <v-icon size="x-small" class="mr-1">mdi-account</v-icon>
                  {{ authorName(session) }}
                </p>
              </v-card-text>

              <v-card-actions v-if="isMySession(session) && session.status === 'proposed'" class="pt-0">
                <v-btn
                  size="small"
                  variant="text"
                  color="primary"
                  prepend-icon="mdi-pencil"
                  @click="openEdit(session)"
                >
                  Edit
                </v-btn>
              </v-card-actions>
            </v-card>
          </v-col>
        </v-row>
      </template>

      <v-alert v-else type="info" variant="tonal" max-width="600">
        No sessions yet.
        <template v-if="!includeDelivered">
          <v-btn variant="text" size="small" @click="includeDelivered = true">Show delivered sessions</v-btn>
        </template>
      </v-alert>
    </template>

    <!-- ── Propose session dialog ─────────────────────────────────────────── -->
    <v-dialog v-model="proposeOpen" max-width="540" persistent>
      <v-card>
        <v-card-title class="text-h6 pt-5 px-6">Propose a Session</v-card-title>

        <v-card-text class="px-6 pb-2">
          <v-alert v-if="proposeError" type="error" variant="tonal" class="mb-4" closable @click:close="proposeError = ''">
            {{ proposeError }}
          </v-alert>

          <v-text-field
            v-model="proposeForm.title"
            label="Title *"
            required
            :disabled="proposeLoading"
            class="mb-2"
          />
          <v-textarea
            v-model="proposeForm.description"
            label="Description"
            rows="3"
            :disabled="proposeLoading"
            class="mb-2"
          />
          <v-text-field
            v-model="proposeForm.tags"
            label="Tags (comma-separated)"
            :disabled="proposeLoading"
            hint="e.g. ai, tools, collaboration"
            persistent-hint
          />
        </v-card-text>

        <v-card-actions class="px-6 pb-5">
          <v-spacer />
          <v-btn variant="text" :disabled="proposeLoading" @click="proposeOpen = false">Cancel</v-btn>
          <v-btn
            color="primary"
            variant="flat"
            :loading="proposeLoading"
            :disabled="!proposeForm.title.trim()"
            @click="submitPropose"
          >
            Submit Proposal
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- ── Edit session dialog ────────────────────────────────────────────── -->
    <v-dialog v-model="editOpen" max-width="540" persistent>
      <v-card>
        <v-card-title class="text-h6 pt-5 px-6">Edit Session</v-card-title>

        <v-card-text class="px-6 pb-2">
          <v-alert v-if="editError" type="error" variant="tonal" class="mb-4" closable @click:close="editError = ''">
            {{ editError }}
          </v-alert>

          <v-text-field
            v-model="editForm.title"
            label="Title *"
            required
            :disabled="editLoading"
            class="mb-2"
          />
          <v-textarea
            v-model="editForm.description"
            label="Description"
            rows="3"
            :disabled="editLoading"
            class="mb-2"
          />
          <v-text-field
            v-model="editForm.tags"
            label="Tags (comma-separated)"
            :disabled="editLoading"
            hint="e.g. ai, tools, collaboration"
            persistent-hint
          />
        </v-card-text>

        <v-card-actions class="px-6 pb-5">
          <v-spacer />
          <v-btn variant="text" :disabled="editLoading" @click="editOpen = false">Cancel</v-btn>
          <v-btn
            color="primary"
            variant="flat"
            :loading="editLoading"
            :disabled="!editForm.title.trim()"
            @click="submitEdit"
          >
            Save Changes
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>
