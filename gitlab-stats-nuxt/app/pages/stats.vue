<script setup lang="ts">
import type { SeriesByAuthor } from "~/composables/useStats";

const { loggedIn, user, clear } = useUserSession();

if (!loggedIn.value) {
  await navigateTo("/login", { replace: true });
}

const {
  data,
  isLoading,
  error,
  hardRefresh,
  range,
  projectId,
  selectedAuthors,
} = useStats();

const fmt = new Intl.NumberFormat("fr-FR");

const rangeOptions = [
  { label: "7 derniers jours", value: "7d" },
  { label: "30 derniers jours", value: "30d" },
  { label: "90 derniers jours", value: "90d" },
  { label: "6 mois", value: "180d" },
  { label: "1 an", value: "365d" },
  { label: "Tout", value: "all" },
];

const projectOptions = computed(() => {
  const opts = [{ label: "Tous les projets", value: "all" }];
  for (const p of data.value?.projects ?? [])
    opts.push({ label: p.name, value: String(p.id) });
  return opts;
});

const authorOptions = computed(() =>
  (data.value?.authors ?? []).map((a) => ({
    label: `${a.name} (${a.commits})`,
    value: a.email,
  })),
);

const palette = [
  "#fb923c",
  "#3b82f6",
  "#22c55e",
  "#a78bfa",
  "#facc15",
  "#ec4899",
  "#2dd4bf",
  "#22d3ee",
  "#ef4444",
  "#94a3b8",
  "#6b7280",
];

const chartTheme = {
  chart: {
    toolbar: { show: false },
    foreColor: "#94a3b8",
    background: "transparent",
  },
  grid: { borderColor: "rgba(148, 163, 184, 0.15)" },
  tooltip: { theme: "dark" },
  legend: {
    show: true,
    position: "bottom",
    labels: { colors: "#cbd5e1" },
    markers: { width: 10, height: 10 },
  },
  dataLabels: { enabled: false },
};

function multiAuthorOptions(
  d: SeriesByAuthor | undefined,
  xLabel: (cat: string) => string = (c) => c,
) {
  const cats = d?.categories ?? [];
  return {
    ...chartTheme,
    chart: { ...chartTheme.chart, type: "bar" as const, stacked: true },
    plotOptions: { bar: { borderRadius: 2, columnWidth: "70%" } },
    colors: palette,
    xaxis: { categories: cats.map(xLabel) },
    yaxis: { labels: { formatter: (v: number) => Math.round(v).toString() } },
  };
}

const byDayChart = computed(() => {
  const d = data.value?.byDayByAuthor;
  return {
    series: d?.series ?? [],
    options: {
      ...multiAuthorOptions(d, (c) => {
        const dt = new Date(c + "T00:00:00Z");
        return dt.toLocaleDateString("fr-FR", {
          day: "2-digit",
          month: "short",
        });
      }),
      chart: { ...chartTheme.chart, type: "bar" as const, stacked: true },
    },
  };
});

const byWeekChart = computed(() => {
  const d = data.value?.byWeekByAuthor;
  return { series: d?.series ?? [], options: multiAuthorOptions(d) };
});

const byMonthChart = computed(() => {
  const d = data.value?.byMonthByAuthor;
  return { series: d?.series ?? [], options: multiAuthorOptions(d) };
});

const byHourChart = computed(() => {
  const d = data.value?.byHourByAuthor;
  return {
    series: d?.series ?? [],
    options: multiAuthorOptions(d, (c) => `${c}h`),
  };
});

const byDowChart = computed(() => {
  const d = data.value?.byDowByAuthor;
  return { series: d?.series ?? [], options: multiAuthorOptions(d) };
});

