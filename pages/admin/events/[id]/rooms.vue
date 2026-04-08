<script setup lang="ts">
definePageMeta({ middleware: 'admin' })

const route = useRoute()
const eventId = route.params.id as string

interface RoomItem {
  id: string
  eventId: string
  name: string
  description: string | null
  capacity: number | null
  createdAt: string
  updatedAt: string
}

interface EventInfo {
  id: string
  name: string
}

const { data: eventInfo } = useAsyncData(`event-${eventId}`, () =>
  $fetch<EventInfo>(`/api/events/${eventId}`),
)

useHead({ title: () => `Rooms — ${eventInfo.value?.name ?? 'Loading...'}` })

const { data: rooms, status: fetchStatus, refresh } = useAsyncData(
  `rooms-${eventId}`,
  () => $fetch<RoomItem[]>(`/api/events/${eventId}/rooms`),
)

const headers = [
  { title: 'Name', key: 'name' },
  { title: 'Description', key: 'description' },
  { title: 'Capacity', key: 'capacity' },
  { title: 'Actions', key: 'actions', sortable: false },
]

// ── Create / Edit dialog ───────────────────────────────────────────────────
const dialog = ref(false)
const editingRoom = ref<RoomItem | null>(null)
const saving = ref(false)
const actionError = ref('')

const form = ref({
  name: '',
  description: '',
  capacity: '' as string | number,
})

function openCreate() {
  editingRoom.value = null
  form.value = { name: '', description: '', capacity: '' }
  actionError.value = ''
  dialog.value = true
}

function openEdit(room: RoomItem) {
  editingRoom.value = room
  form.value = {
    name: room.name,
    description: room.description ?? '',
    capacity: room.capacity ?? '',
  }
  actionError.value = ''
  dialog.value = true
}

async function save() {
  saving.value = true
  actionError.value = ''
  try {
    const payload: Record<string, unknown> = {
      name: form.value.name.trim(),
      description: form.value.description.trim() || null,
      capacity: form.value.capacity === '' ? null : Number(form.value.capacity),
    }

    if (editingRoom.value) {
      await $fetch(`/api/events/${eventId}/rooms/${editingRoom.value.id}`, {
        method: 'PUT',
        body: payload,
      })
    } else {
      await $fetch(`/api/events/${eventId}/rooms`, {
        method: 'POST',
        body: payload,
      })
    }
    dialog.value = false
    await refresh()
  } catch (err: unknown) {
    actionError.value = (err as { data?: { message?: string } })?.data?.message
      ?? 'Failed to save room'
  } finally {
    saving.value = false
  }
}

// ── Delete dialog ─────────────────────────────────────────────────────────
const deleteDialog = ref(false)
const deletingRoom = ref<RoomItem | null>(null)
const deleting = ref(false)
const deleteError = ref('')

function openDelete(room: RoomItem) {
  deletingRoom.value = room
  deleteError.value = ''
  deleteDialog.value = true
}

async function confirmDelete() {
  if (!deletingRoom.value) return
  deleting.value = true
  deleteError.value = ''
  try {
    await $fetch(`/api/events/${eventId}/rooms/${deletingRoom.value.id}`, {
      method: 'DELETE',
    })
    deleteDialog.value = false
    await refresh()
  } catch (err: unknown) {
    deleteError.value = (err as { data?: { message?: string } })?.data?.message
      ?? 'Failed to delete room'
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
        Rooms — {{ eventInfo?.name ?? 'Loading...' }}
      </h1>
      <v-btn color="primary" prepend-icon="mdi-plus" @click="openCreate">
        Add Room
      </v-btn>
    </div>

    <div v-if="fetchStatus === 'pending'" class="d-flex flex-column align-center pa-8">
      <v-progress-circular indeterminate color="primary" size="48" class="mb-4" />
      <p class="text-body-1 text-grey">Loading rooms…</p>
    </div>

    <v-alert v-else-if="fetchStatus === 'error'" type="error" variant="tonal" class="mb-4">
      Failed to load rooms. Please try again.
    </v-alert>

    <v-data-table
      v-else
      :headers="headers"
      :items="rooms ?? []"
      :items-per-page="25"
      class="elevation-1"
    >
      <template #[`item.description`]="{ item }">
        <span v-if="item.description">{{ item.description }}</span>
        <span v-else class="text-grey">—</span>
      </template>

      <template #[`item.capacity`]="{ item }">
        <span v-if="item.capacity != null">{{ item.capacity }}</span>
        <span v-else class="text-grey">—</span>
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
            v-model="form.capacity"
            label="Capacity"
            type="number"
            min="1"
            hint="Leave blank if unlimited"
            persistent-hint
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" :disabled="saving" @click="dialog = false">Cancel</v-btn>
          <v-btn
            color="primary"
            :loading="saving"
            :disabled="!form.name.trim()"
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
        <v-card-title>Delete Room</v-card-title>
        <v-card-text>
          <v-alert v-if="deleteError" type="error" variant="tonal" class="mb-3">
            {{ deleteError }}
          </v-alert>
          Are you sure you want to delete <strong>{{ deletingRoom?.name }}</strong>?
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
