<script setup lang="ts">
definePageMeta({ middleware: 'admin' })

const route = useRoute()
const eventId = route.params.id as string

type RoomType = 'workshop' | 'meeting' | 'both'

interface RoomItem {
  id: string
  eventId: string
  name: string
  description: string | null
  maxCapacity: number
  type: RoomType
  createdAt: string
  updatedAt: string
}

interface EventInfo {
  id: string
  name: string
}

const roomTypeOptions: { title: string; value: RoomType }[] = [
  { title: 'Workshop', value: 'workshop' },
  { title: 'Meeting', value: 'meeting' },
  { title: 'Both', value: 'both' },
]

const roomTypeColors: Record<RoomType, string> = {
  workshop: 'teal',
  meeting: 'blue',
  both: 'deep-purple',
}

const { data: eventInfo } = useAsyncData(`event-${eventId}`, () =>
  $fetch<EventInfo>(`/api/events/${eventId}`),
)

useHead({ title: () => `Rooms — ${eventInfo.value?.name ?? 'Loading...'}` })

const headers = [
  { title: 'Name', key: 'name' },
  { title: 'Type', key: 'type' },
  { title: 'Capacity', key: 'maxCapacity', sortable: true },
  { title: 'Description', key: 'description' },
  { title: 'Actions', key: 'actions', sortable: false },
]

const { data: rooms, status: fetchStatus, refresh } = useAsyncData(
  `rooms-${eventId}`,
  () => $fetch<RoomItem[]>(`/api/events/${eventId}/rooms`),
)

// ── Create / Edit dialog ──────────────────────────────────────────────────────
const dialog = ref(false)
const deleteDialog = ref(false)
const saving = ref(false)
const actionError = ref('')
const editingRoom = ref<RoomItem | null>(null)
const deletingRoom = ref<RoomItem | null>(null)

const form = ref({
  name: '',
  description: '',
  maxCapacity: 8,
  type: 'meeting' as RoomType,
})

function openCreate() {
  editingRoom.value = null
  form.value = { name: '', description: '', maxCapacity: 8, type: 'meeting' }
  actionError.value = ''
  dialog.value = true
}

function openEdit(room: RoomItem) {
  editingRoom.value = room
  form.value = {
    name: room.name,
    description: room.description ?? '',
    maxCapacity: room.maxCapacity,
    type: room.type,
  }
  actionError.value = ''
  dialog.value = true
}

function openDelete(room: RoomItem) {
  deletingRoom.value = room
  actionError.value = ''
  deleteDialog.value = true
}

async function save() {
  if (!form.value.name.trim()) {
    actionError.value = 'Name is required.'
    return
  }
  if (!form.value.maxCapacity || form.value.maxCapacity < 1) {
    actionError.value = 'Capacity must be a positive number.'
    return
  }

  saving.value = true
  actionError.value = ''

  try {
    const body = {
      name: form.value.name.trim(),
      description: form.value.description.trim() || undefined,
      maxCapacity: form.value.maxCapacity,
      type: form.value.type,
    }

    if (editingRoom.value) {
      await $fetch(`/api/events/${eventId}/rooms/${editingRoom.value.id}`, { method: 'PUT', body })
    } else {
      await $fetch(`/api/events/${eventId}/rooms`, { method: 'POST', body })
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
  if (!deletingRoom.value) return

  saving.value = true
  actionError.value = ''

  try {
    await $fetch(`/api/events/${eventId}/rooms/${deletingRoom.value.id}`, { method: 'DELETE' })
    deleteDialog.value = false
    await refresh()
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to delete room'
    actionError.value = message
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div>
    <AdminEventNav />

    <div class="d-flex align-center justify-space-between mb-4">
      <h2 class="text-h6">Rooms</h2>
      <v-btn color="deep-purple" prepend-icon="mdi-plus" @click="openCreate">
        Add Room
      </v-btn>
    </div>

    <v-progress-linear v-if="fetchStatus === 'pending'" indeterminate color="deep-purple" class="mb-4" />

    <v-data-table
      v-if="rooms"
      :headers="headers"
      :items="rooms"
      :items-per-page="25"
      class="elevation-1"
    >
      <template #[`item.type`]="{ item }">
        <v-chip :color="roomTypeColors[item.type]" size="small">
          {{ item.type }}
        </v-chip>
      </template>

      <template #[`item.description`]="{ item }">
        {{ item.description ?? '—' }}
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
    <v-dialog v-model="dialog" max-width="500" persistent>
      <v-card>
        <v-card-title>{{ editingRoom ? 'Edit Room' : 'Add Room' }}</v-card-title>
        <v-card-text>
          <v-alert v-if="actionError" type="error" variant="tonal" class="mb-4" closable @click:close="actionError = ''">
            {{ actionError }}
          </v-alert>
          <v-text-field
            v-model="form.name"
            label="Name"
            required
            class="mb-2"
          />
          <v-select
            v-model="form.type"
            :items="roomTypeOptions"
            label="Type"
            class="mb-2"
          />
          <v-text-field
            v-model.number="form.maxCapacity"
            label="Max Capacity"
            type="number"
            min="1"
            class="mb-2"
          />
          <v-textarea
            v-model="form.description"
            label="Description (optional)"
            rows="3"
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" :disabled="saving" @click="dialog = false">Cancel</v-btn>
          <v-btn color="deep-purple" :loading="saving" :disabled="!form.name.trim()" @click="save">
            Save
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Delete Confirmation Dialog -->
    <v-dialog v-model="deleteDialog" max-width="450">
      <v-card>
        <v-card-title>Delete Room</v-card-title>
        <v-card-text>
          Are you sure you want to delete <strong>{{ deletingRoom?.name }}</strong>? This action cannot be undone.
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
