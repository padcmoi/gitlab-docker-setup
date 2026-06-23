<script setup lang="ts">
const { loggedIn } = useUserSession();

if (loggedIn.value) {
  await navigateTo("/stats", { replace: true });
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-(--ui-bg) p-6">
    <UCard class="w-full max-w-md text-center">
      <div class="flex flex-col items-center gap-6 py-6">
        <UIcon
          name="i-lucide-bar-chart-3"
          class="text-5xl text-(--ui-primary)"
        />
        <div>
          <h1 class="text-xl font-semibold">GitLab Stats</h1>
          <p class="mt-2 text-sm text-(--ui-text-muted)">
            Connecte-toi avec ton compte GitLab pour accéder au dashboard.
          </p>
        </div>
        <UButton
          to="/oauth/login"
          external
          icon="i-lucide-log-in"
          color="primary"
          size="lg"
          class="cursor-pointer"
        >
          Se connecter avec GitLab
        </UButton>
      </div>
    </UCard>
  </div>
</template>
