# 🚀 GitLab Docker Setup

_🇬🇧 English version | [🇫🇷 Version française](../fr/README.md)_

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Docker](https://img.shields.io/badge/Docker-20.10+-blue.svg)](https://docker.com)
[![GitLab CE](https://img.shields.io/badge/GitLab-CE-orange.svg)](https://gitlab.com)

> **Self-host GitLab Community Edition + a Group Runner with Docker Compose
> in under 5 minutes. Includes ready-to-use Apache/Nginx reverse-proxy
> configs, optional SMTP, and a battle-tested CI/CD setup for SSH-based
> deployments.**

---

## Table of contents

- [What you get](#-what-you-get)
- [Quick install (5 min)](#-quick-install-5-min)
- [Configuration](#%EF%B8%8F-configuration)
- [Reverse proxy](#-reverse-proxy)
- [SSL / Let's Encrypt](#-ssl--lets-encrypt)
- [CI/CD — SSH deploys](#-cicd--ssh-deploys)
- [Useful commands](#%EF%B8%8F-useful-commands)
- [Backup & restore](#-backup--restore)
- [Security checklist](#-security-checklist)
- [Troubleshooting](#-troubleshooting)
- [Credits](#-credits)
- [License](#-license)

---

## 🎯 What you get

- **GitLab Community Edition** — your own private GitLab instance.
- **GitLab Runner (Docker executor)** — auto-registered, ready for CI/CD.
  Generates an SSH deploy key on first boot (see
  [CI guide](CI.md)).
- **Reverse-proxy configs** — Apache or Nginx, with WebSocket support and
  reasonable upload limits.
- **Optional SMTP** — toggle with one env var (`SMTP_ENABLE`).
- **TLS-friendly** — designed for Let's Encrypt or custom certificates
  terminated at the reverse proxy.
- **Production-leaning defaults** — log rotation, healthcheck, optional
  image pinning.

---

## 🚀 Quick install (5 min)

### 1. Prerequisites

```bash
# Verify Docker + Compose v2
docker --version
docker compose version    # NOT `docker-compose` — v1 is EOL
```

If missing on Debian/Ubuntu:

```bash
sudo apt update
sudo apt install docker.io docker-compose-v2
```

### 2. Clone

```bash
git clone https://github.com/padcmoi/gitlab-docker-setup.git
cd gitlab-docker-setup
```

### 3. Configure

```bash
cp .env.sample .env
nano .env
```

Minimum to set:

```env
GITLAB_HOST=your-domain.com
GITLAB_ROOT_EMAIL=admin@your-domain.com
GITLAB_ROOT_PASSWORD=<a strong password — 12+ chars, mixed case, digits, symbols>
SSH_PORT=2222           # NOT 22 (collides with the host's own sshd)
```

> ⚠️ **CRITICAL** — `GITLAB_ROOT_PASSWORD` must be strong, otherwise GitLab
> refuses to boot. The default value in `.env.sample` is a placeholder
> (`CHANGE_ME_TO_A_STRONG_PASSWORD`) precisely so a careless deploy fails
> loudly instead of running with a guessable admin.

### 4. Create the runner config volume (one-shot)

```bash
docker volume create gitlab-runner-config
```

This persists the runner's `config.toml` (the registration) across
container recreates.

### 5. Start

```bash
docker compose up -d

# Watch the first boot (2-5 minutes)
docker compose logs -f gitlab
```

### 6. Access

- URL: `http://your-domain.com:1584` (then add a reverse proxy + TLS).
- Login: `root`
- Password: the one you set in `GITLAB_ROOT_PASSWORD`.

---

## ⚙️ Configuration

### Variables

| Variable                    | Description                                                     | Example              |
| --------------------------- | --------------------------------------------------------------- | -------------------- |
| `GITLAB_CONTAINER_NAME`     | Container name (also used for the runner: `<name>_runner`)      | `gitlab_ce`          |
| `GITLAB_HOST`               | Public hostname                                                 | `gitlab.example.com` |
| `GITLAB_ROOT_EMAIL`         | Admin email                                                     | `admin@example.com`  |
| `GITLAB_ROOT_PASSWORD`      | Admin password (12+ chars). **Weak = startup crash.**           | `S3cure!P@ss…`       |
| `GITLAB_VERSION`            | Optional — pin GitLab CE image tag (default: `latest`)          | `17.5.2-ce.0`        |
| `RUNNER_VERSION`            | Optional — pin Runner image tag (default: `latest`)             | `17.5.0`             |
| `RUNNER_REGISTRATION_TOKEN` | Group runner token (see [CI guide](CI.md))                      | `glrt-…`             |
| `HTTP_PORT`                 | Host port for GitLab HTTP (bound to `127.0.0.1`)                | `1584`               |
| `SSH_PORT`                  | Host port for GitLab SSH. **Do not use 22.**                    | `2222`               |
| `SMTP_*`                    | SMTP credentials (optional, set `SMTP_ENABLE=false` to disable) | —                    |

### Pinning image versions (recommended in production)

`docker compose pull` on `latest` will eventually fetch a major-bump that
breaks DB migrations on restart. Pin to a specific version in `.env`:

```env
GITLAB_VERSION=17.5.2-ce.0
RUNNER_VERSION=17.5.0
```

Tags: <https://hub.docker.com/r/gitlab/gitlab-ce/tags>.

### SMTP (optional)

```env
SMTP_ENABLE=true
SMTP_ADDRESS=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
```

To disable: `SMTP_ENABLE=false` (the runner doesn't need SMTP).

---

## 🌐 Reverse proxy

GitLab listens on `127.0.0.1:${HTTP_PORT}` only — terminate TLS at your
host's reverse proxy. Sample configs (with WebSocket, upload tuning,
forward-proto headers):

### Apache2

```bash
sudo cp apache-gitlab.conf /etc/apache2/sites-available/gitlab.conf
sudo nano /etc/apache2/sites-available/gitlab.conf   # set ServerName
sudo a2enmod proxy proxy_http proxy_wstunnel ssl headers rewrite
sudo a2ensite gitlab.conf
sudo systemctl reload apache2
```

### Nginx

```bash
sudo cp nginx-gitlab.conf /etc/nginx/sites-available/gitlab
sudo nano /etc/nginx/sites-available/gitlab          # set server_name
sudo ln -s /etc/nginx/sites-available/gitlab /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

---

## 🔒 SSL / Let's Encrypt

```bash
sudo apt install certbot

# Stop the proxy briefly to free port 80 for the standalone challenge
sudo systemctl stop apache2   # or nginx
sudo certbot certonly --standalone -d your-domain.com
sudo systemctl start apache2  # or nginx
```

Then uncomment the `SSLCertificate*` (Apache) or `ssl_certificate*` (Nginx)
lines in your config and reload.

For automatic renewal: `sudo systemctl enable --now certbot.timer`. Pair
with a `--deploy-hook` that reloads your proxy.

---

## 🔁 CI/CD — SSH deploys

Self-hosted GitLab is half the story; the other half is making your
projects deploy to your servers without you clicking around. This
template ships a battle-tested SSH-deploy workflow:

- The runner generates an ed25519 keypair on first boot.
- The base64 of the private key goes into a **single Group-level CI/CD
  Variable** (`SSH_PRIVATE_KEY_B64`, `Masked and hidden`).
- Every project of the group inherits it — no per-project secrets, no
  `.deploy/` folder in repos, no UI variable per project.
- A reusable `.gitlab-ci.yml` decodes the key at job time and deploys
  via SSH.

**Full guide: [CI/CD (EN)](CI.md) / [CI/CD (FR)](../fr/CI.md).**

---

## 🛠️ Useful commands

```bash
# Status
docker compose ps

# Logs
docker compose logs -f
docker compose logs -f gitlab           # just GitLab
docker compose logs -f gitlab-runner    # just the runner

# Restart
docker compose restart

# Stop
docker compose down

# Upgrade (after checking the GitLab upgrade path for the new tag!)
docker compose pull && docker compose up -d
```

---

## 💾 Backup & restore

GitLab ships its own backup tool:

```bash
# Create a backup (lands in /var/opt/gitlab/backups/ inside the container)
docker compose exec gitlab gitlab-backup create

# List backups
docker compose exec gitlab ls -lh /var/opt/gitlab/backups/

# Restore (GitLab must be partially stopped — see GitLab docs for the full
# procedure, this is just the trigger):
docker compose exec gitlab gitlab-backup restore BACKUP=<timestamp>_gitlab_backup
```

Don't forget to also back up `/etc/gitlab/` (mounted as `./config/`) which
contains `gitlab-secrets.json` — without it the backup is unrestorable.

---

## 🔐 Security checklist

Before exposing your GitLab to the internet:

- [ ] `GITLAB_ROOT_PASSWORD` is strong and unique.
- [ ] `GITLAB_VERSION` is pinned (not `latest`).
- [ ] `SSH_PORT` is non-standard (not 22).
- [ ] Reverse proxy serves HTTPS only, with HSTS once verified.
- [ ] Firewall: only the proxy ports (80/443) and `SSH_PORT` open
      externally; the GitLab container HTTP (`HTTP_PORT`) is bound to
      `127.0.0.1` so already private.
- [ ] Backups scheduled and tested.
- [ ] Runner: `--docker-privileged` is enabled by default — fine for
      trusted/internal use, but **review before allowing untrusted forks
      or external MRs**, as it grants host root from any pipeline.
- [ ] CI keys: follow the [CI guide](CI.md), use Group-level
      `Masked and hidden` variables. **Never commit a private key to a
      repo**, even a "private" one.

---

## 🔍 Troubleshooting

**GitLab won't start**

```bash
docker compose logs gitlab
df -h        # GitLab needs lots of disk
free -m      # …and at least 4 GB RAM in practice
```

Common cause: weak `GITLAB_ROOT_PASSWORD` → check the logs for
"password is too weak".

**Cannot access**

```bash
docker compose ps
curl -I http://127.0.0.1:1584   # bypasses the reverse proxy
```

If `127.0.0.1:1584` works but the public URL doesn't → reverse proxy issue.

**Emails not sent**

Verify SMTP creds, then test from inside:

```bash
docker compose exec gitlab gitlab-rails console
# > Notify.test_email('you@example.com', 'subject', 'body').deliver_now
```

**Runner offline**

See [CI.md § 3](CI.md#3-create-a-gitlab-group-and-register-the-runner).

---

## 🙏 Credits

**Author**: [Julien Jean](https://www.linkedin.com/in/julienjean-nice/) — 💼
[LinkedIn](https://www.linkedin.com/in/julienjean-nice/)

This project helps you self-host a fully-functional GitLab + CI/CD stack
in minutes, with the gotchas and security pitfalls already worked out.

---

## 📄 License

MIT — see [LICENSE](../../LICENSE).

---

⭐ **Did this help? Star the repo!** ⭐
