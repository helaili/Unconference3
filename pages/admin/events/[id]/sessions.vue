<script setup lang="ts">
definePageMeta({ middleware: 'admin' })

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
  createdAt: string
  updatedAt: string
}

interface EventInfo {
  id: string
  name: string
  defaultDiscussionDuration: number
  defaultWorkshopDuration: number
}

const statusOptions: { title: string; value: SessionStatus }[] = [
  { title: 'Proposed', value: 'proposed' },
  { title: 'Published', value: 'published' },
  { title: 'Scheduled', value: 'scheduled' },
  { title: 'Delivered', value: 'delivered' },
]

const statusColors: Record<SessionStatus, string> = {
  proposed: 'grey',
  published: 'blue',
  scheduled: 'green',
  delivered: 'purple',
}

const { data: eventInfo } = useAsyncData(`event-${eventId}`, () =>
  $fetch<EventInfo>(`/api/events/${eventId}`),
)

useHead({ title: () => `Sessions — ${eventInfo.value?.name ?? 'Loading...'}` })

// ── Fetch all sessions (admin sees all statuses) ──────────────────────────────
const { data: allSessions, status: fetchStatus, refresh } = useAsyncData(
  `sessions-${eventId}`,
  () => $fetch<SessionItem[]>(`/api/events/${eventId}/sessions`, {
    query: { status: 'proposed,published,scheduled,delivered' },
  }),
)

// ── Status filter ─────────────────────────────────────────────────────────────
const statusFilter = ref<SessionStatus[]>([])

const filteredSessions = computed(() => {
  if (!allSessions.value) return []
  if (statusFilter.value.length === 0) return allSessions.value
  return allSessions.value.filter(s => statusFilter.value.includes(s.status))
})

// ── Table headers ─────────────────────────────────────────────────────────────
const headers = [
  { title: 'Title', key: 'title' },
  { title: 'Author', key: 'author', sortable: false },
  { title: 'Type', key: 'type', sortable: false },
  { title: 'Duration', key: 'duration', sortable: false },
  { title: 'Status', key: 'status' },
  { title: 'Stars', key: 'starCount', sortable: true },
  { title: 'Tags', key: 'tags', sortable: false },
  { title: 'Actions', key: 'actions', sortable: false },
]

function authorName(session: SessionItem): string {
  const parts = [session.authorFirstName, session.authorLastName].filter(Boolean)
  return parts.length ? parts.join(' ') : (session.authorEmail ?? 'Unknown')
}

// ── Create / Edit dialog ──────────────────────────────────────────────────────
const dialog = ref(false)
const editingSession = ref<SessionItem | null>(null)
const saving = ref(false)

const form = ref({
  title: '',
  description: '',
  tags: '' as string,
  status: 'proposed' as SessionStatus,
  type: 'discussion' as SessionType,
  duration: null as number | null,
})

const actionError = ref('')

function openCreate() {
  editingSession.value = null
  form.value = { title: '', description: '', tags: '', status: 'proposed', type: 'discussion', duration: null }
  actionError.value = ''
  dialog.value = true
}

function openEdit(session: SessionItem) {
  editingSession.value = session
  form.value = {
    title: session.title,
    description: session.description ?? '',
    tags: session.tags.join(', '),
    status: session.status,
    type: session.type,
    duration: session.duration,
  }
  actionError.value = ''
  dialog.value = true
}

function parseTags(raw: string): string[] {
  return raw.split(',').map(t => t.trim()).filter(Boolean)
}

async function save() {
  if (!form.value.title.trim()) {
    actionError.value = 'Title is required.'
    return
  }
  saving.value = true
  actionError.value = ''
  try {
    const body = {
      title: form.value.title.trim(),
      description: form.value.description.trim() || null,
      tags: parseTags(form.value.tags),
      status: form.value.status,
      type: form.value.type,
      duration: form.value.duration ?? undefined,
    }
    if (editingSession.value) {
      await $fetch(`/api/events/${eventId}/sessions/${editingSession.value.id}`, {
        method: 'PUT',
        body,
      })
    } else {
      await $fetch(`/api/events/${eventId}/sessions`, {
        method: 'POST',
        body,
      })
    }
    dialog.value = false
    await refresh()
  } catch (err: unknown) {
    const message = (err as { data?: { message?: string } })?.data?.message
      ?? (err instanceof Error ? err.message : 'An error occurred')
    actionError.value = message
  } finally {
    saving.value = false
  }
}

function effectiveDuration(session: SessionItem): string {
  if (session.duration !== null) return `${session.duration} min`
  if (!eventInfo.value) return '—'
  const def = session.type === 'workshop'
    ? eventInfo.value.defaultWorkshopDuration
    : eventInfo.value.defaultDiscussionDuration
  return `${def} min (default)`
}

const deleteDialog = ref(false)
const deletingSession = ref<SessionItem | null>(null)
const deleting = ref(false)
const deleteError = ref('')

function openDelete(session: SessionItem) {
  deletingSession.value = session
  deleteError.value = ''
  deleteDialog.value = true
}

async function confirmDelete() {
  if (!deletingSession.value) return
  deleting.value = true
  deleteError.value = ''
  try {
    await $fetch(`/api/events/${eventId}/sessions/${deletingSession.value.id}`, {
      method: 'DELETE',
    })
    deleteDialog.value = false
    await refresh()
  } catch (err: unknown) {
    deleteError.value = (err as { data?: { message?: string } })?.data?.message
      ?? 'Failed to delete session'
  } finally {
    deleting.value = false
  }
}
</script>

