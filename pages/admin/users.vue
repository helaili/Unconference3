<script setup lang="ts">
definePageMeta({ middleware: 'admin' })
useHead({ title: 'Manage Users' })

interface UserItem {
  id: string
  firstName: string | null
  lastName: string | null
  email: string | null
  login: string | null
  avatarUrl: string | null
  createdAt: string
  updatedAt: string
}

const headers = [
  { title: 'First Name', key: 'firstName' },
  { title: 'Last Name', key: 'lastName' },
  { title: 'Email', key: 'email' },
  { title: 'Login', key: 'login' },
  { title: 'Created At', key: 'createdAt' },
  { title: 'Actions', key: 'actions', sortable: false },
]

const { data: users, status, error, refresh } = useFetch<UserItem[]>('/api/users', { lazy: false })

const dialog = ref(false)
const deleteDialog = ref(false)
const saving = ref(false)
const actionError = ref('')
const editingUser = ref<UserItem | null>(null)
const deletingUser = ref<UserItem | null>(null)
const formValid = ref(false)
const snackbar = ref(false)
const snackbarText = ref('')
const snackbarColor = ref('success')

const createForm = ref({
  firstName: '',
  lastName: '',
  email: '',
  password: '',
  passwordConfirm: '',
})

const editForm = ref({
  firstName: '',
  lastName: '',
  email: '',
})

const rules = {
  required: (v: string) => !!v.trim() || 'This field is required',
  email: (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) || 'Must be a valid email address',
  minLength: (v: string) => v.length >= 8 || 'Password must be at least 8 characters',
  passwordMatch: () => createForm.value.password === createForm.value.passwordConfirm || 'Passwords must match',
}

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

function displayValue(value: string | null): string {
  return value ?? '—'
}

function openCreate() {
  editingUser.value = null
  createForm.value = { firstName: '', lastName: '', email: '', password: '', passwordConfirm: '' }
  actionError.value = ''
  formValid.value = false
  dialog.value = true
}

function openEdit(user: UserItem) {
  editingUser.value = user
  editForm.value = {
    firstName: user.firstName ?? '',
    lastName: user.lastName ?? '',
    email: user.email ?? '',
  }
  actionError.value = ''
  formValid.value = false
  dialog.value = true
}

function openDelete(user: UserItem) {
  deletingUser.value = user
  actionError.value = ''
  deleteDialog.value = true
}

function showSnackbar(text: string, color = 'success') {
  snackbarText.value = text
  snackbarColor.value = color
  snackbar.value = true
}

async function save() {
  if (!formValid.value) return

  saving.value = true
  actionError.value = ''

  try {
    if (editingUser.value) {
      const body = {
        firstName: editForm.value.firstName.trim(),
        lastName: editForm.value.lastName.trim(),
        email: editForm.value.email.trim(),
      }
      await $fetch(`/api/users/${editingUser.value.id}`, { method: 'PUT', body })
      showSnackbar('User updated successfully')
    } else {
      const body = {
        firstName: createForm.value.firstName.trim(),
        lastName: createForm.value.lastName.trim(),
        email: createForm.value.email.trim(),
        password: createForm.value.password,
      }
      await $fetch('/api/users', { method: 'POST', body })
      showSnackbar('User created successfully')
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
  if (!deletingUser.value) return

  saving.value = true
  actionError.value = ''

  try {
    await $fetch(`/api/users/${deletingUser.value.id}`, { method: 'DELETE' })
    deleteDialog.value = false
    showSnackbar('User deleted successfully')
    await refresh()
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to delete user'
    actionError.value = message
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div>
    <div class="d-flex align-center justify-space-between mb-4">
      <h1 class="text-h4">Manage Users</h1>
      <v-btn color="primary" prepend-icon="mdi-plus" @click="openCreate">
        Create User
      </v-btn>
    </div>

    <v-progress-linear v-if="status === 'pending'" indeterminate color="primary" class="mb-4" />

    <v-alert v-if="status === 'error'" type="error" variant="tonal" class="mb-4">
      {{ error?.message || 'Failed to load users.' }}
    </v-alert>

    <v-data-table
      v-if="users"
      :headers="headers"
      :items="users"
      :items-per-page="25"
      class="elevation-1"
    >
      <template #[`item.firstName`]="{ item }">
        {{ displayValue(item.firstName) }}
      </template>

      <template #[`item.lastName`]="{ item }">
        {{ displayValue(item.lastName) }}
      </template>

      <template #[`item.email`]="{ item }">
        {{ displayValue(item.email) }}
      </template>

      <template #[`item.login`]="{ item }">
        {{ displayValue(item.login) }}
      </template>

      <template #[`item.createdAt`]="{ item }">
        {{ formatDate(item.createdAt) }}
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
        <v-card-title>{{ editingUser ? 'Edit User' : 'Create User' }}</v-card-title>
        <v-card-text>
          <v-alert v-if="actionError" type="error" variant="tonal" class="mb-4" closable @click:close="actionError = ''">
            {{ actionError }}
          </v-alert>

          <!-- Create form (with password fields) -->
          <v-form v-if="!editingUser" v-model="formValid">
            <v-text-field
              v-model="createForm.firstName"
              label="First Name"
              :rules="[rules.required]"
              required
              class="mb-2"
            />
            <v-text-field
              v-model="createForm.lastName"
              label="Last Name"
              :rules="[rules.required]"
              required
              class="mb-2"
            />
            <v-text-field
              v-model="createForm.email"
              label="Email"
              type="email"
              :rules="[rules.required, rules.email]"
              required
              class="mb-2"
            />
            <v-text-field
              v-model="createForm.password"
              label="Password"
              type="password"
              :rules="[rules.required, rules.minLength]"
              required
              class="mb-2"
            />
            <v-text-field
              v-model="createForm.passwordConfirm"
              label="Confirm Password"
              type="password"
              :rules="[rules.required, rules.passwordMatch]"
              required
            />
          </v-form>

          <!-- Edit form (no password fields) -->
          <v-form v-else v-model="formValid">
            <v-text-field
              v-model="editForm.firstName"
              label="First Name"
              :rules="[rules.required]"
              required
              class="mb-2"
            />
            <v-text-field
              v-model="editForm.lastName"
              label="Last Name"
              :rules="[rules.required]"
              required
              class="mb-2"
            />
            <v-text-field
              v-model="editForm.email"
              label="Email"
              type="email"
              :rules="[rules.required, rules.email]"
              required
            />
          </v-form>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" :disabled="saving" @click="dialog = false">Cancel</v-btn>
          <v-btn color="primary" :loading="saving" :disabled="!formValid" @click="save">
            Save
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Delete Confirmation Dialog -->
    <v-dialog v-model="deleteDialog" max-width="450">
      <v-card>
        <v-card-title>Delete User</v-card-title>
        <v-card-text>
          Are you sure you want to delete <strong>{{ deletingUser?.firstName }} {{ deletingUser?.lastName }}</strong>? This action cannot be undone.
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" :disabled="saving" @click="deleteDialog = false">Cancel</v-btn>
          <v-btn color="error" :loading="saving" @click="confirmDelete">Delete</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Snackbar for notifications -->
    <v-snackbar v-model="snackbar" :color="snackbarColor" :timeout="3000">
      {{ snackbarText }}
      <template #actions>
        <v-btn variant="text" @click="snackbar = false">Close</v-btn>
      </template>
    </v-snackbar>
  </div>
</template>
