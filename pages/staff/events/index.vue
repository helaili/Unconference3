<script setup lang="ts">
definePageMeta({ middleware: 'staff' })
useHead({ title: 'Staff - My Events' })

interface EventItem {
  id: string
  name: string
  description: string | null
  date: string | null
  createdAt: string
  updatedAt: string
}

const headers = [
  { title: 'Name', key: 'name' },
  { title: 'Description', key: 'description' },
  { title: 'Date', key: 'date' },
  { title: 'Actions', key: 'actions', sortable: false },
]

const { data: events, status, error } = useFetch<EventItem[]>('/api/staff/events', { lazy: false })

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
</script>

<template>
  <div>
    <h1 class="text-h4 mb-4">My Staff Events</h1>

    <v-progress-linear v-if="status === 'pending'" indeterminate color="primary" class="mb-4" />

    <v-alert v-if="status === 'error'" type="error" variant="tonal" class="mb-4">
      {{ error?.message || 'Failed to load events.' }}
    </v-alert>

    <v-alert v-else-if="events && events.length === 0" type="info" variant="tonal" class="mb-4">
      You are not assigned as staff to any events.
    </v-alert>

    <v-data-table
      v-if="events && events.length > 0"
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
        <v-btn
          icon
          size="small"
          variant="text"
          color="secondary"
          :to="`/staff/events/${item.id}/invitees`"
        >
          <v-icon>mdi-account-multiple</v-icon>
          <v-tooltip activator="parent" location="top">Manage Invitees</v-tooltip>
        </v-btn>
      </template>
    </v-data-table>
  </div>
</template>
