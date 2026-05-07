<script setup lang="ts">
definePageMeta({ middleware: 'admin' })

const route = useRoute()
const eventId = route.params.id as string
const roundId = route.params.roundId as string

type RoundStatus = 'draft' | 'assigned' | 'open' | 'closed'
type RoomType = 'workshop' | 'meeting' | 'both'
type SessionType = 'discussion' | 'workshop'

interface RoomItem {
  id: string
  name: string
  maxCapacity: number
  type: RoomType
}

interface SessionItem {
  id: string
  title: string
  type: SessionType
  duration: number | null
  starCount: number
}

interface UserItem {
  id: string
  firstName: string | null
  lastName: string | null
  email: string
}

interface Registration {
  slotId: string
  userId: string
  user: UserItem
}

interface SlotItem {
  id: string
  roundId: string
  roomId: string
  sessionId: string | null
  slotIndex: number
  session: SessionItem | null
  room: RoomItem
  registrations: Registration[]
}

interface RoundDetail {
  id: string
  eventId: string
  name: string | null
  duration: number
  startTime: string | null
  minParticipants: number
  breakDuration: number
  status: RoundStatus
  createdAt: string
  updatedAt: string
  enabledRooms: RoomItem[]
  slots: SlotItem[]
}

interface Invitation {
  usedAt: string | null
}

interface InviteeItem {
  id: string
  firstName: string
  lastName: string
  email: string
  role: string
  invitations: Invitation[]
}

useHead({ title: 'Round Detail' })

const statusColors: Record<RoundStatus, string> = {
  draft: 'grey',
  assigned: 'blue',
  open: 'green',
  closed: 'deep-purple',
}

const sessionTypeColors: Record<SessionType, string> = {
  discussion: 'blue',
  workshop: 'orange',
}

// ── Data fetching ─────────────────────────────────────────────────────────────

const { data: round, status: fetchStatus, refresh } = useAsyncData(
  `round-${roundId}`,
  () => $fetch<RoundDetail>(`/api/events/${eventId}/rounds/${roundId}`),
)

const { data: allRooms } = useAsyncData(
  `rooms-${eventId}`,
  () => $fetch<RoomItem[]>(`/api/events/${eventId}/rooms`),
)

const { data: allInvitees } = useAsyncData(
  `invitees-${eventId}`,
  () => $fetch<InviteeItem[]>(`/api/events/${eventId}/invitees`),
)

// ── Derived data ─────────────────────────────────────────────────────────────

const enabledRoomIds = computed<Set<string>>(() =>
  new Set(round.value?.enabledRooms.map((r) => r.id) ?? []),
)

// Group slots by slotIndex for the grid view
const slotIndices = computed<number[]>(() => {
  if (!round.value?.slots.length) return []
  const indices = [...new Set(round.value.slots.map((s) => s.slotIndex))].sort((a, b) => a - b)
  return indices
})

// Get slots for a given room + slotIndex
function slotFor(roomId: string, idx: number): SlotItem | undefined {
  return round.value?.slots.find((s) => s.roomId === roomId && s.slotIndex === idx)
}

// Sessions that appear in the assignment (unique, with their slots)
const assignedSessions = computed(() => {
  if (!round.value?.slots) return []
  const seen = new Map<string, { session: SessionItem; slots: SlotItem[] }>()
  for (const slot of round.value.slots) {
    if (!slot.session) continue
    if (!seen.has(slot.session.id)) {
      seen.set(slot.session.id, { session: slot.session, slots: [] })
    }
    seen.get(slot.session.id)!.slots.push(slot)
  }
  return [...seen.values()].sort((a, b) => b.session.starCount - a.session.starCount)
})

// ── Room selection ────────────────────────────────────────────────────────────

const localEnabledRoomIds = ref<string[]>([])
watch(
  () => round.value?.enabledRooms,
  (rooms) => {
    if (rooms) localEnabledRoomIds.value = rooms.map((r) => r.id)
  },
  { immediate: true },
)

const savingRooms = ref(false)
const roomsError = ref('')

