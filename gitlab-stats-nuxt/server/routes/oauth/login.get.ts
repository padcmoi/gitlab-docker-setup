import { randomBytes } from "node:crypto";
import { getConfig } from "../../utils/config";

export default defineEventHandler(async (event) => {
  const config = getConfig();
  const state = randomBytes(16).toString("hex");

  await setUserSession(event, { oauthState: state } as never, { maxAge: 600 });

  const params = new URLSearchParams({
    client_id: config.oauth.clientId,
    redirect_uri: config.oauth.redirectUrl,
    response_type: "code",
    state,
    scope: "read_user",
  });

  return sendRedirect(
    event,
    `${config.gitlabBaseUrl}/oauth/authorize?${params.toString()}`,
  );
});
