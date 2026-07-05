<script setup lang="ts">
definePageMeta({ middleware: 'admin' })
useHead({ title: 'User Profile' })

interface UserEvent {
  id: string
  name: string
}

interface UserProfile {
  id: string
  firstName: string | null
  lastName: string | null
  email: string | null
  login: string | null
  avatarUrl: string | null
  approvedAt: string | null
  createdAt: string
  updatedAt: string
  events: UserEvent[]
}

const route = useRoute()
const userId = computed(() => route.params.id as string)
const approving = ref(false)
const snackbar = ref(false)
const snackbarText = ref('')

const { data: profile, status, error, refresh } = useFetch<UserProfile>(() => `/api/users/${userId.value}`, {
  lazy: false,
})

const fullName = computed(() => {
  if (!profile.value) return ''
  return [profile.value.firstName, profile.value.lastName].filter(Boolean).join(' ') || profile.value.email || profile.value.login || 'User'
})

const isPending = computed(() => !profile.value?.approvedAt)

function formatDate(date: string | null): string {
  if (!date) return 'Pending'
  return new Date(date).toLocaleString()
}

async function approveUser() {
  if (!profile.value || !isPending.value) return

  approving.value = true
  try {
    await $fetch(`/api/users/${profile.value.id}/approve`, { method: 'POST' })
    snackbarText.value = 'User approved successfully'
    snackbar.value = true
    await refresh()
  } finally {
    approving.value = false
  }
}
</script>

<template>
  <div>
    <div class="d-flex align-center justify-space-between mb-4">
      <div>
        <v-btn variant="text" prepend-icon="mdi-arrow-left" to="/admin/users" class="mb-2 px-0">
          Back to Users
        </v-btn>
        <h1 class="text-h4">{{ fullName }}</h1>
      </div>
      <v-btn
        v-if="profile && isPending"
        color="success"
        prepend-icon="mdi-check"
        :loading="approving"
        @click="approveUser"
      >
        Approve User
      </v-btn>
    </div>

    <v-progress-linear v-if="status === 'pending'" indeterminate color="primary" class="mb-4" />

    <v-alert v-else-if="status === 'error'" type="error" variant="tonal" class="mb-4">
      {{ error?.message || 'Failed to load user profile.' }}
    </v-alert>

    <v-card v-else-if="profile">
      <v-card-text class="pa-6">
        <div class="d-flex flex-wrap ga-4 align-center mb-6">
          <v-avatar v-if="profile.avatarUrl" size="72">
            <v-img :src="profile.avatarUrl" :alt="fullName" />
          </v-avatar>
          <v-avatar v-else size="72" color="primary">
            <span class="text-h5 text-white">{{ (profile.firstName?.[0] || profile.email?.[0] || '?').toUpperCase() }}</span>
          </v-avatar>
          <div>
            <div class="text-h5">{{ fullName }}</div>
            <div class="text-body-1 text-medium-emphasis">{{ profile.email || '—' }}</div>
            <v-chip :color="isPending ? 'warning' : 'success'" size="small" variant="tonal" class="mt-2">
              {{ isPending ? 'Pending approval' : 'Approved' }}
            </v-chip>
          </div>
        </div>

        <v-row>
          <v-col cols="12" md="6">
            <div class="text-subtitle-2 text-medium-emphasis mb-1">Login</div>
            <div class="mb-4">{{ profile.login || '—' }}</div>

            <div class="text-subtitle-2 text-medium-emphasis mb-1">Created</div>
            <div class="mb-4">{{ formatDate(profile.createdAt) }}</div>

            <div class="text-subtitle-2 text-medium-emphasis mb-1">Approved</div>
            <div>{{ formatDate(profile.approvedAt) }}</div>
          </v-col>

          <v-col cols="12" md="6">
            <div class="text-subtitle-2 text-medium-emphasis mb-2">Events</div>
            <v-list density="compact" border rounded>
              <v-list-item v-for="event in profile.events" :key="event.id">
                <v-list-item-title>{{ event.name }}</v-list-item-title>
              </v-list-item>
              <v-list-item v-if="profile.events.length === 0">
                <v-list-item-title>No event memberships</v-list-item-title>
              </v-list-item>
            </v-list>
          </v-col>
        </v-row>
      </v-card-text>
    </v-card>

    <v-snackbar v-model="snackbar" color="success" :timeout="3000">
      {{ snackbarText }}
    </v-snackbar>
  </div>
</template>