async function saveRooms() {
  savingRooms.value = true
  roomsError.value = ''
  try {
    await $fetch(`/api/events/${eventId}/rounds/${roundId}/rooms`, {
      method: 'PUT',
      body: { roomIds: localEnabledRoomIds.value },
    })
    await refresh()
  } catch (err: unknown) {
    roomsError.value = (err as { data?: { message?: string } })?.data?.message ?? 'Failed to update rooms'
  } finally {
    savingRooms.value = false
  }
}

// ── Round settings ────────────────────────────────────────────────────────────

const settingsDialog = ref(false)
const savingSettings = ref(false)
const settingsError = ref('')

const settingsForm = ref({
  name: '',
  duration: 75,
  startTime: '',
  minParticipants: 3,
  breakDuration: 15,
})

function openSettings() {
  if (!round.value) return
  settingsForm.value = {
    name: round.value.name ?? '',
    duration: round.value.duration,
    startTime: round.value.startTime ? round.value.startTime.slice(0, 16) : '',
    minParticipants: round.value.minParticipants,
    breakDuration: round.value.breakDuration,
  }
  settingsError.value = ''
  settingsDialog.value = true
}

async function saveSettings() {
  savingSettings.value = true
  settingsError.value = ''
  try {
    await $fetch(`/api/events/${eventId}/rounds/${roundId}`, {
      method: 'PUT',
      body: {
        name: settingsForm.value.name.trim() || null,
        duration: settingsForm.value.duration,
        startTime: settingsForm.value.startTime || null,
        minParticipants: settingsForm.value.minParticipants,
        breakDuration: settingsForm.value.breakDuration,
      },
    })
    settingsDialog.value = false
    await refresh()
  } catch (err: unknown) {
    settingsError.value = (err as { data?: { message?: string } })?.data?.message ?? 'Failed to save settings'
  } finally {
    savingSettings.value = false
  }
}

// ── Assignment ────────────────────────────────────────────────────────────────

const assigning = ref(false)
const assignError = ref('')

async function runAssignment() {
  assigning.value = true
  assignError.value = ''
  try {
    await $fetch(`/api/events/${eventId}/rounds/${roundId}/assign`, { method: 'POST' })
    await refresh()
  } catch (err: unknown) {
    assignError.value = (err as { data?: { message?: string } })?.data?.message ?? 'Assignment failed'
  } finally {
    assigning.value = false
  }
}

// ── Reset ─────────────────────────────────────────────────────────────────────

const resetDialog = ref(false)
const resetting = ref(false)
const resetError = ref('')

async function confirmReset() {
  resetting.value = true
  resetError.value = ''
  try {
    await $fetch(`/api/events/${eventId}/rounds/${roundId}/reset`, { method: 'POST' })
    resetDialog.value = false
    await refresh()
  } catch (err: unknown) {
    resetError.value = (err as { data?: { message?: string } })?.data?.message ?? 'Reset failed'
  } finally {
    resetting.value = false
  }
}

// ── Status transitions ────────────────────────────────────────────────────────

const updatingStatus = ref(false)
const statusError = ref('')

