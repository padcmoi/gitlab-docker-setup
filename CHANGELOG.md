# Changelog

This file follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and Semantic Versioning.

## [Unreleased]

### Added

- **`gitlab-stats-nuxt/`** — optional Nuxt 4 dashboard ("GitLab Stats") that visualises team commit activity on every project the admin token can see. OAuth GitLab login (`read_user` scope), server-side API calls with a `read_api` token, in-memory cache (15 min TTL), and 10+ ApexCharts (per-day / per-week / per-month / per-hour UTC / per-day-of-week, all multi-developer stacked with legend; plus per-project, per-developer, per-type donut, additions/deletions lines, last-commits table with clickable project + commit links).
- `docker-compose.yml`: new `gitlab-stats` service exposed at `127.0.0.1:${STATS_PORT:-52081}`, plus on-demand `gitlab-stats-tools` profile (named Docker volumes for `node_modules` / `.nuxt` / `.output` / pnpm store — host filesystem stays clean).
- `.env.sample`: new `STATS_*` block (`STATS_PORT`, `STATS_GITLAB_TOKEN`, `STATS_OAUTH_CLIENT_ID`, `STATS_OAUTH_CLIENT_SECRET`, `STATS_OAUTH_REDIRECT_URL`, `STATS_SESSION_SECRET`, `STATS_SINCE`, `STATS_CACHE_TTL_MS`).
- `docs/en/STATS.md` and `docs/fr/STATS.md`: dedicated install + usage walkthrough (OAuth app, server PAT, session secret, reverse-proxy snippet, first-launch checklist).
- `.gitignore`: ignore `gitlab-stats-nuxt/{node_modules,.nuxt,.output}` so the host build tooling never pollutes the working tree.

### Notes for existing users

The new `gitlab-stats` service is **fully optional** — leave the `STATS_*` env vars empty (or remove them) and run `docker compose up -d` as usual; only `gitlab` and `gitlab-runner` start.

To deploy the dashboard without touching your running GitLab:

```bash
docker compose build gitlab-stats
docker compose up -d --no-deps gitlab-stats
```

`--no-deps` guarantees the existing `gitlab` and `gitlab-runner` containers are not recreated.

## [1.2.0] - 2026-05-09

### Added

- `README.md`: optional host-level cron setup to auto-clean unused (dangling) Docker volumes left by CI jobs (manual preview command + `/etc/cron.d/docker-volume-cleanup` daily at 03:00).
- `.env.sample`: new `GITLAB_PROMETHEUS_ENABLED` toggle (default `false`) — Prometheus internal monitoring is now opt-in (was hard-coded `true`, non-trivial RAM footprint on small servers).

### Changed

- `.env.sample`: pinned default versions `GITLAB_VERSION=18.4.1-ce.0` and `RUNNER_VERSION=v18.11.2` (was empty → `latest`); `latest` is dangerous as a default because `docker compose pull` can silently bring a major-version migration. Users still override freely.
- `docker-compose.yml`: runner config switched from external named volume `gitlab-runner-config` to bind-mount `./gitlab-runner-config:/etc/gitlab-runner` — registration `config.toml` is now inspectable/editable from the host without entering the container; removes the one-shot `docker volume create` prerequisite.
- `docker-compose.yml`: `prometheus_monitoring['enable']` now reads `${GITLAB_PROMETHEUS_ENABLED:-false}` (was hard-coded `true`).

### Migration notes for existing users

If you ran `1.1.0` with the named volume, copy the existing config to the new
bind-mount path before recreating the runner:

```bash
docker run --rm -v gitlab-runner-config:/src -v "$PWD/gitlab-runner-config":/dst alpine \
  sh -c 'cp -a /src/. /dst/'
docker compose up -d
docker volume rm gitlab-runner-config   # optional, once you've verified the new mount
```

---

## [1.1.0] - 2026-05-07

### Added

- `docker-compose.yml`: GitLab service `healthcheck` (`/-/readiness`); runner now waits for `service_healthy` before starting (avoids registration race).
- `docker-compose.yml`: optional image pinning via `GITLAB_VERSION` and `RUNNER_VERSION` env vars (default `latest`, fully backward compatible).
- `docker-compose.yml`: portable ssh-keygen install fallback (apt or apk) for non-Ubuntu base images.
- `apache-gitlab.conf`: WebSocket upgrade (Web IDE / terminal / live previews), large upload limit, `X-Forwarded-Ssl on`, `ProxyRequests Off`, sane TLS defaults, longer Workhorse timeout.
- `nginx-gitlab.conf`: longer Workhorse timeouts (300s) and 500m upload limit.
- `docs/en/CI.md` and `docs/fr/CI.md`: full SSH-deploy guide rewritten around a Group-level `Masked and hidden` CI variable (`SSH_PRIVATE_KEY_B64`, base64). The key never lives in any project repo. Includes a key-rotation procedure and a deprecated section for the old `.deploy/id_ed25519` flow.
- `docs/en/README.md` and `docs/fr/README.md`: full rewrites with table of contents, `docker compose` v2 syntax everywhere, security checklist, backup/restore section, troubleshooting, link to the CI guide.
- New project structure: minimal `README.md` at root pointing to `docs/{en,fr}/`; `LICENSE` and `CHANGELOG.md` at root following standard conventions.

### Changed

- `.env.sample`: default `GITLAB_ROOT_PASSWORD` is now the placeholder `CHANGE_ME_TO_A_STRONG_PASSWORD` (was a guessable example) — a careless deploy now fails loudly.
- `.env.sample`: default `SSH_PORT` is `2222` (was `22`, which collides with the host's own sshd on every Linux server).
- `.env.sample`: documentation expanded for every variable.
- Documentation: all references to `docker-compose` (v1, EOL since June 2023) replaced by `docker compose` (v2 plugin).
- `LICENSE` (renamed from `license.md`) so README links resolve on case-sensitive filesystems.

### Deprecated

- The old "commit `id_ed25519` into project's `.deploy/`" flow is documented as legacy in `docs/en/CI.md` § 12 and should not be used for new setups. Existing projects using it should migrate to `SSH_PRIVATE_KEY_B64` and rotate the key.

### Notes for existing users

This release is **backward compatible** — you can `git pull` and
`docker compose up -d` without breakage:

- Image tags still default to `latest` (set `GITLAB_VERSION` / `RUNNER_VERSION` only if you want to pin).
- Volumes, container names, mount paths unchanged.
- Runner entrypoint is still idempotent (only generates keys / registration if missing).

To benefit from the new CI workflow on existing projects, follow the
migration steps in `docs/en/CI.md` § 12 (or `docs/fr/CI.md`).

---

## [1.0.0] - 2025-09-16

### Added

- Docker Compose preconfigured for GitLab CE
- `.env` file for sensitive data
- Apache2 configuration with SSL support
- Nginx configuration with SSL support
- Optional SMTP toggle (`SMTP_ENABLE`)
- French and English documentation
