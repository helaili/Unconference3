<script setup lang="ts">
definePageMeta({ middleware: 'auth' })

const route = useRoute()
const eventId = route.params.id as string

type SessionStatus = 'proposed' | 'published' | 'scheduled' | 'delivered'
type SessionType = 'discussion' | 'workshop'
type RoundStatus = 'draft' | 'assigned' | 'open' | 'closed'

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
  submissionRestricted: boolean
}

// ── Round / booking grid types ────────────────────────────────────────────────
interface RoundItem {
  id: string
  name: string | null
  duration: number
  startTime: string | null
  breakDuration: number
  status: RoundStatus
}

interface RoomItem {
  id: string
  name: string
  maxCapacity: number
  type: string
}

interface SlotRegistration {
  slotId: string
  userId: string
}

interface ScheduleSession {
  id: string
  title: string
  type: SessionType
  duration: number | null
}

interface SlotItem {
  id: string
  roundId: string
  roomId: string
  sessionId: string | null
  slotIndex: number
  session: ScheduleSession | null
  room: RoomItem
  registrations: SlotRegistration[]
}

interface RoundDetail extends RoundItem {
  enabledRooms: RoomItem[]
  slots: SlotItem[]
}

const statusColors: Record<SessionStatus, string> = {
  proposed: 'grey',
  published: 'blue',
  scheduled: 'green',
  delivered: 'purple',
}

const { user } = useUserSession()
const includeDelivered = ref(false)
const showStarredOnly = ref(false)
const typeFilter = ref<SessionType | null>(null)

const { data: eventInfo } = useAsyncData(`event-info-${eventId}`, () =>
  $fetch<EventInfo>(`/api/events/${eventId}`),
)

useHead({ title: () => `Sessions — ${eventInfo.value?.name ?? 'Loading...'}` })

// ── Fetch sessions ──────────────────────────────────────────────────────────
const { data: sessions, status: fetchStatus, refresh } = useFetch<SessionItem[]>(
  `/api/events/${eventId}/sessions`,
  {
    lazy: false,
    query: computed(() => includeDelivered.value ? { includeDelivered: 'true' } : {}),
  },
)

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
    await refresh()
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
const editTarget = ref<SessionItem | null>(null)
const editForm = reactive({ title: '', description: '', tags: '' })
const editLoading = ref(false)
const editError = ref('')

function openEdit(session: SessionItem) {
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
    await refresh()
  } catch (e: unknown) {
    const msg = e && typeof e === 'object' && 'data' in e
      ? (e as { data?: { message?: string } }).data?.message
      : undefined
    editError.value = msg || 'Failed to update session. Please try again.'
  } finally {
    editLoading.value = false
  }
}

// ── Introduction round ───────────────────────────────────────────────────────
interface IntroAssignment {
  slotIndex: number
  roomId: string
  roomName: string
}

interface IntroRoundParticipantView {
  id: string
  numSlots: number
  groupSize: number
  status: string
  myAssignments: IntroAssignment[]
}

const { data: introRound } = useAsyncData<IntroRoundParticipantView | null>(
  `intro-round-participant-${eventId}`,
  async () => {
    try {
      return await $fetch<IntroRoundParticipantView>(`/api/events/${eventId}/introduction-round`)
    } catch {
      return null
    }
  },
)

// ── Booking grid ──────────────────────────────────────────────────────────────
const { data: allRounds } = useFetch<RoundItem[]>(`/api/events/${eventId}/rounds`)

const openRounds = computed(() => allRounds.value?.filter(r => r.status === 'open') ?? [])

const openRoundDetails = ref<RoundDetail[]>([])

watch(openRounds, async (rounds, _old, onCleanup) => {
  let cancelled = false
  onCleanup(() => { cancelled = true })
  try {
    const details = await Promise.all(
      rounds.map(r => $fetch<RoundDetail>(`/api/events/${eventId}/rounds/${r.id}`)),
    )
    if (!cancelled) openRoundDetails.value = details
  } catch {
    if (!cancelled) bookingError.value = 'Failed to load booking schedule'
  }
}, { immediate: true })

function slotIndicesFor(rd: RoundDetail): number[] {
  return [...new Set(rd.slots.map(s => s.slotIndex))].sort((a, b) => a - b)
}

function slotFor(rd: RoundDetail, roomId: string, idx: number): SlotItem | undefined {
  return rd.slots.find(s => s.roomId === roomId && s.slotIndex === idx)
}

function isMySlot(slot: SlotItem | undefined): boolean {
  if (!slot) return false
  const dbId = user.value?.dbId
  return !!dbId && slot.registrations.some(r => r.userId === dbId)
}

function seatsLeft(slot: SlotItem | undefined): number {
  if (!slot) return 0
  return Math.max(0, slot.room.maxCapacity - slot.registrations.length)
}