async function setStatus(newStatus: RoundStatus) {
  updatingStatus.value = true
  statusError.value = ''
  try {
    await $fetch(`/api/events/${eventId}/rounds/${roundId}`, {
      method: 'PUT',
      body: { status: newStatus },
    })
    await refresh()
  } catch (err: unknown) {
    statusError.value = (err as { data?: { message?: string } })?.data?.message ?? 'Failed to update status'
  } finally {
    updatingStatus.value = false
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function roundName(r: RoundDetail): string {
  return r.name ?? `Round (${r.duration} min)`
}

function userName(u: UserItem): string {
  const parts = [u.firstName, u.lastName].filter(Boolean)
  return parts.length ? parts.join(' ') : u.email
}

// Slot duration for display
function slotDuration(r: RoundDetail): number {
  return r.duration
}

// Total unique participants registered in this round
const totalParticipants = computed<number>(() => {
  if (!round.value?.slots) return 0
  const ids = new Set<string>()
  for (const slot of round.value.slots) {
    for (const reg of slot.registrations) ids.add(reg.userId)
  }
  return ids.size
})

interface UnassignedEntry {
  invitee: InviteeItem
  missingSlots: number[] // slot indices with no coverage
}

// Accepted invitees who are NOT fully covered for the round.
// A participant is fully covered when:
//   - they have a registration in a workshop session (workshops span the whole round), OR
//   - they have a discussion registration at every slot index in the round.
const unassignedParticipants = computed<UnassignedEntry[]>(() => {
  if (!allInvitees.value || !round.value) return []

  const allSlotIndices = [...new Set(round.value.slots.map((s) => s.slotIndex))].sort((a, b) => a - b)

  // Build coverage per user: tracked by email (invitees have no userId)
  const coverage = new Map<string, { slotIndices: Set<number>; hasWorkshop: boolean }>()
  for (const slot of round.value.slots) {
    for (const reg of slot.registrations) {
      if (!coverage.has(reg.user.email)) {
        coverage.set(reg.user.email, { slotIndices: new Set(), hasWorkshop: false })
      }
      const c = coverage.get(reg.user.email)!
      c.slotIndices.add(slot.slotIndex)
      if (slot.session?.type === 'workshop') c.hasWorkshop = true
    }
  }

  const entries: UnassignedEntry[] = []
  for (const inv of allInvitees.value) {
    if (!inv.invitations.some((i) => i.usedAt !== null)) continue // not accepted
    const c = coverage.get(inv.email)
    if (c?.hasWorkshop) continue // workshop covers the whole round
    const coveredIndices = c?.slotIndices ?? new Set<number>()
    const missingSlots = allSlotIndices.filter((idx) => !coveredIndices.has(idx))
    if (missingSlots.length > 0) entries.push({ invitee: inv, missingSlots })
  }
  return entries
})

// ── Expanded session detail ───────────────────────────────────────────────────
const expandedSession = ref<string | null>(null)
function toggleSession(sessionId: string) {
  expandedSession.value = expandedSession.value === sessionId ? null : sessionId
}
</script>

<template>
  <div>
    <AdminEventNav />

    <div v-if="fetchStatus === 'pending'" class="d-flex justify-center pa-12">
      <v-progress-circular indeterminate color="deep-purple" size="48" />
    </div>

    <v-alert v-else-if="fetchStatus === 'error'" type="error" variant="tonal" class="mb-4">
      Failed to load round.
    </v-alert>

    <template v-else-if="round">
      <!-- Header -->
      <div class="d-flex align-center justify-space-between mb-4 flex-wrap ga-2">
        <div class="d-flex align-center ga-3">
          <v-btn
            variant="text"
            prepend-icon="mdi-arrow-left"
            :to="`/admin/events/${eventId}/rounds`"
            class="px-0"
          >
            Rounds
          </v-btn>
          <h2 class="text-h6 font-weight-bold">{{ roundName(round) }}</h2>
          <v-chip :color="statusColors[round.status]" size="small">
            {{ round.status }}
          </v-chip>
        </div>
        <div class="d-flex ga-2 flex-wrap">
          <v-btn
            variant="outlined"
            prepend-icon="mdi-cog-outline"
            size="small"
            @click="openSettings"
          >
            Settings
          </v-btn>
          <v-btn
            v-if="round.status === 'draft' || round.status === 'assigned'"
            color="deep-purple"
            prepend-icon="mdi-play"
            size="small"
            :loading="assigning"
            @click="runAssignment"
          >
            Run Assignment
          </v-btn>
          <v-btn
            v-if="round.status === 'assigned'"
            color="green"
            prepend-icon="mdi-lock-open-outline"
            size="small"
            :loading="updatingStatus"
            @click="setStatus('open')"
          >
            Open for Booking
          </v-btn>
          <v-btn
            v-if="round.status === 'open'"
            color="grey"
            prepend-icon="mdi-lock-outline"
            size="small"
            :loading="updatingStatus"
            @click="setStatus('closed')"
          >
            Close Round
          </v-btn>
          <v-btn
            v-if="round.status !== 'draft'"
            color="error"
            variant="outlined"
            prepend-icon="mdi-refresh"
            size="small"
            @click="resetDialog = true"
          >
            Reset
          </v-btn>
        </div>
      </div>

      <!-- Error banners -->
      <v-alert v-if="assignError" type="error" variant="tonal" class="mb-4" closable @click:close="assignError = ''">
        {{ assignError }}
      </v-alert>
      <v-alert v-if="statusError" type="error" variant="tonal" class="mb-4" closable @click:close="statusError = ''">
        {{ statusError }}
      </v-alert>

      <!-- Round summary chips -->
      <div class="d-flex flex-wrap ga-2 mb-5">
        <v-chip prepend-icon="mdi-timer-outline" variant="tonal" color="deep-purple">
          {{ round.duration }} min
        </v-chip>
        <v-chip prepend-icon="mdi-account-check-outline" variant="tonal" color="blue">
          Min {{ round.minParticipants }} participants
        </v-chip>
        <v-chip prepend-icon="mdi-account-multiple" variant="tonal" color="indigo">
          {{ totalParticipants }} registered
        </v-chip>
        <v-chip prepend-icon="mdi-timer-pause-outline" variant="tonal" color="orange">
          {{ round.breakDuration }} min break
        </v-chip>
        <v-chip v-if="round.startTime" prepend-icon="mdi-calendar-clock" variant="tonal" color="teal">
          {{
            new Date(round.startTime).toLocaleString(undefined, {
              month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
            })
          }}
        </v-chip>
      </div>

      <v-row>
        <!-- Left: Room configuration -->
        <v-col cols="12" md="4">
          <v-card variant="outlined">
            <v-card-title class="text-subtitle-1 d-flex align-center justify-space-between">
              Rooms
              <v-btn
                size="small"
                color="deep-purple"
                variant="text"
                :loading="savingRooms"
                :disabled="round.status === 'closed'"
                @click="saveRooms"
              >
                Save
              </v-btn>
            </v-card-title>
            <v-alert v-if="roomsError" type="error" variant="tonal" class="mx-3 mb-2" density="compact" closable @click:close="roomsError = ''">
              {{ roomsError }}
            </v-alert>
            <v-list density="compact">
              <v-list-item
                v-for="room in allRooms"
                :key="room.id"
                :class="{ 'opacity-50': round.status === 'closed' }"
              >
                <template #prepend>
                  <v-checkbox-btn
                    v-model="localEnabledRoomIds"
                    :value="room.id"
                    :disabled="round.status === 'closed'"
                    density="compact"
                  />
                </template>
                <v-list-item-title>{{ room.name }}</v-list-item-title>
                <v-list-item-subtitle>
                  <v-chip
                    :color="room.type === 'workshop' ? 'orange' : room.type === 'meeting' ? 'blue' : 'purple'"
                    size="x-small"
                    variant="tonal"
                    class="mr-1"
                  >{{ room.type }}</v-chip>
                  {{ room.maxCapacity }} seats
                </v-list-item-subtitle>
              </v-list-item>
            </v-list>
          </v-card>
        </v-col>

        <!-- Right: Assignment grid / placeholder -->
        <v-col cols="12" md="8">
          <template v-if="round.status === 'draft' && !round.slots.length">
            <v-card variant="outlined" class="pa-8 text-center text-grey">
              <v-icon size="48" color="grey-lighten-1" class="mb-2">mdi-grid-off</v-icon>
              <div>No assignment yet.</div>
              <div class="text-body-2 mt-1">
                Select rooms and click <strong>Run Assignment</strong> to schedule sessions.
              </div>
            </v-card>
          </template>

          <template v-else>
            <!-- ── Grid view: slot × room ───────────────────────────────── -->
            <v-card variant="outlined" class="mb-4">
              <v-card-title class="text-subtitle-1">Schedule Grid</v-card-title>
              <v-card-text class="pa-0">
                <div class="overflow-x-auto">
                  <table class="rounds-grid w-100">
                    <thead>
                      <tr>
                        <th class="slot-label">Time slot</th>
                        <th
                          v-for="room in round.enabledRooms"
                          :key="room.id"
                          class="room-header"
                        >
                          <div>{{ room.name }}</div>
                          <div class="text-caption text-medium-emphasis">
                            <v-chip
                              :color="room.type === 'workshop' ? 'orange' : 'blue'"
                              size="x-small"
                              variant="tonal"
                            >{{ room.type }}</v-chip>
                            {{ room.maxCapacity }} seats
                          </div>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="idx in slotIndices" :key="idx">
                        <td class="slot-label text-medium-emphasis">
                          Slot {{ idx + 1 }}
                        </td>
                        <td
                          v-for="room in round.enabledRooms"
                          :key="room.id"
                          class="slot-cell"
                        >
                          <template v-if="slotFor(room.id, idx)?.session">
                            <v-card
                              :color="slotFor(room.id, idx)!.session!.type === 'workshop' ? 'orange-lighten-5' : 'blue-lighten-5'"
                              flat
                              rounded="sm"
                              class="pa-2"
                            >
                              <div class="text-body-2 font-weight-medium">
                                {{ slotFor(room.id, idx)!.session!.title }}
                              </div>
                              <div class="d-flex align-center ga-1 mt-1">
                                <v-chip
                                  :color="sessionTypeColors[slotFor(room.id, idx)!.session!.type]"
                                  size="x-small"
                                  variant="tonal"
                                >
                                  {{ slotFor(room.id, idx)!.session!.type }}
                                </v-chip>
                                <span class="text-caption text-medium-emphasis">
                                  <v-icon size="x-small" color="amber-darken-2">mdi-star</v-icon>
                                  {{ slotFor(room.id, idx)!.session!.starCount }}
                                </span>
                                <span class="text-caption text-medium-emphasis ml-auto">
                                  <v-icon size="x-small">mdi-account</v-icon>
                                  {{ slotFor(room.id, idx)!.registrations.length }}/{{ room.maxCapacity }}
                                </span>
                              </div>
                            </v-card>
                          </template>
                          <template v-else>
                            <span class="text-caption text-grey">—</span>
                          </template>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </v-card-text>
            </v-card>

            <!-- ── Session detail list ─────────────────────────────────── -->
            <v-card variant="outlined">
              <v-card-title class="text-subtitle-1">Sessions & Participants</v-card-title>
              <v-list>
                <template v-for="entry in assignedSessions" :key="entry.session.id">
                  <v-list-item
                    :class="expandedSession === entry.session.id ? 'bg-grey-lighten-4' : ''"
                    @click="toggleSession(entry.session.id)"
                  >
                    <template #prepend>
                      <v-chip
                        :color="sessionTypeColors[entry.session.type]"
                        size="small"
                        variant="tonal"
                        class="mr-3"
                      >
                        {{ entry.session.type }}
                      </v-chip>
                    </template>
                    <v-list-item-title class="font-weight-medium">
                      {{ entry.session.title }}
                    </v-list-item-title>
                    <v-list-item-subtitle class="d-flex ga-2 align-center">
                      <span>
                        <v-icon size="x-small" color="amber-darken-2">mdi-star</v-icon>
                        {{ entry.session.starCount }} votes
                      </span>
                      <span>{{ entry.slots.length }} slot{{ entry.slots.length > 1 ? 's' : '' }}</span>
                    </v-list-item-subtitle>
                    <template #append>
                      <v-icon>{{ expandedSession === entry.session.id ? 'mdi-chevron-up' : 'mdi-chevron-down' }}</v-icon>
                    </template>
                  </v-list-item>

                  <v-expand-transition>
                    <div v-if="expandedSession === entry.session.id" class="px-4 pb-3">
                      <div
                        v-for="slot in entry.slots"
                        :key="slot.id"
                        class="mb-3"
                      >
                        <div class="text-caption text-medium-emphasis mb-1 d-flex align-center ga-2">
                          <v-icon size="x-small">mdi-door-open</v-icon>
                          {{ slot.room.name }} · Slot {{ slot.slotIndex + 1 }}
                          <v-chip size="x-small" variant="outlined">
                            {{ slot.registrations.length }}/{{ slot.room.maxCapacity }} registered
                          </v-chip>
                        </div>
                        <div v-if="slot.registrations.length" class="d-flex flex-wrap ga-1">
                          <v-chip
                            v-for="reg in slot.registrations"
                            :key="reg.userId"
                            size="x-small"
                            prepend-icon="mdi-account"
                          >
                            {{ userName(reg.user) }}
                          </v-chip>
                        </div>
                        <div v-else class="text-caption text-grey">
                          No participants registered yet.
                        </div>
                      </div>
                    </div>
                  </v-expand-transition>
                  <v-divider />
                </template>

                <v-list-item v-if="!assignedSessions.length" class="text-grey">
                  No sessions assigned.
                </v-list-item>
              </v-list>
            </v-card>

            <!-- ── Unassigned participants ─────────────────────────────── -->
            <v-card variant="outlined" class="mt-4">
              <v-card-title class="text-subtitle-1 d-flex align-center ga-2">
                Unassigned Participants
                <v-chip size="x-small" color="warning" variant="tonal">
                  {{ unassignedParticipants.length }}
                </v-chip>
              </v-card-title>
              <v-card-text v-if="!unassignedParticipants.length" class="text-grey text-body-2">
                All accepted participants are fully covered for every slot.
              </v-card-text>
              <v-list v-else density="compact">
                <v-list-item
                  v-for="entry in unassignedParticipants"
                  :key="entry.invitee.id"
                >
                  <template #prepend>
                    <v-avatar color="warning" size="32" class="mr-2">
                      <v-icon size="small">mdi-account-alert</v-icon>
                    </v-avatar>
                  </template>
                  <v-list-item-title>{{ entry.invitee.firstName }} {{ entry.invitee.lastName }}</v-list-item-title>
                  <v-list-item-subtitle class="d-flex align-center flex-wrap ga-1 mt-1">
                    <span class="text-caption text-medium-emphasis mr-1">Missing:</span>
                    <v-chip
                      v-for="idx in entry.missingSlots"
                      :key="idx"
                      size="x-small"
                      color="warning"
                      variant="tonal"
                    >
                      Slot {{ idx + 1 }}
                    </v-chip>
                  </v-list-item-subtitle>
                </v-list-item>
              </v-list>
            </v-card>
          </template>
        </v-col>
      </v-row>
    </template>

    <!-- Settings Dialog -->
    <v-dialog v-model="settingsDialog" max-width="480" persistent>
      <v-card>
        <v-card-title>Round Settings</v-card-title>
        <v-card-text>
          <v-alert
            v-if="settingsError"
            type="error"
            variant="tonal"
            class="mb-4"
            closable
            @click:close="settingsError = ''"
          >
            {{ settingsError }}
          </v-alert>
          <v-text-field
            v-model="settingsForm.name"
            label="Name (optional)"
            class="mb-2"
          />
          <v-text-field
            v-model.number="settingsForm.duration"
            label="Duration (minutes)"
            type="number"
            min="1"
            class="mb-2"
          />
          <v-text-field
            v-model="settingsForm.startTime"
            label="Start time (optional)"
            type="datetime-local"
            class="mb-2"
          />
          <v-text-field
            v-model.number="settingsForm.minParticipants"
            label="Min participants per session"
            type="number"
            min="1"
            class="mb-2"
          />
          <v-text-field
            v-model.number="settingsForm.breakDuration"
            label="Break between slots (minutes)"
            type="number"
            min="0"
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" :disabled="savingSettings" @click="settingsDialog = false">Cancel</v-btn>
          <v-btn color="deep-purple" :loading="savingSettings" @click="saveSettings">Save</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Reset Confirmation Dialog -->
    <v-dialog v-model="resetDialog" max-width="460" persistent>
      <v-card>
        <v-card-title>Reset Round</v-card-title>
        <v-card-text>
          <v-alert v-if="resetError" type="error" variant="tonal" class="mb-3" closable @click:close="resetError = ''">
            {{ resetError }}
          </v-alert>
          This will permanently delete all slot assignments, participant registrations, and enabled room selections for
          <strong>{{ roundName(round!) }}</strong>, and set its status back to <strong>draft</strong>.
          <br /><br />
          This cannot be undone.
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" :disabled="resetting" @click="resetDialog = false">Cancel</v-btn>
          <v-btn color="error" :loading="resetting" @click="confirmReset">Reset Round</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<style scoped>
.rounds-grid {
  border-collapse: collapse;
}

.rounds-grid th,
.rounds-grid td {
  border: 1px solid rgba(0, 0, 0, 0.12);
  padding: 8px;
  min-width: 160px;
  vertical-align: top;
}

.rounds-grid .slot-label {
  min-width: 80px;
  font-size: 0.75rem;
  font-weight: 600;
  text-align: center;
  background: rgba(0, 0, 0, 0.02);
}

.rounds-grid .room-header {
  text-align: center;
  font-size: 0.8rem;
  background: rgba(103, 58, 183, 0.05);
}

.rounds-grid .slot-cell {
  text-align: center;
}
</style>
