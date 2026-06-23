<script setup lang="ts">
const { loggedIn } = useUserSession();

await navigateTo(loggedIn.value ? "/stats" : "/login", { replace: true });
</script>

<template>
  <div />
</template>
