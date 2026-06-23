import { getConfig } from "../../utils/config";

type TokenResponse = {
  access_token: string;
  token_type: string;
  scope?: string;
};
type GitlabUser = { id: number; username: string; name: string; email: string };

export default defineEventHandler(async (event) => {
  const config = getConfig();
  const query = getQuery(event);
  const code = query.code as string | undefined;
  const state = query.state as string | undefined;

  if (!code || !state)
    throw createError({ statusCode: 400, message: "Missing code or state" });

  const session = await getUserSession(event);
  const stored = (session as Record<string, unknown>).oauthState as
    | string
    | undefined;
  if (!stored || stored !== state) {
    throw createError({ statusCode: 400, message: "Invalid OAuth state" });
  }

  const tokenRes = await $fetch<TokenResponse>(
    `${config.gitlabBaseUrl}/oauth/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: config.oauth.clientId,
        client_secret: config.oauth.clientSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri: config.oauth.redirectUrl,
      }).toString(),
    },
  );

  const user = await $fetch<GitlabUser>(`${config.gitlabBaseUrl}/api/v4/user`, {
    headers: { Authorization: `Bearer ${tokenRes.access_token}` },
  });

  await setUserSession(event, {
    user: {
      id: user.id,
      username: user.username,
      name: user.name,
      email: user.email,
    },
  });

  return sendRedirect(event, "/stats");
});
