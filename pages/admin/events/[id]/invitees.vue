<script setup lang="ts">
definePageMeta({ middleware: 'admin' })

const route = useRoute()
const eventId = route.params.id as string

interface Invitation {
  id: string
  token: string
  expiresAt: string
  usedAt: string | null
  createdAt: string
}

type InviteeRole = 'participant' | 'moderator' | 'staff'

interface Invitee {
  id: string
  eventId: string
  firstName: string
  lastName: string
  email: string
  role: InviteeRole
  createdAt: string
  invitations: Invitation[]
}

const roleOptions: { title: string; value: InviteeRole }[] = [
  { title: 'Participant', value: 'participant' },
  { title: 'Moderator', value: 'moderator' },
  { title: 'Staff', value: 'staff' },
]

const roleColors: Record<InviteeRole, string> = {
  participant: 'blue',
  moderator: 'purple',
  staff: 'teal',
}

interface Event {
  id: string
  name: string
  description: string
  date: string
}

const { data: event } = useAsyncData(`event-${eventId}`, () => $fetch<Event>(`/api/events/${eventId}`))
const { data: invitees, status, refresh } = useAsyncData(`invitees-${eventId}`, () => $fetch<Invitee[]>(`/api/events/${eventId}/invitees`))

useHead({ title: () => `Invitees - ${event.value?.name ?? 'Loading...'}` })

const headers = [
  { title: 'First Name', key: 'firstName' },
  { title: 'Last Name', key: 'lastName' },
  { title: 'Email', key: 'email' },
  { title: 'Role', key: 'role', sortable: true },
  { title: 'Invitation Status', key: 'status', sortable: false },
  { title: 'Actions', key: 'actions', sortable: false },
]

function getInvitationStatus(invitee: Invitee): { label: string; color: string } {
  if (!invitee.invitations || invitee.invitations.length === 0) {
    return { label: 'Not invited', color: 'grey' }
  }

  const hasAccepted = invitee.invitations.some(inv => inv.usedAt)
  if (hasAccepted) {
    return { label: 'Accepted', color: 'green' }
  }

  const now = new Date()
  const hasPending = invitee.invitations.some(
    inv => !inv.usedAt && new Date(inv.expiresAt) > now,
  )
  if (hasPending) {
    return { label: 'Pending', color: 'orange' }
  }

  return { label: 'Expired', color: 'red' }
}

// Dialog state
const dialog = ref(false)
const editingInvitee = ref<Invitee | null>(null)
const form = ref({ firstName: '', lastName: '', email: '', role: 'participant' as InviteeRole, registerParticipant: false, defaultPassword: 'EurocatsBBVA2026' })
const formValid = ref(false)
const saving = ref(false)

const rules = {
  required: [(v: string) => !!v || 'Required'],
  email: [
    (v: string) => !!v || 'Required',
    (v: string) => /.+@.+\..+/.test(v) || 'Must be a valid email',
  ],
}

function openAddDialog() {
  editingInvitee.value = null
  form.value = { firstName: '', lastName: '', email: '', role: 'participant', registerParticipant: false, defaultPassword: 'EurocatsBBVA2026' }
  dialog.value = true
}

function openEditDialog(invitee: Invitee) {
  editingInvitee.value = invitee
  form.value = {
    firstName: invitee.firstName,
    lastName: invitee.lastName,
    email: invitee.email,
    role: invitee.role,
    registerParticipant: false,
    defaultPassword: 'EurocatsBBVA2026',
  }
  dialog.value = true
}

// Snackbar
const snackbar = ref(false)
const snackbarText = ref('')
const snackbarColor = ref('success')

function showSnackbar(text: string, color = 'success') {
  snackbarText.value = text
  snackbarColor.value = color
  snackbar.value = true
}

