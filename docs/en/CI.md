# GitLab CI/CD setup — end-to-end guide

This guide covers the **full setup** to deploy a NestJS template project from GitLab to a remote VPS via SSH, using a self-hosted GitLab + group runner running in Docker on the GitLab host.

The chain :

```
git push main  →  GitLab pipeline  →  group runner  →  SSH agir2  →  git pull + pnpm install + prod:up
```

No CI variable dependency for SSH — keys live in the project repo (`.deploy/`) so the deploy works on any project of the group with zero GitLab UI configuration.

---

## 1. Prerequisites

- A host (any Linux + Docker) for GitLab + GitLab Runner
- A target VPS reachable via SSH (in our example : `agir2.naskot.fr` on port `51234`, user `debian`)
- The target VPS must have at minimum :
  - A working `git` and `pnpm` (Node.js)
  - Docker + Docker Compose v2
  - The project cloned at the deploy path (e.g. `/var/docker/gestionpratique.ovh/x-ged-extract`)

---

## 2. GitLab + Runner — `docker-compose.yml`

Drop this `docker-compose.yml` on the GitLab host (with a sibling `.env` providing the variables) :

```yaml
services:
  gitlab:
    container_name: "${GITLAB_CONTAINER_NAME}"
    image: "gitlab/gitlab-ce:latest"
    restart: on-failure
    hostname: "${GITLAB_HOST}"
    environment:
      GITLAB_ROOT_EMAIL: "${GITLAB_ROOT_EMAIL}"
      GITLAB_ROOT_PASSWORD: "${GITLAB_ROOT_PASSWORD}"
      GITLAB_OMNIBUS_CONFIG: |
        external_url 'https://${GITLAB_HOST}'
        nginx['listen_port'] = 80
        nginx['listen_https'] = false

        gitlab_rails['smtp_enable'] = ${SMTP_ENABLE}
        gitlab_rails['smtp_address'] = "${SMTP_ADDRESS}"
        gitlab_rails['smtp_port'] = ${SMTP_PORT}
        gitlab_rails['smtp_user_name'] = "${SMTP_USER}"
        gitlab_rails['smtp_password'] = "${SMTP_PASS}"
        gitlab_rails['smtp_domain'] = "${SMTP_DOMAIN}"
        gitlab_rails['smtp_authentication'] = "login"
        gitlab_rails['smtp_enable_starttls_auto'] = true
        gitlab_rails['gitlab_email_from'] = "${SMTP_FROM}"
        gitlab_rails['gitlab_email_reply_to'] = "${SMTP_REPLY_TO}"

        puma['worker_processes'] = 1
        sidekiq['max_concurrency'] = 5
        prometheus_monitoring['enable'] = true

        gitlab_rails['log_level'] = :warn
        sidekiq['log_level'] = :warn
        gitlab_workhorse['log_format'] = "none"

        logrotate['enable'] = true
        logrotate['rotate'] = 7
        logrotate['size'] = '100M'
    ports:
      - "127.0.0.1:${HTTP_PORT}:80"
      - "${SSH_PORT}:22"
    volumes:
      - "./config:/etc/gitlab"
      - "./logs:/var/log/gitlab"
      - "./data:/var/opt/gitlab"
    logging:
      driver: "json-file"
      options:
        max-size: "50M"
        max-file: "3"

  gitlab-runner:
    container_name: "${GITLAB_CONTAINER_NAME}_runner"
    image: "gitlab/gitlab-runner:latest"
    restart: unless-stopped
    depends_on:
      - gitlab
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - gitlab-runner-config:/etc/gitlab-runner
      - ./runner-ssh:/root/.ssh
    environment:
      CI_SERVER_URL: "https://${GITLAB_HOST}"
      REGISTRATION_TOKEN: "${RUNNER_REGISTRATION_TOKEN}"
      RUNNER_NAME: "${GITLAB_CONTAINER_NAME}_runner"
      RUNNER_EXECUTOR: "docker"
      DOCKER_IMAGE: "docker:24"
    entrypoint:
      - /bin/sh
      - -c
      - |
        set -e
        mkdir -p /root/.ssh
        chmod 700 /root/.ssh
        which ssh-keygen >/dev/null 2>&1 || (apt-get update && apt-get install -y --no-install-recommends openssh-client)

        # Generate SSH keypair if missing
        if [ ! -f /root/.ssh/gitlab-runner-deploy ]; then
          echo "[INIT] no SSH key found, generating ed25519 keypair..."
          ssh-keygen -t ed25519 -C "gitlab-runner-deploy" -f /root/.ssh/gitlab-runner-deploy -N ""
          echo "[INIT] === PUBLIC KEY (append to authorized_keys on target hosts) ==="
          cat /root/.ssh/gitlab-runner-deploy.pub
          echo "[INIT] ============================================================="
        fi

        # Generate deploy-bundle (committable files) if missing
        if [ ! -d /root/.ssh/deploy-bundle ]; then
          echo "[INIT] generating deploy-bundle..."
          mkdir -p /root/.ssh/deploy-bundle
          cp /root/.ssh/gitlab-runner-deploy /root/.ssh/deploy-bundle/id_ed25519
          chmod 600 /root/.ssh/deploy-bundle/id_ed25519
          cp /root/.ssh/gitlab-runner-deploy.pub /root/.ssh/deploy-bundle/id_ed25519.pub
          base64 -w0 /root/.ssh/gitlab-runner-deploy > /root/.ssh/deploy-bundle/id_ed25519.b64
          echo "[INIT] deploy-bundle written to /root/.ssh/deploy-bundle/"
        fi

        if [ ! -s /etc/gitlab-runner/config.toml ]; then
          echo "[INIT] no config.toml found, registering runner..."
          gitlab-runner register \
            --non-interactive \
            --url "$$CI_SERVER_URL" \
            --token "$$REGISTRATION_TOKEN" \
            --name "$$RUNNER_NAME" \
            --executor "$$RUNNER_EXECUTOR" \
            --docker-image "$$DOCKER_IMAGE" \
            --docker-privileged \
            --docker-volumes "/var/run/docker.sock:/var/run/docker.sock"
        else
          echo "[INIT] existing config.toml found, skipping registration"
        fi
        exec /entrypoint run --user=gitlab-runner --working-directory=/home/gitlab-runner
    logging:
      driver: "json-file"
      options:
        max-size: "20M"
        max-file: "3"

volumes:
  gitlab-runner-config:
    external: true
```

