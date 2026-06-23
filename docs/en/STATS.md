# 📊 GitLab Stats Dashboard

_🇬🇧 English version | [🇫🇷 Version française](../fr/STATS.md)_

A self-contained Nuxt 4 dashboard that visualises **team commit activity**
across every project visible to a server-side GitLab token. Visitors log in
via OAuth GitLab so the URL can be shared with the team or your manager.

> Source: [`gitlab-stats-nuxt/`](../../gitlab-stats-nuxt/)
> Container: `gitlab_ce_stats` (built from the compose file at the repo root)
> Read-only by design: `read_api` on the server PAT, `read_user` on the OAuth scope.

---

## Table of contents

- [What you get](#-what-you-get)
- [Prerequisites](#-prerequisites)
- [Install (step by step)](#-install-step-by-step)
- [Reverse-proxy snippet (Nginx / Apache)](#-reverse-proxy-snippet)
- [First launch](#-first-launch)
- [Routes](#-routes)
- [How visitors authenticate](#-how-visitors-authenticate)
- [Cache and refresh](#-cache-and-refresh)
- [Maintenance](#-maintenance)
- [Troubleshooting](#-troubleshooting)
- [Architecture (for the curious)](#-architecture-for-the-curious)

---

## ✨ What you get

- **Filters**: period (7d / 30d / 90d / 6 months / 1 year / all), project,
  multi-developer selector.
- **Multi-developer stacked charts with legend** (top 10 + "Autres"):
  by day, by ISO week, by month, by hour (UTC), by day of week.
- **Single-series charts**: top 15 projects, top 15 developers, commit-type
  donut (`feat` / `fix` / `refactor` / `chore` / `docs` / `test` / `style` /
  `perf` / `ci` / `build` / `other`), additions/deletions per month.
- **KPIs** (7): projects, commits, active days, avg / active day,
  lines added, lines removed, lines changed.
- **Last commits table** (up to 100 rows): project + commit title clickable
  to GitLab, period printed in the header.

---

## ✅ Prerequisites

- GitLab Docker Setup already running (this dashboard rides on the same
  `docker-compose.yml`).
- An **admin or owner** GitLab account that can create OAuth applications
  and personal access tokens.
- A **reverse-proxy vhost** for a stats sub-domain (the dashboard is bound
  to `127.0.0.1:${STATS_PORT:-52081}`, never exposed publicly on its own).
- A DNS record for `stats.your-domain.com` (or any sub-domain you pick)
  pointing to the host.
- An SSL certificate (Let's Encrypt is fine).

> **Note on the GitLab account.** The dashboard's projects listing is
> unfiltered (no `membership=true`). With an **admin token** the dashboard
> covers the whole instance. With a regular user token it only covers the
> projects that user can see — which can be exactly what you want for a
> single-team dashboard.

---

## 🛠 Install (step by step)

### 1. Create the OAuth application

This is what visitors will authenticate against.

GitLab → **User Settings → Applications** (or **Admin Area → Applications**
for an instance-wide app):

| Field | Value |
|-------|-------|
| Name | `gitlab-stats` |
| Redirect URI | `https://stats.your-domain.com/oauth/callback` (must match `STATS_OAUTH_REDIRECT_URL` byte-for-byte) |
| Confidential | ✅ |
| Scopes | `read_user` (only) |

Save. Copy:

- **Application ID** → `STATS_OAUTH_CLIENT_ID`
- **Secret** (shown once) → `STATS_OAUTH_CLIENT_SECRET`

> If GitLab forces an expiration on personal access tokens, you can disable
> that in **Admin Area → Settings → General → Account and limit →
> "Enforce personal access token expiration"**.

### 2. Create the server-side personal access token

This is what the dashboard backend uses to call the GitLab API.

GitLab → **User Settings → Access Tokens**:

| Field | Value |
|-------|-------|
| Name | `gitlab-stats-server` |
| Expiration | your choice (or none if enforcement is disabled) |
| Scopes | `read_api` (only) |

Save. Copy the `glpat-...` token → `STATS_GITLAB_TOKEN`.

### 3. Generate a session secret

```bash
openssl rand -hex 32
```

Paste the result into `STATS_SESSION_SECRET` (must be ≥ 32 chars).

### 4. Fill `.env`

Copy the `STATS_*` block from
[`.env.sample`](../../.env.sample) into your local `.env` and replace the
placeholders:

```env
STATS_PORT=52081
STATS_GITLAB_TOKEN=glpat-...
STATS_OAUTH_CLIENT_ID=...
STATS_OAUTH_CLIENT_SECRET=...
STATS_OAUTH_REDIRECT_URL=https://stats.your-domain.com/oauth/callback
STATS_SESSION_SECRET=...
STATS_SINCE=2025-01-01T00:00:00Z
STATS_CACHE_TTL_MS=900000
```

### 5. DNS

Create an `A` record (or `CNAME` to your GitLab host) for
`stats.your-domain.com` pointing to the same server.

### 6. SSL certificate

```bash
sudo certbot certonly --nginx -d stats.your-domain.com
```

(Use `--apache` if you're on Apache; or any cert flow you prefer.)

### 7. Reverse-proxy vhost

See the [snippet below](#-reverse-proxy-snippet), pick Nginx or Apache,
install it, reload your reverse proxy.

### 8. Build and start — without touching the GitLab container

```bash
docker compose build gitlab-stats
docker compose up -d --no-deps gitlab-stats
docker compose logs -f gitlab-stats
```

`--no-deps` guarantees the running `gitlab` and `gitlab-runner` containers
are not recreated. You should see:

```
gitlab_ce_stats  | Listening on http://0.0.0.0:3000
```

---

## 🔌 Reverse-proxy snippet

### Nginx

Create `/etc/nginx/sites-available/stats.your-domain.com`:

```nginx
server {
    listen 80;
    server_name stats.your-domain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name stats.your-domain.com;

    ssl_certificate     /etc/letsencrypt/live/stats.your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/stats.your-domain.com/privkey.pem;

    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options nosniff;
    add_header X-Frame-Options SAMEORIGIN;

    location / {
        proxy_pass http://127.0.0.1:52081;
        proxy_set_header Host              $http_host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_http_version 1.1;
    }
}
```

Enable and reload:

```bash
sudo ln -s /etc/nginx/sites-available/stats.your-domain.com /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### Apache

```apache
<VirtualHost *:80>
    ServerName stats.your-domain.com
    Redirect permanent / https://stats.your-domain.com/
</VirtualHost>

<VirtualHost *:443>
    ServerName stats.your-domain.com

    SSLEngine on
    SSLCertificateFile     /etc/letsencrypt/live/stats.your-domain.com/fullchain.pem
    SSLCertificateKeyFile  /etc/letsencrypt/live/stats.your-domain.com/privkey.pem

    Header always set Strict-Transport-Security "max-age=31536000; includeSubDomains"
    Header always set X-Content-Type-Options nosniff
    Header always set X-Frame-Options SAMEORIGIN

    ProxyPreserveHost On
    ProxyRequests Off
    ProxyPass        / http://127.0.0.1:52081/
    ProxyPassReverse / http://127.0.0.1:52081/
    RequestHeader set X-Forwarded-Proto "https"
</VirtualHost>
```

Reload Apache: `sudo systemctl reload apache2`.

---

## 🚀 First launch

Open `https://stats.your-domain.com/` in a browser:

1. You land on `/login` with a **"Se connecter avec GitLab"** button.
2. Click it → you're redirected to GitLab for OAuth consent.
3. After authorising, GitLab redirects you back to `/oauth/callback` →
   the dashboard creates your session and sends you to `/stats`.
4. First load fetches every project + every commit since `STATS_SINCE`
   (one shot, ~10–60 s depending on instance size); subsequent loads hit
   the in-memory cache (15 min by default).

---

## 🛣 Routes

| URL | Behaviour |
|---|---|
| `/` | Redirects to `/login` or `/stats` based on session |
| `/login` | Login screen with the OAuth button |
| `/stats` | The dashboard (redirects to `/login` if no session) |
| `/oauth/login` | Starts the OAuth flow |
| `/oauth/callback` | Exchanges the code, creates the session, redirects to `/stats` |
| `/oauth/logout` | Destroys the session, redirects to `/login` |
| `/api/stats` | Aggregated data (401 if unauthenticated) |
| `/api/refresh` | Invalidates the in-memory cache |

---

## 🔐 How visitors authenticate

- **Any GitLab account** on the instance can sign in — the OAuth app
  doesn't gate on group or role.
- The **server-side PAT** owns the data fetched. With an admin token the
  dashboard sees all projects; with a regular user token it only sees that
  user's visible projects.
- Sessions are signed cookies (`nuxt-session`) using `STATS_SESSION_SECRET`,
  HttpOnly + SameSite=Lax.

---

## ♻️ Cache and refresh

- Backend caches `listProjects()` and `listCommits(projectId, since)` in
  memory with TTL `STATS_CACHE_TTL_MS` (default 15 minutes).
- The **Rafraîchir** button in the dashboard header calls `POST /api/refresh`
  to invalidate the cache, then refetches.
- The cache is **per container instance**. Restarting `gitlab-stats` clears
  it.

---

## 🧰 Maintenance

### Update the dashboard

```bash
cd /path/to/gitlab-docker-setup
git pull                                  # pull the latest sources
docker compose build gitlab-stats
docker compose up -d --no-deps gitlab-stats
```

### Tail the logs

```bash
docker compose logs -f gitlab-stats
```

### Run the dev tooling (format, install, lint) without polluting the host

```bash
docker compose --profile tools run --rm gitlab-stats-tools pnpm install
docker compose --profile tools run --rm gitlab-stats-tools pnpm format
```

Volumes `gitlab-stats-nuxt-node-modules`, `-nuxt-cache`, `-output`,
`-pnpm-store` hold the deps and build artefacts — your `gitlab-stats-nuxt/`
working tree stays clean.

### Stop the dashboard (keep GitLab running)

```bash
docker compose stop gitlab-stats
```

### Fully remove (containers + named volumes)

```bash
docker compose --profile tools rm -sfv gitlab-stats gitlab-stats-tools
docker volume rm \
  gitlab-stats-nuxt-node-modules \
  gitlab-stats-nuxt-nuxt-cache \
  gitlab-stats-nuxt-output \
  gitlab-stats-nuxt-pnpm-store
```

GitLab + Runner are untouched.

---

## 🩺 Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `Missing env var: STATS_GITLAB_TOKEN` in logs | `.env` not loaded or var empty | Check `docker compose config` shows the value, then `up -d --force-recreate` |
| `STATS_SESSION_SECRET must be at least 32 chars` | Secret too short | Regenerate with `openssl rand -hex 32` |
| Browser stays on `/oauth/callback` with "Invalid OAuth state" | Cookies blocked or `STATS_OAUTH_REDIRECT_URL` doesn't match the GitLab app's Redirect URI | Make the two URLs **identical** (scheme, host, path) |
| Dashboard shows `0 projects` | The PAT is on a user with no project membership | Use an admin token, or join the relevant groups |
| Dashboard hangs on "Chargement en cours…" forever | First call is fetching every commit since `STATS_SINCE` | Wait — large instances take 1–2 min on the cold cache. Subsequent loads are instant. |
| 401 calling `/api/stats` from `curl` | The endpoint requires a session cookie | This is by design. Use the browser. |
| Hairpin NAT / SSL handshake error when the container hits the GitLab API | The container can't reach its own public hostname | The compose already maps `${GITLAB_HOST}:host-gateway` via `extra_hosts`; check your firewall lets the container reach the host gateway |

---

## 🧱 Architecture (for the curious)

```
gitlab-stats-nuxt/
├── app/
│   ├── pages/
│   │   ├── index.vue       routes /login or /stats based on session
│   │   ├── login.vue       OAuth login button
│   │   └── stats.vue       dashboard (filters, KPIs, charts, last commits)
│   ├── components/StatsChart.vue   ApexCharts wrapper (ClientOnly + fallback)
│   ├── composables/useStats.ts     data fetching + filter state
│   ├── plugins/apexcharts.client.ts
│   └── assets/css/main.css         Tailwind v4 + cursor-pointer reset
├── server/
│   ├── api/
│   │   ├── stats.get.ts            GET /api/stats?range=&projectId=&authors=
│   │   └── refresh.post.ts         POST /api/refresh
│   ├── routes/oauth/{login,callback,logout}.get.ts
│   ├── middleware/auth.ts          guards /api/* (401 if no session)
│   └── utils/{config,cache,gitlab,stats}.ts
├── types/auth.d.ts                 UserSession typing
├── Dockerfile                      multi-stage builder + alpine runner
└── nuxt.config.ts
```

Stack: **Nuxt 4** (Nitro), **Nuxt UI 4** (Tailwind v4 included),
**nuxt-auth-utils** for OAuth + signed sessions, **vue3-apexcharts** for
the charts. No database — projects + commits live in an in-memory cache
inside the Nitro process.
