# 🚀 GitLab Docker Setup

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Docker](https://img.shields.io/badge/Docker-20.10+-blue.svg)](https://docker.com)
[![GitLab CE](https://img.shields.io/badge/GitLab-CE-orange.svg)](https://gitlab.com)

Self-host **GitLab Community Edition** + a **Group Runner** with Docker
Compose in under 5 minutes. Includes ready-to-use Apache/Nginx
reverse-proxy configs, optional SMTP, and a battle-tested CI/CD setup
for SSH-based deployments.

---

## 📚 Documentation

- 🇬🇧 [English](docs/en/README.md) — main setup guide
- 🇫🇷 [Français](docs/fr/README.md) — guide d'installation

For the full CI/CD + SSH-deploy walkthrough:

- 🇬🇧 [CI/CD guide (EN)](docs/en/CI.md)
- 🇫🇷 [Guide CI/CD (FR)](docs/fr/CI.md)

## 🧹 Optional: Auto-clean unused Docker volumes

CI jobs that run Docker Compose tests can leave unused volumes behind
(`node_modules`, build artifacts, runner cache volumes, anonymous volumes,
and so on). If the host runs several projects, avoid deleting volumes by
project name. A safer generic cleanup is to remove only Docker volumes that
are already marked as dangling/unused.

Preview what would be removed:

```bash
sudo docker volume ls -f dangling=true --format 'table {{.Name}}\t{{.Driver}}\t{{.Scope}}'
```

Run the cleanup manually:

```bash
sudo sh -c 'docker volume ls -qf dangling=true | xargs -r docker volume rm'
```

Install a daily cron job at 03:00:

```bash
sudo tee /etc/cron.d/docker-volume-cleanup >/dev/null <<'EOF'
# Remove unused Docker volumes every day at 03:00.
SHELL=/bin/sh
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

0 3 * * * root docker volume ls -qf dangling=true | xargs -r docker volume rm >/dev/null 2>&1
EOF

sudo chmod 644 /etc/cron.d/docker-volume-cleanup
sudo chown root:root /etc/cron.d/docker-volume-cleanup
```

Verify the installed cron file:

```bash
cat /etc/cron.d/docker-volume-cleanup
```

This does not remove volumes attached to existing containers. It should not
touch active volumes such as `portainer_data`, `rabbitmq_*`, or a mounted
GitLab Runner config volume/path while they are in use.

---

## 📜 Changelog

See [CHANGELOG.md](CHANGELOG.md).

## 📄 License

MIT — see [LICENSE](LICENSE).