`.env` (sibling) :

```bash
GITLAB_CONTAINER_NAME=gitlab_ce
GITLAB_HOST=gitlab.example.com
GITLAB_ROOT_EMAIL=admin@example.com
GITLAB_ROOT_PASSWORD=changeme
HTTP_PORT=8080
SSH_PORT=2222
RUNNER_REGISTRATION_TOKEN=glrt-xxxxxxxxx   # group registration token (see step 4)

SMTP_ENABLE=false
SMTP_ADDRESS=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_DOMAIN=
SMTP_FROM=
SMTP_REPLY_TO=
```

Create the external volume once :

```bash
docker volume create gitlab-runner-config
```

---

## 3. First start — auto-generated SSH key

```bash
docker compose up -d
```

At first boot, the runner generates :

```
./runner-ssh/
├── deploy-bundle/
│   ├── id_ed25519        ← private key (committable into .deploy/ of any project)
│   ├── id_ed25519.pub    ← public key
│   └── id_ed25519.b64    ← base64 one-line (alternative: paste into a CI variable)
├── gitlab-runner-deploy
└── gitlab-runner-deploy.pub
```

Verify :

```bash
ls runner-ssh/deploy-bundle/
docker logs ${GITLAB_CONTAINER_NAME}_runner | grep -A1 'PUBLIC KEY'
```

---

## 4. GitLab — group runner registration

(Once per GitLab instance. The runner is at the group level so all projects in the group share it.)

