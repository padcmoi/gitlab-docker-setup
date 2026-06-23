import { computeStats } from "../utils/stats";

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const range = (query.range as string | undefined) ?? null;
  const projectIdRaw = query.projectId as string | undefined;
  const projectId =
    projectIdRaw && projectIdRaw !== "all" ? Number(projectIdRaw) : null;
  const authorsRaw = query.authors as string | undefined;
  const authors =
    authorsRaw && authorsRaw !== "all"
      ? authorsRaw
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : [];
  return computeStats({ range, projectId, authors });
});
