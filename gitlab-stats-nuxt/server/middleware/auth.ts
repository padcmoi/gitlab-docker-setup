export default defineEventHandler(async (event) => {
  const url = getRequestURL(event);
  const path = url.pathname;

  // Public paths: OAuth flow + root (rendered, redirects to /oauth/login if needed)
  if (
    path.startsWith("/oauth/") ||
    path.startsWith("/_nuxt/") ||
    path.startsWith("/_ipx/") ||
    path === "/favicon.ico"
  ) {
    return;
  }

  if (path.startsWith("/api/")) {
    const session = await getUserSession(event);
    if (!session.user) {
      throw createError({ statusCode: 401, statusMessage: "unauthenticated" });
    }
  }
});
