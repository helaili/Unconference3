<script setup lang="ts">
const { loggedIn, user, clear } = useUserSession()

const { data: adminCheck } = useFetch('/api/admin/check', {
  immediate: loggedIn.value,
  watch: [loggedIn],
})

const isAdmin = computed(() => adminCheck.value?.isAdmin ?? false)

const logout = async () => {
  await clear()
  navigateTo('/')
}
</script>

<template>
  <v-app>
    <v-app-bar>
      <v-app-bar-title>Unconference</v-app-bar-title>
      <v-spacer />

      <template v-if="loggedIn">
        <v-btn v-if="isAdmin" variant="text" to="/admin/events" class="mr-2">
          <v-icon start>mdi-cog</v-icon>
          Admin
        </v-btn>
        <v-avatar size="32" class="mr-2">
          <v-img :src="user?.avatarUrl" :alt="user?.login" />
        </v-avatar>
        <span class="mr-4">{{ user?.login }}</span>
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
