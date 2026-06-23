import { collectAllCommits, type ProjectCommit } from "./gitlab";
import { getConfig } from "./config";

export const COMMIT_TYPES = [
  "feat",
  "fix",
  "refactor",
  "chore",
  "docs",
  "test",
  "style",
  "perf",
  "ci",
  "build",
  "other",
] as const;

export type CommitType = (typeof COMMIT_TYPES)[number];

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

export type AuthorInfo = { email: string; name: string; commits: number };

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
  projects: Array<{ id: number; name: string; path: string }>;
  authors: AuthorInfo[];
  commits: CommitRow[];
};

function buildAuthorSeries(
  rows: CommitRow[],
  categoryOf: (r: CommitRow) => string,
  allCategories: string[],
  topN = 10,
): SeriesByAuthor {
  const byAuthor = new Map<
    string,
    { name: string; total: number; per: Map<string, number> }
  >();
  for (const r of rows) {
    const ek = (r.authorEmail ?? "unknown").toLowerCase();
    const cat = categoryOf(r);
    let a = byAuthor.get(ek);
    if (!a) {
      a = { name: r.authorName ?? ek, total: 0, per: new Map() };
      byAuthor.set(ek, a);
    }
    a.total += 1;
    a.per.set(cat, (a.per.get(cat) ?? 0) + 1);
  }
  const sorted = Array.from(byAuthor.entries()).sort(
    (a, b) => b[1].total - a[1].total,
  );
  const top = sorted.slice(0, topN);
  const rest = sorted.slice(topN);

  const series: AuthorSeries[] = top.map(([email, a]) => ({
    email,
    name: a.name,
    data: allCategories.map((c) => a.per.get(c) ?? 0),
  }));
  if (rest.length > 0) {
    const restData = allCategories.map(() => 0);
    for (const [, a] of rest) {
      for (let i = 0; i < allCategories.length; i++) {
        restData[i] += a.per.get(allCategories[i]!) ?? 0;
      }
    }
    series.push({
      email: "__others__",
      name: `Autres (${rest.length})`,
      data: restData,
    });
  }
  return { categories: allCategories, series };
}

