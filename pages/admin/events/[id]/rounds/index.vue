<script setup lang="ts">
definePageMeta({ middleware: 'admin' })

const route = useRoute()
const eventId = route.params.id as string

type RoundStatus = 'draft' | 'assigned' | 'open' | 'closed'

interface RoundItem {
  id: string
  eventId: string
  name: string | null
  duration: number
  startTime: string | null
  minParticipants: number
  status: RoundStatus
  createdAt: string
  updatedAt: string
}

useHead({ title: 'Rounds' })

const statusColors: Record<RoundStatus, string> = {
  draft: 'grey',
  assigned: 'blue',
  open: 'green',
  closed: 'deep-purple',
}

const { data: rounds, status: fetchStatus, refresh } = useAsyncData(
  `rounds-${eventId}`,
  () => $fetch<RoundItem[]>(`/api/events/${eventId}/rounds`),
)

// ── Create / Edit dialog ──────────────────────────────────────────────────────
const dialog = ref(false)
const deleteDialog = ref(false)
const saving = ref(false)
const actionError = ref('')
const editingRound = ref<RoundItem | null>(null)
const deletingRound = ref<RoundItem | null>(null)

const form = ref({
  name: '',
  duration: 75,
  startTime: '',
  minParticipants: 3,
})

function openCreate() {
  editingRound.value = null
  form.value = { name: '', duration: 75, startTime: '', minParticipants: 3 }
  actionError.value = ''
  dialog.value = true
}

function openEdit(round: RoundItem) {
  editingRound.value = round
  form.value = {
    name: round.name ?? '',
    duration: round.duration,
    startTime: round.startTime ? round.startTime.slice(0, 16) : '',
    minParticipants: round.minParticipants,
  }
  actionError.value = ''
  dialog.value = true
}

function openDelete(round: RoundItem) {
  deletingRound.value = round
  actionError.value = ''
  deleteDialog.value = true
}

function displayName(round: RoundItem): string {
  return round.name ?? `Round (${round.duration} min)`
}

function formatTime(ts: string | null): string {
  if (!ts) return '—'
  return new Date(ts).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

async function save() {
  if (!form.value.duration || form.value.duration < 1) {
    actionError.value = 'Duration must be a positive number.'
    return
  }
  saving.value = true
  actionError.value = ''
  try {
    const body = {
      name: form.value.name.trim() || undefined,
      duration: form.value.duration,
      startTime: form.value.startTime || undefined,
      minParticipants: form.value.minParticipants,
    }
    if (editingRound.value) {
      await $fetch(`/api/events/${eventId}/rounds/${editingRound.value.id}`, { method: 'PUT', body })
    } else {
      await $fetch(`/api/events/${eventId}/rounds`, { method: 'POST', body })
    }
    dialog.value = false
    await refresh()
  } catch (err: unknown) {
    actionError.value = (err as { data?: { message?: string } })?.data?.message
      ?? (err instanceof Error ? err.message : 'An error occurred')
  } finally {
    saving.value = false
  }
}

async function confirmDelete() {
  if (!deletingRound.value) return
  saving.value = true
  actionError.value = ''
  try {
    await $fetch(`/api/events/${eventId}/rounds/${deletingRound.value.id}`, { method: 'DELETE' })
    deleteDialog.value = false
    await refresh()
  } catch (err: unknown) {
    actionError.value = (err as { data?: { message?: string } })?.data?.message ?? 'Failed to delete round'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div>
    <AdminEventNav />

    <div class="d-flex align-center justify-space-between mb-4">
      <h2 class="text-h6">Rounds</h2>
      <v-btn color="deep-purple" prepend-icon="mdi-plus" @click="openCreate">
        New Round
      </v-btn>
    </div>

    <v-progress-linear v-if="fetchStatus === 'pending'" indeterminate color="deep-purple" class="mb-4" />

    <v-alert v-if="fetchStatus === 'error'" type="error" variant="tonal" class="mb-4">
      Failed to load rounds.
    </v-alert>

    <v-card v-if="rounds && rounds.length === 0" variant="outlined" class="pa-8 text-center text-grey">
      <v-icon size="48" color="grey-lighten-1" class="mb-2">mdi-clock-outline</v-icon>
      <div>No rounds yet. Create one to start scheduling sessions.</div>
    </v-card>

    <v-row v-else-if="rounds">
      <v-col
        v-for="round in rounds"
        :key="round.id"
        cols="12"
        sm="6"
        md="4"
      >
        <v-card :to="`/admin/events/${eventId}/rounds/${round.id}`" hover>
          <v-card-title class="d-flex align-center justify-space-between">
            <span class="text-truncate">{{ displayName(round) }}</span>
            <v-chip :color="statusColors[round.status]" size="small" class="ml-2 flex-shrink-0">
              {{ round.status }}
            </v-chip>
          </v-card-title>
          <v-card-text class="pb-1">
            <div class="d-flex ga-4 text-body-2 text-medium-emphasis">
              <span><v-icon size="small">mdi-timer-outline</v-icon> {{ round.duration }} min</span>
              <span><v-icon size="small">mdi-account-check-outline</v-icon> min {{ round.minParticipants }}</span>
            </div>
            <div v-if="round.startTime" class="text-body-2 text-medium-emphasis mt-1">
              <v-icon size="small">mdi-calendar</v-icon> {{ formatTime(round.startTime) }}
            </div>
          </v-card-text>
          <v-card-actions>
            <v-spacer />
            <v-btn
              icon
              size="small"
              variant="text"
              color="primary"
              @click.prevent="openEdit(round)"
            >
              <v-icon>mdi-pencil</v-icon>
              <v-tooltip activator="parent" location="top">Edit</v-tooltip>
            </v-btn>
            <v-btn
              icon
              size="small"
              variant="text"
              color="error"
              @click.prevent="openDelete(round)"
            >
              <v-icon>mdi-delete</v-icon>
              <v-tooltip activator="parent" location="top">Delete</v-tooltip>
            </v-btn>
          </v-card-actions>
        </v-card>
      </v-col>
    </v-row>

    <!-- Create / Edit Dialog -->
    <v-dialog v-model="dialog" max-width="500" persistent>
      <v-card>
        <v-card-title>{{ editingRound ? 'Edit Round' : 'New Round' }}</v-card-title>
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
            label="Name (optional)"
            placeholder="e.g. Morning Round"
            class="mb-2"
          />
          <v-text-field
            v-model.number="form.duration"
            label="Duration (minutes)"
            type="number"
            min="1"
            required
            class="mb-2"
          />
          <v-text-field
            v-model="form.startTime"
            label="Start time (optional)"
            type="datetime-local"
            class="mb-2"
          />
          <v-text-field
            v-model.number="form.minParticipants"
            label="Min participants per session"
            type="number"
            min="1"
            class="mb-2"
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" :disabled="saving" @click="dialog = false">Cancel</v-btn>
          <v-btn
            color="deep-purple"
            :loading="saving"
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
        <v-card-title>Delete Round</v-card-title>
        <v-card-text>
          <v-alert v-if="actionError" type="error" variant="tonal" class="mb-3">
            {{ actionError }}
          </v-alert>
          Are you sure you want to delete <strong>{{ deletingRound ? displayName(deletingRound) : '' }}</strong>?
          This will remove all slot assignments.
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