1. In the GitLab UI : create a group (e.g. `gpv2`).
2. Go to **Group → Settings → CI/CD → Runners → New group runner**.
3. Tags : leave empty. Untagged jobs : ✓. Description : `gpv2-group-runner`. Save.
4. Copy the registration token. Paste it as `RUNNER_REGISTRATION_TOKEN` in the `.env`.
5. Restart the runner so it picks up the token :
   ```bash
   docker compose stop gitlab-runner
   docker volume inspect gitlab-runner-config --format '{{ .Mountpoint }}'
   sudo rm /var/lib/docker/volumes/gitlab-runner-config/_data/config.toml
   docker compose up -d gitlab-runner
   ```
6. Group → Settings → CI/CD → Runners → check the runner appears « Online ».

---

## 5. Authorize the runner key on the target VPS

On `agir2.naskot.fr` :

```bash
# as the deploy user (debian)
echo "<contents of runner-ssh/deploy-bundle/id_ed25519.pub>" >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
```

Verify the runner can SSH in (from inside the runner container) :

```bash
docker exec -it ${GITLAB_CONTAINER_NAME}_runner sh -c \
  'ssh -i /root/.ssh/gitlab-runner-deploy -p 51234 debian@agir2.naskot.fr "echo OK"'
```

---

## 6. Project setup — `.deploy/` folder

In the **project repo** (e.g. `gpv2/x-ged-extract`), create :

```
.deploy/
├── id_ed25519        ← copy of runner-ssh/deploy-bundle/id_ed25519 (private key)
└── known_hosts       ← see below
```

Generate `known_hosts` once (any host with network access to agir2) :

```bash
ssh-keyscan -p 51234 agir2.naskot.fr > .deploy/known_hosts
```

Commit and push the `.deploy/` folder. ⚠ The private key lives in the repo — make sure the repo is private and trusted.

---

## 7. `.gitlab-ci.yml`

In the project root :

```yaml
# GitLab CI/CD pipeline for x-ged-extract
# develop : pnpm test:up
# main    : pnpm test:up → (auto on green) deploy SSH agir2 + git pull + prod:down/up
# SSH key + known_hosts read from repo files (no CI variables, no GitLab UI dependency)

workflow:
  rules:
    - if: $CI_COMMIT_TAG
      when: never
    - if: $CI_COMMIT_BRANCH == "develop"
    - if: $CI_COMMIT_BRANCH == "main"
    - when: never

stages:
  - test
  - deploy

variables:
  DOCKER_DRIVER: overlay2
  DOCKER_TLS_CERTDIR: ""
  PNPM_VERSION: "10.33.0"
  HUSKY: "0"
  DEPLOY_HOST: "agir2.naskot.fr"
  DEPLOY_USER: "debian"
  DEPLOY_PORT: "51234"
  DEPLOY_PATH: "/var/docker/gestionpratique.ovh/x-ged-extract"

cache:
  key:
    files:
      - pnpm-lock.yaml
  paths:
    - .pnpm-store/
    - node_modules/

# stage 1 — test (develop + main)
pnpm-test-up:
  stage: test
  interruptible: true
  image: docker:24
  services:
    - docker:24-dind
  before_script:
    - apk add --no-cache nodejs npm bash git
    - npm install -g pnpm@${PNPM_VERSION}
    - pnpm install --frozen-lockfile
  script:
    - pnpm run test:up -- --rabbitmq --adminui --minio --mariadb --pgsql
  after_script:
    - pnpm run test:down || true
  rules:
    - if: $CI_COMMIT_BRANCH == "develop"
    - if: $CI_COMMIT_BRANCH == "main"
  timeout: 30 minutes

# stage 2 — deploy (main only, auto on green tests)
deploy-prod:
  stage: deploy
  image: alpine:3
  needs:
    - job: pnpm-test-up
      artifacts: false
  cache: []
  before_script:
    - apk add --no-cache openssh-client
    - mkdir -p ~/.ssh
    - chmod 700 ~/.ssh
    - cp .deploy/id_ed25519 ~/.ssh/id_ed25519
    - chmod 600 ~/.ssh/id_ed25519
    - cp .deploy/known_hosts ~/.ssh/known_hosts
    - chmod 644 ~/.ssh/known_hosts
  script:
    - |
      ssh -o BatchMode=yes -o ConnectTimeout=15 -o ServerAliveInterval=30 -o ServerAliveCountMax=10 \
          -p "$DEPLOY_PORT" "$DEPLOY_USER@$DEPLOY_HOST" "
        set -euo pipefail
        cd $DEPLOY_PATH
        git fetch origin main
        git checkout -B main origin/main
        git reset --hard origin/main
        pnpm install
        pnpm prod:down || true
        pnpm prod:up --rabbitmq --adminui --minio --mariadb --pgsql
      "
  rules:
    - if: $CI_COMMIT_BRANCH == "main"
  environment:
    name: production
    url: https://${DEPLOY_HOST}
  timeout: 15 minutes
```