function isoWeek(date: Date): string {
  const d = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(
    ((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
  );
  return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}

const DOW_LABELS = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];

export function detectCommitType(title: string): CommitType {
  const t = title.trim();
  const patterns: Array<[RegExp, CommitType]> = [
    [/^feat(\(|:|!)/i, "feat"],
    [/^fix(\(|:|!)/i, "fix"],
    [/^refactor(\(|:|!)/i, "refactor"],
    [/^chore(\(|:|!)/i, "chore"],
    [/^docs?(\(|:|!)/i, "docs"],
    [/^test(s)?(\(|:|!)/i, "test"],
    [/^style(\(|:|!)/i, "style"],
    [/^perf(\(|:|!)/i, "perf"],
    [/^ci(\(|:|!)/i, "ci"],
    [/^build(\(|:|!)/i, "build"],
  ];
  for (const [p, type] of patterns) if (p.test(t)) return type;
  return "other";
}

export function resolveSince(range: string | null | undefined): {
  since: string;
  rangeLabel: string;
} {
  const { since: defaultSince } = getConfig();
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const map: Record<string, number> = {
    "7d": 7 * day,
    "30d": 30 * day,
    "90d": 90 * day,
    "180d": 180 * day,
    "365d": 365 * day,
  };
  if (range && map[range])
    return {
      since: new Date(now - map[range]).toISOString(),
      rangeLabel: range,
    };
  return { since: defaultSince, rangeLabel: "all" };
}

export async function computeStats(filters: {
  range?: string | null;
  projectId?: number | null;
  authors?: string[] | null;
}): Promise<StatsResponse> {
  const { since, rangeLabel } = resolveSince(filters.range);
  const all = await collectAllCommits(since);

  const authorAll = new Map<string, AuthorInfo>();
  for (const c of all) {
    const k = (c.author_email ?? "unknown").toLowerCase();
    const e = authorAll.get(k) ?? {
      email: k,
      name: c.author_name ?? k,
      commits: 0,
    };
    e.commits += 1;
    if (!e.name && c.author_name) e.name = c.author_name;
    authorAll.set(k, e);
  }
  const authors = Array.from(authorAll.values()).sort(
    (a, b) => b.commits - a.commits,
  );

  const projMap = new Map<number, { id: number; name: string; path: string }>();
  for (const c of all)
    projMap.set(c.projectId, {
      id: c.projectId,
      name: c.projectName,
      path: c.projectPath,
    });
  const projects = Array.from(projMap.values()).sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  const wanted = (filters.authors ?? [])
    .map((a) => a.toLowerCase())
    .filter(Boolean);
  const byAuthorFilter = wanted.length > 0;

  const filtered = all.filter((c: ProjectCommit) => {
    if (filters.projectId && c.projectId !== filters.projectId) return false;
    if (
      byAuthorFilter &&
      !wanted.includes((c.author_email ?? "").toLowerCase())
    )
      return false;
    return true;
  });

  const rows: CommitRow[] = filtered.map((c) => {
    const additions = c.stats?.additions ?? 0;
    const deletions = c.stats?.deletions ?? 0;
    const total = c.stats?.total ?? additions + deletions;
    return {
      projectId: c.projectId,
      project: c.projectName,
      projectPath: c.projectPath,
      projectUrl: c.projectUrl,
      commitId: c.id,
      shortId: c.short_id,
      title: c.title,
      authorName: c.author_name,
      authorEmail: c.author_email,
      date: c.authored_date,
      day: c.authored_date.slice(0, 10),
      month: c.authored_date.slice(0, 7),
      type: detectCommitType(c.title),
      additions,
      deletions,
      total,
      url: c.web_url,
      isMerge: (c.parent_ids?.length ?? 0) > 1,
    };
  });

  const byDayMap = new Map<
    string,
    { commits: number; additions: number; deletions: number }
  >();
  const byWeekMap = new Map<
    string,
    { commits: number; additions: number; deletions: number }
  >();
  const byMonthMap = new Map<
    string,
    { commits: number; additions: number; deletions: number }
  >();
  const byHourMap = new Map<number, number>();
  const byDowMap = new Map<number, number>();
  const byProjectMap = new Map<
    number,
    { projectId: number; project: string; projectPath: string; commits: number }
  >();
  const byTypeMap = new Map<CommitType, number>();
  for (const t of COMMIT_TYPES) byTypeMap.set(t, 0);
  for (let h = 0; h < 24; h++) byHourMap.set(h, 0);
  for (let d = 0; d < 7; d++) byDowMap.set(d, 0);
  const byAuthorMap = new Map<string, AuthorInfo>();
  let totalAdditions = 0;
  let totalDeletions = 0;

  for (const r of rows) {
    totalAdditions += r.additions;
    totalDeletions += r.deletions;

    const d = byDayMap.get(r.day) ?? { commits: 0, additions: 0, deletions: 0 };
    d.commits++;
    d.additions += r.additions;
    d.deletions += r.deletions;
    byDayMap.set(r.day, d);

    const dateObj = new Date(r.date);
    const week = isoWeek(dateObj);
    const w = byWeekMap.get(week) ?? { commits: 0, additions: 0, deletions: 0 };
    w.commits++;
    w.additions += r.additions;
    w.deletions += r.deletions;
    byWeekMap.set(week, w);

    const m = byMonthMap.get(r.month) ?? {
      commits: 0,
      additions: 0,
      deletions: 0,
    };
    m.commits++;
    m.additions += r.additions;
    m.deletions += r.deletions;
    byMonthMap.set(r.month, m);

    byHourMap.set(
      dateObj.getUTCHours(),
      (byHourMap.get(dateObj.getUTCHours()) ?? 0) + 1,
    );
    byDowMap.set(
      dateObj.getUTCDay(),
      (byDowMap.get(dateObj.getUTCDay()) ?? 0) + 1,
    );

    const p = byProjectMap.get(r.projectId) ?? {
      projectId: r.projectId,
      project: r.project,
      projectPath: r.projectPath,
      commits: 0,
    };
    p.commits++;
    byProjectMap.set(r.projectId, p);

    byTypeMap.set(r.type, (byTypeMap.get(r.type) ?? 0) + 1);

    const ak = (r.authorEmail ?? "unknown").toLowerCase();
    const ae = byAuthorMap.get(ak) ?? {
      email: ak,
      name: r.authorName ?? ak,
      commits: 0,
    };
    ae.commits++;
    byAuthorMap.set(ak, ae);
  }

  const activeDays = byDayMap.size;

  const sortedDays = Array.from(byDayMap.keys()).sort((a, b) =>
    a.localeCompare(b),
  );
  const sortedWeeks = Array.from(byWeekMap.keys()).sort((a, b) =>
    a.localeCompare(b),
  );
  const sortedMonths = Array.from(byMonthMap.keys()).sort((a, b) =>
    a.localeCompare(b),
  );
  const hourCats = Array.from({ length: 24 }, (_, i) => String(i));
  const dowOrder = [1, 2, 3, 4, 5, 6, 0]; // Lun..Dim
  const dowCats = dowOrder.map((d) => DOW_LABELS[d] ?? String(d));

  return {
    generatedAt: new Date().toISOString(),
    since,
    filters: {
      projectId: filters.projectId ?? null,
      range: rangeLabel,
      authors: wanted,
    },
    totals: {
      projects: byProjectMap.size,
      commits: rows.length,
      additions: totalAdditions,
      deletions: totalDeletions,
      changedLines: totalAdditions + totalDeletions,
      activeDays,
      avgCommitsPerActiveDay:
        activeDays > 0 ? Math.round((rows.length / activeDays) * 10) / 10 : 0,
    },
    byHour: Array.from(byHourMap.entries())
      .map(([hour, commits]) => ({ hour, commits }))
      .sort((a, b) => a.hour - b.hour),
    byDayOfWeek: Array.from(byDowMap.entries())
      .map(([dow, commits]) => ({
        dow,
        label: DOW_LABELS[dow] ?? "?",
        commits,
      }))
      .sort((a, b) => {
        const order = (d: number) => (d === 0 ? 6 : d - 1);
        return order(a.dow) - order(b.dow);
      }),
    byDay: Array.from(byDayMap.entries())
      .map(([day, v]) => ({ day, ...v }))
      .sort((a, b) => a.day.localeCompare(b.day)),
    byWeek: Array.from(byWeekMap.entries())
      .map(([week, v]) => ({ week, ...v }))
      .sort((a, b) => a.week.localeCompare(b.week)),
    byMonth: Array.from(byMonthMap.entries())
      .map(([month, v]) => ({ month, ...v }))
      .sort((a, b) => a.month.localeCompare(b.month)),
    byHourByAuthor: buildAuthorSeries(
      rows,
      (r) => String(new Date(r.date).getUTCHours()),
      hourCats,
    ),
    byDowByAuthor: buildAuthorSeries(
      rows,
      (r) => DOW_LABELS[new Date(r.date).getUTCDay()] ?? "?",
      dowCats,
    ),
    byDayByAuthor: buildAuthorSeries(rows, (r) => r.day, sortedDays),
    byWeekByAuthor: buildAuthorSeries(
      rows,
      (r) => isoWeek(new Date(r.date)),
      sortedWeeks,
    ),
    byMonthByAuthor: buildAuthorSeries(rows, (r) => r.month, sortedMonths),
    byProject: Array.from(byProjectMap.values()).sort(
      (a, b) => b.commits - a.commits,
    ),
    byType: Array.from(byTypeMap.entries())
      .map(([type, commits]) => ({ type, commits }))
      .filter((t) => t.commits > 0)
      .sort((a, b) => b.commits - a.commits),
    byAuthor: Array.from(byAuthorMap.values()).sort(
      (a, b) => b.commits - a.commits,
    ),
    projects,
    authors,
    commits: rows.sort((a, b) => b.date.localeCompare(a.date)),
  };
}
