<script setup lang="ts">
definePageMeta({ middleware: 'admin' })
useHead({ title: 'Manage Events' })

interface EventItem {
  id: string
  name: string
  description: string | null
  date: string | null
  submissionRestricted: boolean
  minStars: number
  maxStars: number
  defaultDiscussionDuration: number
  defaultWorkshopDuration: number
  createdAt: string
  updatedAt: string
  inviteeCount: number
  sessionCount: number
  roomCount: number
}

const headers = [
  { title: 'Name', key: 'name' },
  { title: 'Description', key: 'description' },
  { title: 'Date', key: 'date' },
  { title: 'Participants', key: 'inviteeCount', sortable: true },
  { title: 'Sessions', key: 'sessionCount', sortable: true },
  { title: 'Rooms', key: 'roomCount', sortable: true },
  { title: 'Actions', key: 'actions', sortable: false },
]

const { data: events, status, error, refresh } = useFetch<EventItem[]>('/api/events', { lazy: false })

const dialog = ref(false)
const deleteDialog = ref(false)
const saving = ref(false)
const actionError = ref('')
const editingEvent = ref<EventItem | null>(null)
const deletingEvent = ref<EventItem | null>(null)

const form = ref({
  name: '',
  description: '',
  date: '',
  submissionRestricted: false,
  minStars: 4,
  maxStars: 6,
  defaultDiscussionDuration: 30,
  defaultWorkshopDuration: 75,
})

