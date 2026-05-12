<script setup lang="ts">
definePageMeta({ middleware: 'admin' })

const route = useRoute()
const eventId = route.params.id as string

type IntroRoundStatus = 'draft' | 'open' | 'closed'

interface IntroRound {
  id: string
  eventId: string
  numSlots: number
  groupSize: number
  status: IntroRoundStatus
  updatedAt: string
}

interface Participant {
  userId: string
  firstName: string | null
  lastName: string | null
  email: string
}

interface Group {
  roomId: string
  roomName: string
  participants: Participant[]
}

interface Slot {
  slotIndex: number
  groups: Group[]
}

interface IntroRoundDetail extends IntroRound {
  slots: Slot[]
}

useHead({ title: 'Introduction Round' })

const { data: introRound, status: fetchStatus, refresh } = useAsyncData<IntroRoundDetail | null>(
  `intro-round-${eventId}`,
  async () => {
    try {
      return await $fetch<IntroRoundDetail>(`/api/events/${eventId}/introduction-round`)
    } catch (err: unknown) {
      if ((err as { status?: number })?.status === 404) return null
      throw err
    }
  },
)

const statusColors: Record<IntroRoundStatus, string> = {
  draft: 'grey',
  open: 'green',
  closed: 'deep-purple',
}

// ── Create / Edit dialog ──────────────────────────────────────────────────────
const configDialog = ref(false)
const configForm = ref({ numSlots: 2, groupSize: 10 })
const saving = ref(false)
const actionError = ref('')

function openConfig() {
  configForm.value = {
    numSlots: introRound.value?.numSlots ?? 2,
    groupSize: introRound.value?.groupSize ?? 10,
  }
  actionError.value = ''
  configDialog.value = true
}

async function saveConfig() {
  if (configForm.value.numSlots < 1 || configForm.value.groupSize < 1) {
    actionError.value = 'Both values must be positive.'
    return
  }
  saving.value = true
  actionError.value = ''
  try {
    await $fetch(`/api/events/${eventId}/introduction-round`, {
      method: 'POST',
      body: {
        numSlots: configForm.value.numSlots,
        groupSize: configForm.value.groupSize,
      },
    })
    configDialog.value = false
    await refresh()
  } catch (err: unknown) {
    actionError.value = (err as { data?: { message?: string } })?.data?.message
      ?? (err instanceof Error ? err.message : 'An error occurred')
  } finally {
    saving.value = false
  }
}

// ── Dispatch ──────────────────────────────────────────────────────────────────
const dispatching = ref(false)
const dispatchError = ref('')

async function dispatch() {
  dispatching.value = true
  dispatchError.value = ''
  try {
    await $fetch(`/api/events/${eventId}/introduction-round/dispatch`, { method: 'POST' })
    await refresh()
  } catch (err: unknown) {
    dispatchError.value = (err as { data?: { message?: string } })?.data?.message
      ?? (err instanceof Error ? err.message : 'Dispatch failed')
  } finally {
    dispatching.value = false
  }
}

// ── Close ─────────────────────────────────────────────────────────────────────
const closing = ref(false)
const closeError = ref('')

async function closeRound() {
  closing.value = true
  closeError.value = ''
  try {
    await $fetch(`/api/events/${eventId}/introduction-round/close`, { method: 'POST' })
    await refresh()
  } catch (err: unknown) {
    closeError.value = (err as { data?: { message?: string } })?.data?.message
      ?? (err instanceof Error ? err.message : 'Close failed')
  } finally {
    closing.value = false
  }
}

function participantName(p: Participant): string {
  const parts = [p.firstName, p.lastName].filter(Boolean)
  return parts.length > 0 ? parts.join(' ') : p.email
}
</script>