const byProjectChart = computed(() => {
  const p = (data.value?.byProject ?? []).slice(0, 15);
  return {
    series: [{ name: "Commits", data: p.map((x) => x.commits) }],
    options: {
      ...chartTheme,
      chart: { ...chartTheme.chart, type: "bar" as const },
      legend: { show: false },
      plotOptions: { bar: { borderRadius: 4, horizontal: true } },
      colors: ["#a78bfa"],
      xaxis: { categories: p.map((x) => x.project) },
    },
  };
});

const byAuthorChart = computed(() => {
  const a = (data.value?.byAuthor ?? []).slice(0, 15);
  return {
    series: [{ name: "Commits", data: a.map((x) => x.commits) }],
    options: {
      ...chartTheme,
      chart: { ...chartTheme.chart, type: "bar" as const },
      legend: { show: false },
      plotOptions: { bar: { borderRadius: 4, horizontal: true } },
      colors: ["#2dd4bf"],
      xaxis: { categories: a.map((x) => x.name || x.email) },
    },
  };
});

const linesChart = computed(() => {
  const m = data.value?.byMonth ?? [];
  return {
    series: [
      { name: "Ajouts", data: m.map((x) => x.additions) },
      { name: "Suppressions", data: m.map((x) => -x.deletions) },
    ],
    options: {
      ...chartTheme,
      chart: { ...chartTheme.chart, type: "bar" as const, stacked: true },
      plotOptions: { bar: { borderRadius: 4, columnWidth: "60%" } },
      colors: ["#22c55e", "#ef4444"],
      xaxis: { categories: m.map((x) => x.month) },
      yaxis: { labels: { formatter: (v: number) => Math.abs(v).toString() } },
    },
  };
});

const byTypeChart = computed(() => {
  const t = data.value?.byType ?? [];
  return {
    series: t.map((x) => x.commits),
    options: {
      ...chartTheme,
      chart: { ...chartTheme.chart, type: "donut" as const },
      labels: t.map((x) => x.type),
      colors: palette,
      legend: { ...chartTheme.legend, position: "right" as const },
    },
  };
});

const tableRows = computed(() =>
  (data.value?.commits ?? []).slice(0, 100).map((c) => ({
    ...c,
    dateLabel: new Date(c.date).toLocaleDateString("fr-FR"),
  })),
);

const typeBadgeColor: Record<
  string,
  "primary" | "success" | "warning" | "error" | "info" | "neutral"
> = {
  feat: "info",
  fix: "error",
  refactor: "primary",
  docs: "success",
  chore: "neutral",
  test: "warning",
  ci: "warning",
  build: "neutral",
  perf: "success",
  style: "primary",
  other: "neutral",
};

async function logout() {
  data.value = null;
  await clear();
  await navigateTo("/oauth/logout", { external: true });
}

const meta = computed(() => {
  if (!data.value) return "";
  const since = new Date(data.value.since).toLocaleDateString("fr-FR");
  const gen = new Date(data.value.generatedAt).toLocaleString("fr-FR");
  return `Depuis ${since} · généré ${gen}`;
});

const rangeLabelFor = (v: string) =>
  rangeOptions.find((o) => o.value === v)?.label ?? v;
const periodLabel = computed(() => rangeLabelFor(range.value).toUpperCase());

const tableHeader = computed(() => {
  const total = data.value?.commits.length ?? 0;
  const shown = Math.min(total, 100);
  const label = `DERNIERS COMMITS · ${periodLabel.value}`;
  if (total > 100) return `${label} · ${shown} / ${total} affichés`;
  return total > 0 ? `${label} · ${total}` : label;
});
</script>