function formatDate(date: string | null): string {
  if (!date) return 'No date set'
  return new Date(date).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

function truncate(text: string | null, length = 80): string {
  if (!text) return '—'
  return text.length > length ? `${text.slice(0, length)}…` : text
}

function openCreate() {
  editingEvent.value = null
  form.value = { name: '', description: '', date: '', submissionRestricted: false, minStars: 4, maxStars: 6, defaultDiscussionDuration: 30, defaultWorkshopDuration: 75 }
  actionError.value = ''
  dialog.value = true
}

function openEdit(event: EventItem) {
  editingEvent.value = event
  form.value = {
    name: event.name,
    description: event.description ?? '',
    date: event.date ? new Date(event.date).toISOString().slice(0, 10) : '',
    submissionRestricted: event.submissionRestricted,
    minStars: event.minStars,
    maxStars: event.maxStars,
    defaultDiscussionDuration: event.defaultDiscussionDuration,
    defaultWorkshopDuration: event.defaultWorkshopDuration,
  }
  actionError.value = ''
  dialog.value = true
}

function openDelete(event: EventItem) {
  deletingEvent.value = event
  actionError.value = ''
  deleteDialog.value = true
}

async function save() {
  if (!form.value.name.trim()) {
    actionError.value = 'Name is required.'
    return
  }

  saving.value = true
  actionError.value = ''

  try {
    const body = {
      name: form.value.name.trim(),
      description: form.value.description.trim() || undefined,
      date: form.value.date || undefined,
      submissionRestricted: form.value.submissionRestricted,
      minStars: form.value.minStars,
      maxStars: form.value.maxStars,
      defaultDiscussionDuration: form.value.defaultDiscussionDuration,
      defaultWorkshopDuration: form.value.defaultWorkshopDuration,
    }

    if (editingEvent.value) {
      await $fetch(`/api/events/${editingEvent.value.id}`, { method: 'PUT', body })
    } else {
      await $fetch('/api/events', { method: 'POST', body })
    }

    dialog.value = false
    await refresh()
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'An error occurred'
    actionError.value = message
  } finally {
    saving.value = false
  }
}

async function confirmDelete() {
  if (!deletingEvent.value) return

  saving.value = true
  actionError.value = ''

  try {
    await $fetch(`/api/events/${deletingEvent.value.id}`, { method: 'DELETE' })
    deleteDialog.value = false
    await refresh()
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to delete event'
    actionError.value = message
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div>
    <div class="d-flex align-center justify-space-between mb-4">
      <h1 class="text-h4">Manage Events</h1>
      <v-btn color="primary" prepend-icon="mdi-plus" @click="openCreate">
        Create Event
      </v-btn>
    </div>

    <v-progress-linear v-if="status === 'pending'" indeterminate color="primary" class="mb-4" />

    <v-alert v-if="status === 'error'" type="error" variant="tonal" class="mb-4">
      {{ error?.message || 'Failed to load events.' }}
    </v-alert>

    <v-data-table
      v-if="events"
      :headers="headers"
      :items="events"
      :items-per-page="25"
      class="elevation-1"
    >
      <template #[`item.description`]="{ item }">
        {{ truncate(item.description) }}
      </template>

      <template #[`item.date`]="{ item }">
        {{ formatDate(item.date) }}
      </template>

      <template #[`item.actions`]="{ item }">
        <v-btn icon size="small" variant="text" color="primary" @click="openEdit(item)">
          <v-icon>mdi-pencil</v-icon>
          <v-tooltip activator="parent" location="top">Edit</v-tooltip>
        </v-btn>
        <v-btn
          icon
          size="small"
          variant="text"
          color="secondary"
          :to="`/admin/events/${item.id}/invitees`"
        >
          <v-icon>mdi-account-multiple</v-icon>
          <v-tooltip activator="parent" location="top">Manage Invitees</v-tooltip>
        </v-btn>
        <v-btn
          icon
          size="small"
          variant="text"
          color="teal"
          :to="`/admin/events/${item.id}/sessions`"
        >
          <v-icon>mdi-presentation</v-icon>
          <v-tooltip activator="parent" location="top">Manage Sessions</v-tooltip>
        </v-btn>
        <v-btn
          icon
          size="small"
          variant="text"
          color="deep-purple"
          :to="`/admin/events/${item.id}/rooms`"
        >
          <v-icon>mdi-door</v-icon>
          <v-tooltip activator="parent" location="top">Manage Rooms</v-tooltip>
        </v-btn>
        <v-btn
          icon
          size="small"
          variant="text"
          color="orange-darken-2"
          :to="`/admin/events/${item.id}/rounds`"
        >
          <v-icon>mdi-timer-play-outline</v-icon>
          <v-tooltip activator="parent" location="top">Manage Rounds</v-tooltip>
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
        <v-card-title>{{ editingEvent ? 'Edit Event' : 'Create Event' }}</v-card-title>
        <v-card-text>
          <v-alert v-if="actionError" type="error" variant="tonal" class="mb-4" closable @click:close="actionError = ''">
            {{ actionError }}
          </v-alert>
          <v-text-field
            v-model="form.name"
            label="Name"
            :rules="[v => !!v.trim() || 'Name is required']"
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
            v-model="form.date"
            label="Date"
            type="date"
          />
          <v-switch
            v-model="form.submissionRestricted"
            label="Restrict session submission to staff and admins"
            color="primary"
            density="compact"
          />
          <div class="d-flex ga-4 mt-2">
            <v-text-field
              v-model.number="form.minStars"
              label="Minimum stars per participant"
              type="number"
              :min="0"
              :max="form.maxStars"
              style="flex: 1"
            />
            <v-text-field
              v-model.number="form.maxStars"
              label="Maximum stars per participant"
              type="number"
              :min="1"
              style="flex: 1"
            />
          </div>
          <div class="d-flex ga-4 mt-2">
            <v-text-field
              v-model.number="form.defaultDiscussionDuration"
              label="Default discussion duration (min)"
              type="number"
              :min="1"
              style="flex: 1"
            />
            <v-text-field
              v-model.number="form.defaultWorkshopDuration"
              label="Default workshop duration (min)"
              type="number"
              :min="1"
              style="flex: 1"
            />
          </div>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" :disabled="saving" @click="dialog = false">Cancel</v-btn>
          <v-btn color="primary" :loading="saving" :disabled="!form.name.trim()" @click="save">
            Save
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Delete Confirmation Dialog -->
    <v-dialog v-model="deleteDialog" max-width="450">
      <v-card>
        <v-card-title>Delete Event</v-card-title>
        <v-card-text>
          Are you sure you want to delete <strong>{{ deletingEvent?.name }}</strong>? This action cannot be undone.
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" :disabled="saving" @click="deleteDialog = false">Cancel</v-btn>
          <v-btn color="error" :loading="saving" @click="confirmDelete">Delete</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>