async function saveInvitee() {
  if (!formValid.value) return
  saving.value = true
  try {
    if (editingInvitee.value) {
      await $fetch(`/api/events/${eventId}/invitees/${editingInvitee.value.id}`, {
        method: 'PUT',
        body: { firstName: form.value.firstName, lastName: form.value.lastName, email: form.value.email, role: form.value.role },
      })
      showSnackbar('Invitee updated successfully')
    }
    else {
      const body: Record<string, unknown> = {
        firstName: form.value.firstName,
        lastName: form.value.lastName,
        email: form.value.email,
        role: form.value.role,
      }
      if (form.value.registerParticipant) {
        body.registerParticipant = true
        body.defaultPassword = form.value.defaultPassword
      }
      await $fetch(`/api/events/${eventId}/invitees`, { method: 'POST', body })
      showSnackbar('Invitee added successfully')
    }
    dialog.value = false
    await refresh()
  }
  catch (err: unknown) {
    const message = (err as { data?: { message?: string } })?.data?.message || 'Failed to save invitee'
    showSnackbar(message, 'error')
  }
  finally {
    saving.value = false
  }
}

// Send invitation
const sendingInvitation = ref<string | null>(null)

async function sendInvitation(invitee: Invitee) {
  sendingInvitation.value = invitee.id
  try {
    await $fetch(`/api/events/${eventId}/invitees/${invitee.id}/invite`, { method: 'POST' })
    showSnackbar(`Invitation sent to ${invitee.firstName} ${invitee.lastName}`)
    await refresh()
  }
  catch (err: unknown) {
    const message = (err as { data?: { message?: string } })?.data?.message || 'Failed to send invitation'
    showSnackbar(message, 'error')
  }
  finally {
    sendingInvitation.value = null
  }
}

// Invite all
const invitingAll = ref(false)

async function inviteAll() {
  invitingAll.value = true
  try {
    await $fetch(`/api/events/${eventId}/invitees/invite-all`, { method: 'POST' })
    showSnackbar('Invitations sent to all uninvited invitees')
    await refresh()
  }
  catch (err: unknown) {
    const message = (err as { data?: { message?: string } })?.data?.message || 'Failed to send invitations'
    showSnackbar(message, 'error')
  }
  finally {
    invitingAll.value = false
  }
}

// Import dialog
const importDialog = ref(false)
const importPasteText = ref('')
const importRegister = ref(false)
const importPassword = ref('EurocatsBBVA2026')
const importRole = ref<InviteeRole>('participant')
const importing = ref(false)

interface ParsedRow {
  fullName: string
  firstName: string
  lastName: string
  email: string
  valid: boolean
  error?: string
}

function splitName(fullName: string): { firstName: string; lastName: string } {
  const trimmed = fullName.trim().replace(/\s+/g, ' ')
  const spaceIdx = trimmed.indexOf(' ')
  if (spaceIdx === -1) return { firstName: '', lastName: trimmed }
  return { firstName: trimmed.slice(0, spaceIdx), lastName: trimmed.slice(spaceIdx + 1) }
}

const parsedImportRows = computed<ParsedRow[]>(() => {
  if (!importPasteText.value.trim()) return []
  const lines = importPasteText.value.split('\n').map(l => l.trim()).filter(Boolean)
  const seen = new Set<string>()
  return lines.map((line) => {
    const parts = line.split('\t')
    const fullName = (parts[0] ?? '').trim()
    const email = (parts[1] ?? '').trim().toLowerCase()

    if (!fullName) return { fullName, firstName: '', lastName: '', email, valid: false, error: 'Missing name' }
    if (!email) return { fullName, firstName: '', lastName: '', email, valid: false, error: 'Missing email' }
    if (!/.+@.+\..+/.test(email)) return { fullName, firstName: '', lastName: '', email, valid: false, error: 'Invalid email' }
    if (seen.has(email)) return { fullName, firstName: '', lastName: '', email, valid: false, error: 'Duplicate email' }
    seen.add(email)

    const { firstName, lastName } = splitName(fullName)
    if (!lastName) return { fullName, firstName, lastName, email, valid: false, error: 'Cannot parse name' }

    return { fullName, firstName, lastName, email, valid: true }
  })
})

const validImportRows = computed(() => parsedImportRows.value.filter(r => r.valid))
const canImport = computed(() =>
  validImportRows.value.length > 0
  && (!importRegister.value || importPassword.value.length >= 8),
)

function openImportDialog() {
  importPasteText.value = ''
  importRegister.value = false
  importPassword.value = 'EurocatsBBVA2026'
  importRole.value = 'participant'
  importDialog.value = true
}

