<script setup lang="ts">
const { loggedIn, user, clear } = useUserSession()


const logout = async () => {
  await clear()
  navigateTo('/')
}

</script>

<template>
  <v-app>
    <v-app-bar>
      <!-- Sessions Panel Toggle Button -->
      <v-btn
        v-if="loggedIn"
        icon
        variant="text"
        class="ml-2"
      >
        <v-icon>mdi-menu</v-icon>
      </v-btn>
      <v-app-bar-title>Unconference</v-app-bar-title>
      <v-spacer />

      <template v-if="loggedIn">
        <v-avatar size="32" class="mr-2">
          <v-img :src="user?.avatarUrl" :alt="user?.login" />
        </v-avatar>
        <span class="mr-4">{{ user?.login }}</span>
        <v-btn variant="outlined" @click="logout">
          <v-icon start>mdi-logout</v-icon>
          Logout
        </v-btn>
      </template>
      <template v-else>
        <v-btn color="primary" href="/auth/github">
          <v-icon start>mdi-github</v-icon>
          Login with GitHub
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