<template>
  <div>
    <AdminEventNav />

    <div class="d-flex align-center justify-space-between mb-4">
      <h2 class="text-h6">Introduction Round</h2>
    </div>

    <v-progress-linear v-if="fetchStatus === 'pending'" indeterminate color="deep-purple" class="mb-4" />

    <!-- No round yet -->
    <v-card v-if="!introRound" variant="outlined" class="pa-8 text-center text-grey mb-6">
      <v-icon size="48" color="grey-lighten-1" class="mb-2">mdi-account-group-outline</v-icon>
      <div class="mb-4">No introduction round configured yet.</div>
      <v-btn color="deep-purple" prepend-icon="mdi-plus" @click="openConfig">
        Configure Introduction Round
      </v-btn>
    </v-card>

    <template v-else>
      <!-- Status card -->
      <v-card class="mb-4" variant="outlined">
        <v-card-title class="d-flex align-center ga-3">
          <span>Introduction Round</span>
          <v-chip :color="statusColors[introRound.status]" size="small">{{ introRound.status }}</v-chip>
        </v-card-title>
        <v-card-text>
          <div class="d-flex ga-6 text-body-2">
            <span><v-icon size="small">mdi-clock-outline</v-icon> {{ introRound.numSlots }} slot{{ introRound.numSlots !== 1 ? 's' : '' }}</span>
            <span><v-icon size="small">mdi-account-group-outline</v-icon> {{ introRound.groupSize }} per group</span>
          </div>
        </v-card-text>
        <v-card-actions>
          <v-btn
            v-if="introRound.status === 'draft'"
            variant="text"
            prepend-icon="mdi-cog-outline"
            :disabled="dispatching || closing"
            @click="openConfig"
          >
            Configure
          </v-btn>
          <v-spacer />
          <v-btn
            v-if="introRound.status !== 'open'"
            color="deep-purple"
            prepend-icon="mdi-shuffle-variant"
            :loading="dispatching"
            :disabled="closing"
            @click="dispatch"
          >
            {{ introRound.status === 'closed' ? 'Re-dispatch' : 'Dispatch' }}
          </v-btn>
          <v-btn
            v-if="introRound.status === 'open'"
            color="error"
            variant="outlined"
            prepend-icon="mdi-stop-circle-outline"
            :loading="closing"
            @click="closeRound"
          >
            Close Round
          </v-btn>
        </v-card-actions>
      </v-card>

      <v-alert v-if="dispatchError" type="error" variant="tonal" class="mb-4" closable @click:close="dispatchError = ''">
        {{ dispatchError }}
      </v-alert>
      <v-alert v-if="closeError" type="error" variant="tonal" class="mb-4" closable @click:close="closeError = ''">
        {{ closeError }}
      </v-alert>

      <!-- Assignment grid -->
      <template v-if="introRound.slots && introRound.slots.length > 0">
        <div
          v-for="slot in introRound.slots"
          :key="slot.slotIndex"
          class="mb-6"
        >
          <h3 class="text-subtitle-1 font-weight-medium mb-3">
            Slot {{ slot.slotIndex + 1 }}
          </h3>
          <v-row>
            <v-col
              v-for="group in slot.groups"
              :key="group.roomId"
              cols="12"
              sm="6"
              md="4"
            >
              <v-card variant="outlined">
                <v-card-title class="text-body-1 font-weight-medium">
                  <v-icon size="small" class="mr-1">mdi-door-open</v-icon>
                  {{ group.roomName }}
                </v-card-title>
                <v-divider />
                <v-list density="compact">
                  <v-list-item
                    v-for="p in group.participants"
                    :key="p.userId"
                    :title="participantName(p)"
                    :subtitle="p.email"
                  >
                    <template #prepend>
                      <v-avatar size="28" color="deep-purple-lighten-4">
                        <span class="text-caption">
                          {{ (p.firstName?.[0] ?? p.email[0] ?? '?').toUpperCase() }}
                        </span>
                      </v-avatar>
                    </template>
                  </v-list-item>
                </v-list>
              </v-card>
            </v-col>
          </v-row>
        </div>
      </template>

      <v-card
        v-else-if="introRound.status !== 'draft'"
        variant="outlined"
        class="pa-6 text-center text-grey"
      >
        <div>No assignments yet. Click "Dispatch" to generate groups.</div>
      </v-card>
    </template>

    <!-- Configure dialog -->
    <v-dialog v-model="configDialog" max-width="450" persistent>
      <v-card>
        <v-card-title>Configure Introduction Round</v-card-title>
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
            v-model.number="configForm.numSlots"
            label="Number of slots"
            type="number"
            min="1"
            class="mb-2"
            hint="How many mixing rounds to run (default 2)"
            persistent-hint
          />
          <v-text-field
            v-model.number="configForm.groupSize"
            label="Group size (max per room)"
            type="number"
            min="1"
            hint="Target number of people per room (default 10)"
            persistent-hint
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" :disabled="saving" @click="configDialog = false">Cancel</v-btn>
          <v-btn color="deep-purple" :loading="saving" @click="saveConfig">Save</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>