async function submitImport() {
  if (!canImport.value) return
  importing.value = true
  try {
    const result = await $fetch<{ imported: number; skipped: number; registered: number }>(
      `/api/events/${eventId}/invitees/import`,
      {
        method: 'POST',
        body: {
          participants: validImportRows.value.map(r => ({ fullName: r.fullName, email: r.email })),
          role: importRole.value,
          registerParticipants: importRegister.value,
          defaultPassword: importRegister.value ? importPassword.value : undefined,
        },
      },
    )
    const msg = `Imported ${result.imported} participant(s)`
      + (result.skipped > 0 ? `, ${result.skipped} skipped (already exist)` : '')
      + (result.registered > 0 ? `, ${result.registered} registered` : '')
    showSnackbar(msg)
    importDialog.value = false
    await refresh()
  }
  catch (err: unknown) {
    const message = (err as { data?: { message?: string } })?.data?.message || 'Import failed'
    showSnackbar(message, 'error')
  }
  finally {
    importing.value = false
  }
}

// Delete
const deleteDialog = ref(false)
const deletingInvitee = ref<Invitee | null>(null)
const deleting = ref(false)

function confirmDelete(invitee: Invitee) {
  deletingInvitee.value = invitee
  deleteDialog.value = true
}

async function deleteInvitee() {
  if (!deletingInvitee.value) return
  deleting.value = true
  try {
    await $fetch(`/api/events/${eventId}/invitees/${deletingInvitee.value.id}`, { method: 'DELETE' })
    showSnackbar('Invitee deleted successfully')
    deleteDialog.value = false
    await refresh()
  }
  catch (err: unknown) {
    const message = (err as { data?: { message?: string } })?.data?.message || 'Failed to delete invitee'
    showSnackbar(message, 'error')
  }
  finally {
    deleting.value = false
  }
}
</script>

<template>
  <v-container>
    <AdminEventNav />

    <div class="d-flex align-center justify-space-between mb-4">
      <h2 class="text-h6">Invitees</h2>

      <div class="d-flex ga-2">
        <v-btn
          color="secondary"
          prepend-icon="mdi-send-all"
          :loading="invitingAll"
          @click="inviteAll"
        >
          Invite All
        </v-btn>
        <v-btn
          color="teal"
          prepend-icon="mdi-table-arrow-right"
          @click="openImportDialog"
        >
          Import
        </v-btn>
        <v-btn
          color="primary"
          prepend-icon="mdi-plus"
          @click="openAddDialog"
        >
          Add Invitee
        </v-btn>
      </div>
    </div>

    <div v-if="status === 'pending'" class="d-flex flex-column align-center pa-8">
      <v-progress-circular indeterminate color="primary" size="48" class="mb-4" />
      <p class="text-body-1 text-grey">
        Loading invitees…
      </p>
    </div>

    <v-alert v-else-if="status === 'error'" type="error" variant="tonal" class="mb-4">
      Failed to load invitees. Please try again.
    </v-alert>

    <v-data-table
      v-else
      :headers="headers"
      :items="invitees ?? []"
      items-per-page="25"
      class="elevation-1"
    >
      <template #[`item.role`]="{ item }">
        <v-chip
          :color="roleColors[item.role]"
          size="small"
        >
          {{ item.role }}
        </v-chip>
      </template>

      <template #[`item.status`]="{ item }">
        <v-chip
          :color="getInvitationStatus(item).color"
          size="small"
        >
          {{ getInvitationStatus(item).label }}
        </v-chip>
      </template>

      <template #[`item.actions`]="{ item }">
        <v-btn
          icon="mdi-pencil"
          variant="text"
          size="small"
          @click="openEditDialog(item)"
        />
        <v-btn
          v-if="getInvitationStatus(item).label !== 'Accepted'"
          icon="mdi-email-fast"
          variant="text"
          size="small"
          color="primary"
          :loading="sendingInvitation === item.id"
          @click="sendInvitation(item)"
        />
        <v-btn
          icon="mdi-delete"
          variant="text"
          size="small"
          color="error"
          @click="confirmDelete(item)"
        />
      </template>
    </v-data-table>

    <!-- Add / Edit Dialog -->
    <v-dialog v-model="dialog" max-width="500">
      <v-card>
        <v-card-title>
          {{ editingInvitee ? 'Edit Invitee' : 'Add Invitee' }}
        </v-card-title>
        <v-card-text>
          <v-form v-model="formValid" @submit.prevent="saveInvitee">
            <v-text-field
              v-model="form.firstName"
              label="First Name"
              :rules="rules.required"
              class="mb-2"
            />
            <v-text-field
              v-model="form.lastName"
              label="Last Name"
              :rules="rules.required"
              class="mb-2"
            />
            <v-text-field
              v-model="form.email"
              label="Email"
              type="email"
              :rules="rules.email"
              class="mb-2"
            />
            <v-select
              v-model="form.role"
              label="Role"
              :items="roleOptions"
              item-title="title"
              item-value="value"
            />

            <template v-if="!editingInvitee">
              <v-switch
                v-model="form.registerParticipant"
                label="Register participant immediately (create account with default password)"
                color="primary"
                class="mt-2 mb-1"
              />
              <v-text-field
                v-if="form.registerParticipant"
                v-model="form.defaultPassword"
                label="Default Password"
                :rules="[(v: string) => v.length >= 8 || 'Password must be at least 8 characters']"
                class="mb-2"
              />
            </template>
          </v-form>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="dialog = false">
            Cancel
          </v-btn>
          <v-btn
            color="primary"
            :loading="saving"
            :disabled="!formValid"
            @click="saveInvitee"
          >
            Save
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Delete Confirmation Dialog -->
    <v-dialog v-model="deleteDialog" max-width="400">
      <v-card>
        <v-card-title>Confirm Deletion</v-card-title>
        <v-card-text>
          Are you sure you want to delete
          <strong>{{ deletingInvitee?.firstName }} {{ deletingInvitee?.lastName }}</strong>?
          This action cannot be undone.
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="deleteDialog = false">
            Cancel
          </v-btn>
          <v-btn
            color="error"
            :loading="deleting"
            @click="deleteInvitee"
          >
            Delete
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Import Dialog -->
    <v-dialog v-model="importDialog" max-width="800">
      <v-card>
        <v-card-title>Import Participants</v-card-title>
        <v-card-text>
          <p class="text-body-2 mb-3">
            Paste two columns copied from Excel: <strong>Full Name</strong> (tab) <strong>Email</strong> — one row per line.
          </p>
          <v-textarea
            v-model="importPasteText"
            label="Paste Excel data here"
            placeholder="John Doe	john@example.com
