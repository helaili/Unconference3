<script setup lang="ts">
const route = useRoute()
const eventId = route.params.id as string

interface EventInfo {
  id: string
  name: string
}

const { data: eventInfo } = useAsyncData(`event-${eventId}`, () =>
  $fetch<EventInfo>(`/api/events/${eventId}`),
)

const tabs = computed(() => [
  { title: 'Sessions', to: `/admin/events/${eventId}/sessions`, icon: 'mdi-message-text-outline' },
  { title: 'Rooms', to: `/admin/events/${eventId}/rooms`, icon: 'mdi-door-open' },
  { title: 'Rounds', to: `/admin/events/${eventId}/rounds`, icon: 'mdi-clock-outline' },
  { title: 'Introduction', to: `/admin/events/${eventId}/introduction`, icon: 'mdi-account-group-outline' },
  { title: 'Invitees', to: `/admin/events/${eventId}/invitees`, icon: 'mdi-account-multiple-outline' },
])
</script>

<template>
  <div class="mb-4">
    <v-btn variant="text" prepend-icon="mdi-arrow-left" to="/admin/events" class="mb-2 px-0">
      Back to Events
    </v-btn>
    <h1 class="text-h5 font-weight-bold mb-2">
      {{ eventInfo?.name ?? '…' }}
    </h1>
    <v-tabs density="compact" color="deep-purple">
      <v-tab v-for="tab in tabs" :key="tab.to" :to="tab.to" :prepend-icon="tab.icon">
        {{ tab.title }}
      </v-tab>
    </v-tabs>
    <v-divider />
  </div>
</template>
