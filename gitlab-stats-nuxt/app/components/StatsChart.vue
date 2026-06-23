<script setup lang="ts">
const props = defineProps<{
  type: "line" | "bar" | "donut" | "area";
  series: unknown[];
  options: Record<string, unknown>;
  height?: number;
}>();

const height = computed(() => props.height ?? 280);
</script>

<template>
  <ClientOnly>
    <apexchart
      :type="type"
      :series="series"
      :options="options"
      :height="height"
    />
    <template #fallback>
      <div
        class="flex items-center justify-center text-sm text-(--ui-text-muted)"
        :style="{ height: height + 'px' }"
      >
        Chargement du graphique…
      </div>
    </template>
  </ClientOnly>
</template>