Jane Smith	jane@example.com"
            rows="6"
            variant="outlined"
            class="mb-3"
          />

          <div v-if="parsedImportRows.length > 0" class="mb-4">
            <p class="text-subtitle-2 mb-2">
              Preview — {{ validImportRows.length }} valid / {{ parsedImportRows.length - validImportRows.length }} invalid
            </p>
            <v-table density="compact" class="border rounded">
              <thead>
                <tr>
                  <th>First Name</th>
                  <th>Last Name</th>
                  <th>Email</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="(row, i) in parsedImportRows"
                  :key="i"
                  :class="row.valid ? '' : 'bg-red-lighten-5'"
                >
                  <td>{{ row.firstName }}</td>
                  <td>{{ row.lastName }}</td>
                  <td>{{ row.email }}</td>
                  <td>
                    <v-chip v-if="row.valid" color="green" size="x-small">OK</v-chip>
                    <v-chip v-else color="error" size="x-small" :title="row.error">{{ row.error }}</v-chip>
                  </td>
                </tr>
              </tbody>
            </v-table>
          </div>

          <v-select
            v-model="importRole"
            :items="roleOptions"
            item-title="title"
            item-value="value"
            label="Role"
            class="mb-3"
          />

          <v-switch
            v-model="importRegister"
            label="Register participants immediately (create accounts with default password)"
            color="primary"
            class="mb-2"
          />

          <v-text-field
            v-if="importRegister"
            v-model="importPassword"
            label="Default Password"
            :rules="[(v: string) => v.length >= 8 || 'Password must be at least 8 characters']"
            class="mb-2"
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="importDialog = false">
            Cancel
          </v-btn>
          <v-btn
            color="teal"
            :loading="importing"
            :disabled="!canImport"
            @click="submitImport"
          >
            Import {{ validImportRows.length > 0 ? `(${validImportRows.length})` : '' }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Snackbar -->
    <v-snackbar v-model="snackbar" :color="snackbarColor" :timeout="3000">
      {{ snackbarText }}
    </v-snackbar>
  </v-container>
</template>
