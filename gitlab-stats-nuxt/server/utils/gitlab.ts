import { cacheWrap } from "./cache";
import { getConfig } from "./config";

export type GitlabProject = {
  id: number;
  name: string;
  name_with_namespace: string;
  path_with_namespace: string;
  web_url: string;
};

export type GitlabCommit = {
  id: string;
  short_id: string;
  title: string;
  message: string;
  author_name: string;
  author_email: string;
  authored_date: string;
  committed_date: string;
  web_url: string;
  parent_ids?: string[];
  stats?: { additions: number; deletions: number; total: number };
};

export type ProjectCommit = GitlabCommit & {
  projectId: number;
  projectName: string;
  projectPath: string;
  projectUrl: string;
};

async function fetchJson<T>(
  url: string,
  token: string,
): Promise<{ data: T; nextPage: string | null }> {
  const res = await $fetch.raw<T>(url, {
    headers: { "PRIVATE-TOKEN": token },
    retry: 0,
  });
  const nextRaw = res.headers.get("x-next-page");
  const nextPage = nextRaw && nextRaw.trim() !== "" ? nextRaw : null;
  return { data: res._data as T, nextPage };
}

async function paginate<T>(path: string): Promise<T[]> {
  const { gitlabBaseUrl, gitlabToken } = getConfig();
  const base = `${gitlabBaseUrl}/api/v4${path}`;
  const sep = path.includes("?") ? "&" : "?";
  const results: T[] = [];
  let page = 1;
  while (true) {
    const url = `${base}${sep}per_page=100&page=${page}`;
    const { data, nextPage } = await fetchJson<T[]>(url, gitlabToken);
    results.push(...data);
    if (!nextPage) break;
    page = Number(nextPage);
  }
  return results;
}

export async function listProjects(): Promise<GitlabProject[]> {
  const { cacheTtlMs } = getConfig();
  return cacheWrap("projects", cacheTtlMs, () =>
    paginate<GitlabProject>(
      "/projects?simple=true&order_by=last_activity_at&archived=false",
    ),
  );
}

export async function listCommits(
  projectId: number,
  since: string,
): Promise<GitlabCommit[]> {
  const { cacheTtlMs } = getConfig();
  return cacheWrap(`commits:${projectId}:${since}`, cacheTtlMs, () =>
    paginate<GitlabCommit>(
      `/projects/${projectId}/repository/commits?with_stats=true&all=true&since=${encodeURIComponent(since)}`,
    ),
  );
}

export async function collectAllCommits(
  since: string,
): Promise<ProjectCommit[]> {
  const projects = await listProjects();
  const out: ProjectCommit[] = [];
  for (const project of projects) {
    try {
      const commits = await listCommits(project.id, since);
      for (const c of commits) {
        out.push({
          ...c,
          projectId: project.id,
          projectName: project.name_with_namespace,
          projectPath: project.path_with_namespace,
          projectUrl: project.web_url,
        });
      }
    } catch (err) {
      console.warn(
        `[gitlab-stats] failed to read commits for ${project.path_with_namespace}:`,
        (err as Error).message,
      );
    }
  }
  return out;
}