---

## 8. Initial clone on the target VPS

Once on `agir2.naskot.fr`, as `debian` :

```bash
sudo mkdir -p /var/docker/gestionpratique.ovh
sudo chown -R debian:debian /var/docker/gestionpratique.ovh
cd /var/docker/gestionpratique.ovh
git clone -b main <project-https-or-ssh-url> x-ged-extract
cd x-ged-extract
pnpm install     # generates .env.dev/.env.prod/.env.test via postinstall
```

(`.env.prod` is auto-generated by the `postinstall` script of the boilerplate. Edit it if production credentials differ from the random defaults.)

---

## 9. Pipeline flow

| Branch / event      | Stages run                               | Effect                            |
| ------------------- | ---------------------------------------- | --------------------------------- |
| push `develop`      | `pnpm-test-up`                           | Validates the tree                |
| push `main`         | `pnpm-test-up` → (green) → `deploy-prod` | Validates + auto-deploys to agir2 |
| push tag, MR, other | none (filtered by `workflow.rules`)      |                                   |

Deploy job steps (on agir2) :

1. `git fetch origin main`
2. `git reset --hard origin/main` (handles any local divergence)
3. `pnpm install` (regenerates `node_modules` + auto-creates missing `.env.*`)
4. `pnpm prod:down` (stops containers)
5. `pnpm prod:up --rabbitmq --adminui --minio --mariadb --pgsql` (rebuilds + starts)

---

## 10. Troubleshooting

| Symptom                                             | Cause                                                    | Fix                                                                   |
| --------------------------------------------------- | -------------------------------------------------------- | --------------------------------------------------------------------- |
| `base64: : No such file or directory` in deploy job | CI variable missing or empty                             | Ensure `.deploy/id_ed25519` is committed, not relying on CI variables |
| `Permission denied (publickey)`                     | Public key not in `authorized_keys` on target            | Re-do step 5                                                          |
| `fatal: Not possible to fast-forward`               | Local main on agir2 has diverged from origin             | The deploy already uses `git reset --hard` — should self-heal         |
| `pnpm: command not found` on agir2                  | pnpm/Node missing on target                              | Install Node 22+ and pnpm on agir2                                    |
| `REDIS_PERSIST_USER missing`                        | `.env.prod` not populated                                | `pnpm install` on agir2 once to auto-generate, then edit values       |
| Runner offline                                      | `RUNNER_REGISTRATION_TOKEN` invalid or stale config.toml | Re-do step 4 (wipe config.toml + restart)                             |

---

## 11. Re-using on other projects

For each new project in the same group :

1. Copy `.deploy/id_ed25519` and `.deploy/known_hosts` from this project (or regenerate `known_hosts` if the target is different).
2. Copy `.gitlab-ci.yml` and adapt `DEPLOY_*` variables.
3. Clone the project on the target VPS at the path matching `DEPLOY_PATH`.
4. Push to main → done.

No GitLab UI config required (no protected branches dance, no Project Access Tokens, no CI variables).

---

## 12. Key rotation

If the runner SSH key is leaked or you want to rotate :

1. Stop the runner : `docker compose stop gitlab-runner`
2. Delete `runner-ssh/gitlab-runner-deploy*` and `runner-ssh/deploy-bundle/`
3. Restart : `docker compose up -d gitlab-runner` → new keypair generated
4. Add new public to `authorized_keys` on agir2 (and remove old)
5. Update `.deploy/id_ed25519` in every project that uses this runner

---
