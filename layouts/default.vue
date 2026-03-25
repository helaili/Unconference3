<script setup lang="ts">
const { loggedIn, user, clear } = useUserSession()
const { authMode } = useRuntimeConfig().public

const { data: adminCheck } = useFetch('/api/admin/check', {
  immediate: loggedIn.value,
  watch: [loggedIn],
})

const isAdmin = computed(() => adminCheck.value?.isAdmin ?? false)

const { data: staffCheck } = useFetch('/api/staff/check', {
  immediate: loggedIn.value,
  watch: [loggedIn],
})

const isStaff = computed(() => staffCheck.value?.isStaff ?? false)

const displayName = computed(() => {
  if (!user.value) return ''
  if (user.value.login) return user.value.login
  return [user.value.firstName, user.value.lastName].filter(Boolean).join(' ') || user.value.email || ''
})

const logout = async () => {
  await clear()
  navigateTo(authMode === 'local' ? '/login' : '/')
}
</script>

<template>
  <v-app>
    <v-app-bar>
      <v-app-bar-title>Unconference</v-app-bar-title>
      <v-spacer />

      <template v-if="loggedIn">
        <v-menu v-if="isAdmin">
          <template #activator="{ props }">
            <v-btn v-bind="props" variant="text" class="mr-2">
              <v-icon start>mdi-cog</v-icon>
              Admin
            </v-btn>
          </template>
          <v-list>
            <v-list-item to="/admin/events" prepend-icon="mdi-calendar">
              <v-list-item-title>Events</v-list-item-title>
            </v-list-item>
            <v-list-item to="/admin/users" prepend-icon="mdi-account-group">
              <v-list-item-title>Users</v-list-item-title>
            </v-list-item>
          </v-list>
        </v-menu>
        <v-btn v-if="isStaff && !isAdmin" variant="text" to="/staff/events" class="mr-2">
          <v-icon start>mdi-account-star</v-icon>
          Staff
        </v-btn>
        <v-avatar v-if="user?.avatarUrl" size="32" class="mr-2">
          <v-img :src="user.avatarUrl" :alt="displayName" />
        </v-avatar>
        <v-avatar v-else size="32" color="primary" class="mr-2">
          <span class="text-body-2 text-white">{{ (user?.firstName?.[0] || user?.email?.[0] || '?').toUpperCase() }}</span>
        </v-avatar>
        <span class="mr-4">{{ displayName }}</span>
        <v-btn variant="outlined" @click="logout">
          <v-icon start>mdi-logout</v-icon>
          Logout
        </v-btn>
      </template>
    </v-app-bar>

    <v-main>
      <v-container fluid class="pa-2 pa-md-4">
        <slot />
      </v-container>
    </v-main>
  </v-app>
</template>