<template>
  <v-container>
    <v-btn
      variant="text"
      to="/admin/events"
      prepend-icon="mdi-arrow-left"
      class="mb-4"
    >
      Back to Events
    </v-btn>

    <div class="d-flex align-center justify-space-between mb-4">
      <h1 class="text-h4">
        Sessions — {{ eventInfo?.name ?? 'Loading...' }}
      </h1>
      <v-btn color="primary" prepend-icon="mdi-plus" @click="openCreate">
        Create Session
      </v-btn>
    </div>

    <!-- Status filter chips -->
    <div class="d-flex flex-wrap ga-2 mb-4">
      <v-chip
        v-for="opt in statusOptions"
        :key="opt.value"
        :color="statusFilter.includes(opt.value) ? statusColors[opt.value] : undefined"
        :variant="statusFilter.includes(opt.value) ? 'flat' : 'outlined'"
        size="small"
        clickable
        @click="statusFilter.includes(opt.value)
          ? statusFilter.splice(statusFilter.indexOf(opt.value), 1)
          : statusFilter.push(opt.value)"
      >
        {{ opt.title }}
      </v-chip>
      <v-chip
        v-if="statusFilter.length > 0"
        size="small"
        variant="text"
        color="grey"
        clickable
        @click="statusFilter = []"
      >
        Clear filters
      </v-chip>
    </div>

    <div v-if="fetchStatus === 'pending'" class="d-flex flex-column align-center pa-8">
      <v-progress-circular indeterminate color="primary" size="48" class="mb-4" />
      <p class="text-body-1 text-grey">Loading sessions…</p>
    </div>

    <v-alert v-else-if="fetchStatus === 'error'" type="error" variant="tonal" class="mb-4">
      Failed to load sessions. Please try again.
    </v-alert>

    <v-data-table
      v-else
      :headers="headers"
      :items="filteredSessions"
      :items-per-page="25"
      class="elevation-1"
    >
      <template #[`item.type`]="{ item }">
        <v-chip
          :color="item.type === 'workshop' ? 'orange' : 'blue'"
          size="small"
          variant="tonal"
        >
          {{ item.type }}
        </v-chip>
      </template>

      <template #[`item.duration`]="{ item }">
        {{ effectiveDuration(item) }}
      </template>

      <template #[`item.status`]="{ item }">
        <v-chip :color="statusColors[item.status]" size="small">
          {{ item.status }}
        </v-chip>
      </template>

      <template #[`item.starCount`]="{ item }">
        <div class="d-flex align-center ga-1">
          <v-icon size="small" color="amber-darken-2">mdi-star</v-icon>
          <span>{{ item.starCount }}</span>
        </div>
      </template>

      <template #[`item.author`]="{ item }">
        {{ authorName(item) }}
      </template>

      <template #[`item.tags`]="{ item }">
        <span v-if="!item.tags.length" class="text-grey">—</span>
        <v-chip
          v-for="tag in item.tags"
          :key="tag"
          size="x-small"
          variant="outlined"
          class="mr-1"
        >{{ tag }}</v-chip>
      </template>

      <template #[`item.actions`]="{ item }">
        <v-btn icon size="small" variant="text" color="primary" @click="openEdit(item)">
          <v-icon>mdi-pencil</v-icon>
          <v-tooltip activator="parent" location="top">Edit</v-tooltip>
        </v-btn>
        <v-btn icon size="small" variant="text" color="error" @click="openDelete(item)">
          <v-icon>mdi-delete</v-icon>
          <v-tooltip activator="parent" location="top">Delete</v-tooltip>
        </v-btn>
      </template>
    </v-data-table>

    <!-- Create / Edit Dialog -->
    <v-dialog v-model="dialog" max-width="600" persistent>
      <v-card>
        <v-card-title>{{ editingSession ? 'Edit Session' : 'Create Session' }}</v-card-title>
        <v-card-text>
          <v-alert
            v-if="actionError"
            type="error"
            variant="tonal"
            class="mb-4"
            closable
            @click:close="actionError = ''"
          >
            {{ actionError }}
          </v-alert>
          <v-text-field
            v-model="form.title"
            label="Title"
            :rules="[v => !!v.trim() || 'Title is required']"
            required
            class="mb-2"
          />
          <v-textarea
            v-model="form.description"
            label="Description"
            rows="3"
            class="mb-2"
          />
          <v-text-field
            v-model="form.tags"
            label="Tags (comma-separated)"
            hint="e.g. devops, security, ai"
            persistent-hint
            class="mb-2"
          />
          <v-select
            v-model="form.status"
            label="Status"
            :items="statusOptions"
            item-title="title"
            item-value="value"
            class="mb-2"
          />
          <v-select
            v-model="form.type"
            label="Session Type"
            :items="[{ title: 'Discussion', value: 'discussion' }, { title: 'Workshop', value: 'workshop' }]"
            item-title="title"
            item-value="value"
            class="mb-2"
          />
          <v-text-field
            v-model.number="form.duration"
            label="Duration (minutes) — leave blank to use event default"
            type="number"
            :min="1"
            clearable
            class="mb-2"
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" :disabled="saving" @click="dialog = false">Cancel</v-btn>
          <v-btn
            color="primary"
            :loading="saving"
            :disabled="!form.title.trim()"
            @click="save"
          >
            Save
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Delete Confirmation Dialog -->
    <v-dialog v-model="deleteDialog" max-width="450">
      <v-card>
        <v-card-title>Delete Session</v-card-title>
        <v-card-text>
          <v-alert v-if="deleteError" type="error" variant="tonal" class="mb-3">
            {{ deleteError }}
          </v-alert>
          Are you sure you want to delete <strong>{{ deletingSession?.title }}</strong>?
          This action cannot be undone.
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" :disabled="deleting" @click="deleteDialog = false">Cancel</v-btn>
          <v-btn color="error" :loading="deleting" @click="confirmDelete">Delete</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>
</template>
