export type Range = "7d" | "30d" | "90d" | "180d" | "365d" | "all";

export type AuthorInfo = { email: string; name: string; commits: number };

export type ProjectInfo = { id: number; name: string; path: string };

export type CommitType =
  | "feat"
  | "fix"
  | "refactor"
  | "chore"
  | "docs"
  | "test"
  | "style"
  | "perf"
  | "ci"
  | "build"
  | "other";

export type CommitRow = {
  projectId: number;
  project: string;
  projectPath: string;
  projectUrl: string;
  commitId: string;
  shortId: string;
  title: string;
  authorName: string;
  authorEmail: string;
  date: string;
  day: string;
  month: string;
  type: CommitType;
  additions: number;
  deletions: number;
  total: number;
  url: string;
  isMerge: boolean;
};

export type AuthorSeries = { email: string; name: string; data: number[] };
export type SeriesByAuthor = { categories: string[]; series: AuthorSeries[] };

export type StatsResponse = {
  generatedAt: string;
  since: string;
  filters: { projectId: number | null; range: string; authors: string[] };
  totals: {
    projects: number;
    commits: number;
    additions: number;
    deletions: number;
    changedLines: number;
    activeDays: number;
    avgCommitsPerActiveDay: number;
  };
  byHour: Array<{ hour: number; commits: number }>;
  byDayOfWeek: Array<{ dow: number; label: string; commits: number }>;
  byDay: Array<{
    day: string;
    commits: number;
    additions: number;
    deletions: number;
  }>;
  byWeek: Array<{
    week: string;
    commits: number;
    additions: number;
    deletions: number;
  }>;
  byMonth: Array<{
    month: string;
    commits: number;
    additions: number;
    deletions: number;
  }>;
  byHourByAuthor: SeriesByAuthor;
  byDowByAuthor: SeriesByAuthor;
  byDayByAuthor: SeriesByAuthor;
  byWeekByAuthor: SeriesByAuthor;
  byMonthByAuthor: SeriesByAuthor;
  byProject: Array<{
    projectId: number;
    project: string;
    projectPath: string;
    commits: number;
  }>;
  byType: Array<{ type: CommitType; commits: number }>;
  byAuthor: AuthorInfo[];
  projects: ProjectInfo[];
  authors: AuthorInfo[];
  commits: CommitRow[];
};

export function useStats() {
  const { loggedIn } = useUserSession();

  const range = useState<Range>("range", () => "30d");
  const projectId = useState<string>("projectId", () => "all");
  const selectedAuthors = useState<string[]>("selectedAuthors", () => []);

  const data = useState<StatsResponse | null>("stats-data", () => null);
  const isLoading = useState<boolean>("stats-loading", () => false);
  const error = useState<string | null>("stats-error", () => null);

  async function fetchStats() {
    if (!loggedIn.value) return;
    isLoading.value = true;
    error.value = null;
    try {
      const params: Record<string, string> = {
        range: range.value,
        projectId: projectId.value,
        authors:
          selectedAuthors.value.length > 0
            ? selectedAuthors.value.join(",")
            : "all",
      };
      data.value = await $fetch<StatsResponse>("/api/stats", { query: params });
    } catch (e) {
      error.value = (e as Error).message ?? String(e);
      data.value = null;
    } finally {
      isLoading.value = false;
    }
  }

  async function hardRefresh() {
    if (!loggedIn.value) return;
    await $fetch("/api/refresh", { method: "POST" });
    await fetchStats();
  }

  watch(
    [range, projectId, selectedAuthors],
    () => {
      if (loggedIn.value) void fetchStats();
    },
    { deep: true },
  );

  if (import.meta.client && loggedIn.value && !data.value && !isLoading.value) {
    void fetchStats();
  }

  return {
    data,
    isLoading,
    error,
    fetchStats,
    hardRefresh,
    range,
    projectId,
    selectedAuthors,
  };
}