const bookingSlotId = ref<string | null>(null)
const bookingError = ref('')

async function bookSession(roundId: string, slotId: string) {
  bookingSlotId.value = slotId
  bookingError.value = ''
  try {
    await $fetch(`/api/events/${eventId}/rounds/${roundId}/slots/${slotId}/book`, { method: 'POST' })
    const updated = await $fetch<RoundDetail>(`/api/events/${eventId}/rounds/${roundId}`)
    const idx = openRoundDetails.value.findIndex(r => r.id === roundId)
    if (idx >= 0) openRoundDetails.value[idx] = updated
  } catch (err: unknown) {
    bookingError.value = (err as { data?: { message?: string } })?.data?.message ?? 'Failed to book session'
  } finally {
    bookingSlotId.value = null
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function isMySession(session: SessionItem) {
  return !!user.value?.dbId && session.authorId === user.value.dbId
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

    <div class="d-flex align-start justify-space-between flex-wrap ga-4 mb-4">
      <div>
        <h1 class="text-h4 mb-1">
          {{ eventInfo?.name ?? 'Loading...' }}
        </h1>
        <p v-if="eventInfo?.submissionRestricted === false || !eventInfo" class="text-body-2 text-medium-emphasis" />
      </div>

      <div class="d-flex align-center flex-wrap ga-3">
        <!-- Stars budget -->
        <div v-if="eventInfo" class="d-flex align-center ga-2">
          <v-icon color="amber-darken-2">mdi-star</v-icon>
          <span class="text-body-2">
            <strong>{{ starredCount }}</strong> / {{ maxStars }} stars used
            <span v-if="minStars > 0" class="text-grey ml-1">(min {{ minStars }})</span>
          </span>
        </div>

        <v-btn
          v-if="eventInfo && !eventInfo.submissionRestricted"
          color="primary"
          prepend-icon="mdi-plus"
          @click="openPropose"
        >
          Propose a Session
        </v-btn>
        <v-chip
          v-else-if="eventInfo?.submissionRestricted"
          variant="tonal"
          color="grey"
          prepend-icon="mdi-lock"
        >
          Session proposals are closed
        </v-chip>
      </div>
    </div>

    <!-- Filters -->
    <div class="d-flex flex-wrap align-center ga-2 mb-4">
      <v-switch
        v-model="includeDelivered"
        label="Show delivered"
        hide-details
        density="compact"
        color="primary"
      />

      <v-divider vertical class="mx-1" style="height:24px" />

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

    <!-- ── Introduction round ─────────────────────────────────────────────── -->
    <template v-if="introRound && introRound.status === 'open' && introRound.myAssignments.length > 0">
      <v-divider class="my-6" />
      <h2 class="text-h5 mb-3">
        <v-icon start color="deep-purple">mdi-account-group-outline</v-icon>
        Introduction Round
      </h2>
      <p class="text-body-2 text-medium-emphasis mb-4">
        Welcome! Here are your room assignments for the introduction round.
        Head to your assigned room for each slot to meet other participants.
      </p>
      <v-row>
        <v-col
          v-for="a in introRound.myAssignments"
          :key="a.slotIndex"
          cols="12"
          sm="6"
          md="4"
          lg="3"
        >
          <v-card variant="tonal" color="deep-purple">
            <v-card-text class="text-center pa-5">
              <div class="text-caption text-medium-emphasis mb-1">Slot {{ a.slotIndex + 1 }}</div>
              <v-icon size="40" class="mb-2">mdi-door-open</v-icon>
              <div class="text-h6 font-weight-bold">{{ a.roomName }}</div>
            </v-card-text>
          </v-card>
        </v-col>
      </v-row>
    </template>

    <!-- ── Booking grid (open rounds) ──────────────────────────────────────── -->
    <template v-if="openRoundDetails.length > 0">
      <v-divider class="my-6" />
      <h2 class="text-h5 mb-2">
        <v-icon start color="primary">mdi-calendar-check</v-icon>
        Schedule — Book Your Sessions
      </h2>

      <v-alert
        v-if="bookingError"
        type="error"
        variant="tonal"
        class="mb-4"
        closable
        @click:close="bookingError = ''"
      >
        {{ bookingError }}
      </v-alert>

      <div v-for="rd in openRoundDetails" :key="rd.id" class="mb-8">
        <div class="d-flex align-center ga-3 mb-3">
          <h3 class="text-h6">{{ rd.name ?? 'Round' }}</h3>
          <v-chip color="green" size="small" variant="tonal">Open for booking</v-chip>
          <span v-if="rd.startTime" class="text-body-2 text-medium-emphasis">
            {{ new Date(rd.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }}
          </span>
        </div>

        <v-table class="rounded border" density="compact">
          <thead>
            <tr>
              <th class="text-left pa-3 bg-surface-variant" style="min-width:90px">Slot</th>
              <th
                v-for="room in rd.enabledRooms"
                :key="room.id"
                class="text-left pa-3 bg-surface-variant"
                style="min-width:220px"
              >
                {{ room.name }}
                <span class="text-caption text-medium-emphasis d-block">max {{ room.maxCapacity }}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="idx in slotIndicesFor(rd)" :key="idx">
              <td class="pa-3 text-body-2 font-weight-medium text-medium-emphasis">
                #{{ idx + 1 }}
              </td>
              <td
                v-for="room in rd.enabledRooms"
                :key="room.id"
                class="pa-2"
                :class="{ 'bg-primary-lighten-5': isMySlot(slotFor(rd, room.id, idx)) }"
                style="vertical-align: top"
              >
                <template v-if="slotFor(rd, room.id, idx)?.session">
                  <div
                    :class="[
                      'rounded pa-2',
                      isMySlot(slotFor(rd, room.id, idx))
                        ? 'border border-primary'
                        : 'border',
                    ]"
                  >
                    <!-- Session title -->
                    <div class="d-flex align-center ga-2 mb-1 flex-wrap">
                      <v-chip
                        :color="slotFor(rd, room.id, idx)!.session!.type === 'workshop' ? 'orange' : 'teal'"
                        size="x-small"
                        variant="tonal"
                      >
                        {{ slotFor(rd, room.id, idx)!.session!.type }}
                      </v-chip>
                      <span class="text-body-2 font-weight-medium">
                        {{ slotFor(rd, room.id, idx)!.session!.title }}
                      </span>
                    </div>

                    <!-- Capacity row -->
                    <div class="d-flex align-center ga-2 mb-2">
                      <v-icon size="x-small" color="grey">mdi-account-group</v-icon>
                      <span class="text-caption text-medium-emphasis">
                        {{ slotFor(rd, room.id, idx)!.registrations.length }} / {{ room.maxCapacity }}
                      </span>
                      <v-chip
                        v-if="isMySlot(slotFor(rd, room.id, idx))"
                        color="primary"
                        size="x-small"
                        variant="tonal"
                        prepend-icon="mdi-check-circle"
                      >
                        You're booked
                      </v-chip>
                    </div>

                    <!-- Action -->
                    <v-btn
                      v-if="!isMySlot(slotFor(rd, room.id, idx)) && seatsLeft(slotFor(rd, room.id, idx)) > 0"
                      color="primary"
                      size="x-small"
                      variant="flat"
                      :loading="bookingSlotId === slotFor(rd, room.id, idx)!.id"
                      :disabled="bookingSlotId !== null"
                      prepend-icon="mdi-calendar-plus"
                      @click="bookSession(rd.id, slotFor(rd, room.id, idx)!.id)"
                    >
                      Book Session
                    </v-btn>
                    <v-chip
                      v-else-if="!isMySlot(slotFor(rd, room.id, idx)) && seatsLeft(slotFor(rd, room.id, idx)) === 0"
                      color="grey"
                      size="x-small"
                      variant="tonal"
                    >
                      Fully Booked
                    </v-chip>
                  </div>
                </template>
                <span v-else class="text-caption text-disabled pa-2 d-block">—</span>
              </td>
            </tr>
          </tbody>
        </v-table>
      </div>

      <v-divider class="my-6" />
    </template>
    <!-- ── End booking grid ─────────────────────────────────────────────────── -->

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
        <span v-else>No sessions yet.</span>
        <template v-if="!includeDelivered">
          <v-btn variant="text" size="small" @click="includeDelivered = true">Show delivered sessions</v-btn>
        </template>
      </v-alert>

      <v-row v-else>
        <v-col
          v-for="session in filteredSessions"
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
            <v-card-title class="text-body-1 font-weight-bold pb-1 text-wrap">
              {{ session.title }}
            </v-card-title>

            <v-card-subtitle class="pb-1">
              {{ authorName(session) }}
              <span v-if="isMySession(session)" class="text-caption text-primary font-weight-medium ml-1">· My proposal</span>
            </v-card-subtitle>

            <v-card-text class="pb-1">
              <div class="d-flex align-center flex-wrap ga-2 mb-2">
                <v-chip :color="statusColors[session.status]" size="x-small">
                  {{ session.status }}
                </v-chip>
                <v-chip
                  :color="session.type === 'workshop' ? 'orange' : 'teal'"
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
              <p
                v-if="session.description"
                class="text-body-2 text-medium-emphasis mb-2"
                style="display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;"
              >
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

            <v-card-actions>
              <!-- Star button: only for published/scheduled sessions -->
              <v-btn
                v-if="session.status === 'published' || session.status === 'scheduled'"
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

              <!-- Edit button: only for own proposed sessions -->
              <v-btn
                v-if="isMySession(session) && session.status === 'proposed'"
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
  </v-container>
</template>