<template>
  <div class="min-h-screen bg-(--ui-bg)">
    <header class="border-b border-(--ui-border) bg-(--ui-bg-elevated)">
      <div
        class="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-4"
      >
        <div>
          <h1 class="text-xl font-semibold">GitLab Stats</h1>
          <p class="text-xs text-(--ui-text-muted)">
            Activité de développement
          </p>
        </div>
        <div class="flex items-center gap-3">
          <span v-if="user" class="text-sm text-(--ui-text-muted)">{{
            user.name
          }}</span>
          <UButton
            color="neutral"
            variant="outline"
            size="sm"
            icon="i-lucide-refresh-cw"
            :loading="isLoading"
            class="cursor-pointer"
            @click="hardRefresh"
          >
            Rafraîchir
          </UButton>
          <UButton
            color="neutral"
            variant="ghost"
            size="sm"
            icon="i-lucide-log-out"
            class="cursor-pointer"
            @click="logout"
          >
            Déconnexion
          </UButton>
        </div>
      </div>
      <UProgress v-if="isLoading" size="sm" animation="carousel" />
    </header>

    <main class="mx-auto max-w-7xl space-y-6 px-6 py-6">
      <UCard>
        <div class="flex flex-wrap items-end gap-4">
          <UFormField label="Période">
            <USelect
              v-model="range"
              :items="rangeOptions"
              :disabled="isLoading"
              class="w-48"
            />
          </UFormField>
          <UFormField label="Projet">
            <USelect
              v-model="projectId"
              :items="projectOptions"
              :disabled="isLoading"
              class="w-64"
            />
          </UFormField>
          <UFormField label="Développeurs (vide = tous)">
            <USelectMenu
              v-model="selectedAuthors"
              :items="authorOptions"
              :disabled="isLoading"
              multiple
              value-key="value"
              placeholder="Tous les développeurs"
              class="w-80"
            />
          </UFormField>
          <span class="ml-auto text-xs text-(--ui-text-muted)">
            <template v-if="isLoading">Chargement en cours…</template>
            <template v-else>{{ meta }}</template>
          </span>
        </div>
      </UCard>

      <UAlert
        v-if="error"
        color="error"
        :title="'Erreur de chargement'"
        :description="error"
      />

      <section class="grid gap-4 sm:grid-cols-2 lg:grid-cols-7">
        <UCard>
          <div class="text-xs uppercase tracking-wide text-(--ui-text-muted)">
            Projets
          </div>
          <USkeleton v-if="isLoading" class="mt-2 h-9 w-20" />
          <div v-else class="mt-2 text-3xl font-semibold">
            {{ fmt.format(data?.totals.projects ?? 0) }}
          </div>
        </UCard>
        <UCard>
          <div class="text-xs uppercase tracking-wide text-(--ui-text-muted)">
            Commits
          </div>
          <USkeleton v-if="isLoading" class="mt-2 h-9 w-20" />
          <div v-else class="mt-2 text-3xl font-semibold">
            {{ fmt.format(data?.totals.commits ?? 0) }}
          </div>
        </UCard>
        <UCard>
          <div class="text-xs uppercase tracking-wide text-(--ui-text-muted)">
            Jours actifs
          </div>
          <USkeleton v-if="isLoading" class="mt-2 h-9 w-20" />
          <div v-else class="mt-2 text-3xl font-semibold">
            {{ fmt.format(data?.totals.activeDays ?? 0) }}
          </div>
        </UCard>
        <UCard>
          <div class="text-xs uppercase tracking-wide text-(--ui-text-muted)">
            Moy / jour actif
          </div>
          <USkeleton v-if="isLoading" class="mt-2 h-9 w-20" />
          <div v-else class="mt-2 text-3xl font-semibold">
            {{ data?.totals.avgCommitsPerActiveDay ?? 0 }}
          </div>
        </UCard>
        <UCard>
          <div class="text-xs uppercase tracking-wide text-(--ui-text-muted)">
            Lignes ajoutées
          </div>
          <USkeleton v-if="isLoading" class="mt-2 h-9 w-20" />
          <div
            v-else
            class="mt-2 text-3xl font-semibold text-(--ui-color-success-500)"
          >
            +{{ fmt.format(data?.totals.additions ?? 0) }}
          </div>
        </UCard>
        <UCard>
          <div class="text-xs uppercase tracking-wide text-(--ui-text-muted)">
            Lignes supprimées
          </div>
          <USkeleton v-if="isLoading" class="mt-2 h-9 w-20" />
          <div
            v-else
            class="mt-2 text-3xl font-semibold text-(--ui-color-error-500)"
          >
            −{{ fmt.format(data?.totals.deletions ?? 0) }}
          </div>
        </UCard>
        <UCard>
          <div class="text-xs uppercase tracking-wide text-(--ui-text-muted)">
            Lignes modifiées
          </div>
          <USkeleton v-if="isLoading" class="mt-2 h-9 w-20" />
          <div v-else class="mt-2 text-3xl font-semibold">
            {{ fmt.format(data?.totals.changedLines ?? 0) }}
          </div>
        </UCard>
      </section>

      <section class="grid gap-4 lg:grid-cols-2">
        <UCard>
          <template #header
            ><h2 class="text-sm font-medium text-(--ui-text-muted)">
              COMMITS PAR JOUR (PAR DEV)
            </h2></template
          >
          <USkeleton v-if="isLoading" class="h-[300px] w-full" />
          <StatsChart
            v-else
            :height="300"
            type="bar"
            :series="byDayChart.series"
            :options="byDayChart.options"
          />
        </UCard>
        <UCard>
          <template #header
            ><h2 class="text-sm font-medium text-(--ui-text-muted)">
              COMMITS PAR SEMAINE (PAR DEV)
            </h2></template
          >
          <USkeleton v-if="isLoading" class="h-[300px] w-full" />
          <StatsChart
            v-else
            :height="300"
            type="bar"
            :series="byWeekChart.series"
            :options="byWeekChart.options"
          />
        </UCard>
        <UCard>
          <template #header
            ><h2 class="text-sm font-medium text-(--ui-text-muted)">
              COMMITS PAR MOIS (PAR DEV)
            </h2></template
          >
          <USkeleton v-if="isLoading" class="h-[300px] w-full" />
          <StatsChart
            v-else
            :height="300"
            type="bar"
            :series="byMonthChart.series"
            :options="byMonthChart.options"
          />
        </UCard>
        <UCard>
          <template #header
            ><h2 class="text-sm font-medium text-(--ui-text-muted)">
              COMMITS PAR HEURE UTC (PAR DEV)
            </h2></template
          >
          <USkeleton v-if="isLoading" class="h-[300px] w-full" />
          <StatsChart
            v-else
            :height="300"
            type="bar"
            :series="byHourChart.series"
            :options="byHourChart.options"
          />
        </UCard>
        <UCard>
          <template #header
            ><h2 class="text-sm font-medium text-(--ui-text-muted)">
              COMMITS PAR JOUR DE LA SEMAINE (PAR DEV)
            </h2></template
          >
          <USkeleton v-if="isLoading" class="h-[300px] w-full" />
          <StatsChart
            v-else
            :height="300"
            type="bar"
            :series="byDowChart.series"
            :options="byDowChart.options"
          />
        </UCard>
        <UCard>
          <template #header
            ><h2 class="text-sm font-medium text-(--ui-text-muted)">
              TYPES DE COMMITS
            </h2></template
          >
          <USkeleton v-if="isLoading" class="h-[300px] w-full" />
          <StatsChart
            v-else
            :height="300"
            type="donut"
            :series="byTypeChart.series"
            :options="byTypeChart.options"
          />
        </UCard>
        <UCard>
          <template #header
            ><h2 class="text-sm font-medium text-(--ui-text-muted)">
              COMMITS PAR PROJET (TOP 15)
            </h2></template
          >
          <USkeleton v-if="isLoading" class="h-[300px] w-full" />
          <StatsChart
            v-else
            :height="300"
            type="bar"
            :series="byProjectChart.series"
            :options="byProjectChart.options"
          />
        </UCard>
        <UCard>
          <template #header
            ><h2 class="text-sm font-medium text-(--ui-text-muted)">
              COMMITS PAR DÉVELOPPEUR (TOP 15)
            </h2></template
          >
          <USkeleton v-if="isLoading" class="h-[300px] w-full" />
          <StatsChart
            v-else
            :height="300"
            type="bar"
            :series="byAuthorChart.series"
            :options="byAuthorChart.options"
          />
        </UCard>
        <UCard class="lg:col-span-2">
          <template #header
            ><h2 class="text-sm font-medium text-(--ui-text-muted)">
              LIGNES AJOUTÉES / SUPPRIMÉES PAR MOIS
            </h2></template
          >
          <USkeleton v-if="isLoading" class="h-[300px] w-full" />
          <StatsChart
            v-else
            :height="300"
            type="bar"
            :series="linesChart.series"
            :options="linesChart.options"
          />
        </UCard>
      </section>

      <UCard>
        <template #header>
          <h2 class="text-sm font-medium text-(--ui-text-muted)">
            {{ tableHeader }}
          </h2>
        </template>
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr
                class="text-left text-xs uppercase tracking-wide text-(--ui-text-muted) border-b border-(--ui-border)"
              >
                <th class="py-2 pr-3">Date</th>
                <th class="py-2 pr-3">Projet</th>
                <th class="py-2 pr-3">Auteur</th>
                <th class="py-2 pr-3">Type</th>
                <th class="py-2 pr-3">Titre</th>
                <th class="py-2 pr-3 text-right">+</th>
                <th class="py-2 pr-3 text-right">−</th>
              </tr>
            </thead>
            <tbody v-if="isLoading">
              <tr v-for="i in 8" :key="i" class="border-b border-(--ui-border)">
                <td class="py-2 pr-3"><USkeleton class="h-4 w-20" /></td>
                <td class="py-2 pr-3"><USkeleton class="h-4 w-40" /></td>
                <td class="py-2 pr-3"><USkeleton class="h-4 w-28" /></td>
                <td class="py-2 pr-3">
                  <USkeleton class="h-5 w-12 rounded-full" />
                </td>
                <td class="py-2 pr-3"><USkeleton class="h-4 w-full" /></td>
                <td class="py-2 pr-3">
                  <USkeleton class="h-4 w-10 ml-auto" />
                </td>
                <td class="py-2 pr-3">
                  <USkeleton class="h-4 w-10 ml-auto" />
                </td>
              </tr>
            </tbody>
            <tbody v-else>
              <tr
                v-for="c in tableRows"
                :key="c.commitId"
                class="border-b border-(--ui-border) hover:bg-(--ui-bg-elevated)"
              >
                <td class="py-2 pr-3 whitespace-nowrap">{{ c.dateLabel }}</td>
                <td class="py-2 pr-3">
                  <a
                    :href="c.projectUrl"
                    target="_blank"
                    rel="noopener"
                    class="cursor-pointer text-(--ui-primary) hover:underline"
                  >
                    {{ c.project }}
                  </a>
                </td>
                <td class="py-2 pr-3">{{ c.authorName }}</td>
                <td class="py-2 pr-3">
                  <UBadge
                    :color="typeBadgeColor[c.type] || 'neutral'"
                    variant="subtle"
                    size="sm"
                    >{{ c.type }}</UBadge
                  >
                </td>
                <td class="py-2 pr-3">
                  <a
                    :href="c.url"
                    target="_blank"
                    rel="noopener"
                    class="cursor-pointer hover:underline hover:text-(--ui-primary)"
                  >
                    {{ c.title }}
                  </a>
                </td>
                <td class="py-2 pr-3 text-right text-(--ui-color-success-500)">
                  +{{ c.additions }}
                </td>
                <td class="py-2 pr-3 text-right text-(--ui-color-error-500)">
                  −{{ c.deletions }}
                </td>
              </tr>
              <tr v-if="!tableRows.length">
                <td colspan="7" class="py-6 text-center text-(--ui-text-muted)">
                  Aucun commit pour ces filtres.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </UCard>
    </main>
  </div>
</template>
