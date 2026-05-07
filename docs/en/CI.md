# GitLab CI/CD — end-to-end SSH-deploy guide

_🇬🇧 English | [🇫🇷 Version française](../fr/CI.md)_

This guide covers the **complete setup** for deploying any project of a GitLab
group to a remote server via SSH, using the self-hosted GitLab + Group Runner
shipped by this template.

The chain:

```
git push main → GitLab pipeline → Group Runner → SSH target server → git pull + build
```

The **deploy SSH key lives in a single GitLab group-level CI/CD variable**
(`SSH_PRIVATE_KEY_B64`, base64-encoded, `Masked and hidden`). Every project of
the group inherits it automatically. **Nothing secret ever lives in a project
repo.**

---

## TL;DR

1. Spin up GitLab + Runner with `docker compose up -d`. The runner
   auto-generates an ed25519 keypair and a `deploy-bundle/`.
2. On every target server: append `id_ed25519.pub` to
   `~/.ssh/authorized_keys`.
3. In the GitLab UI: create a Group, register the runner, then create a
   **Group CI/CD Variable** named `SSH_PRIVATE_KEY_B64`, type `Variable`,
   visibility `Masked and hidden`, value = content of `id_ed25519.b64`.
4. In each project of the group: add a `.gitlab-ci.yml` that decodes the key
   at job time and SSHes to the target.

---

## 1. Prerequisites

- A host (Linux + Docker) for GitLab + GitLab Runner — covered by the main
  `docker-compose.yml` of this template.
- One or more target servers reachable via SSH for deploys.
- A reverse proxy in front of GitLab for TLS termination (sample configs in
  this repo: `apache-gitlab.conf`, `nginx-gitlab.conf`).

---

## 2. Bring GitLab + Runner up

Follow the main [README](README.md) (or the [French version](../fr/README.md)).

The runner container, on first boot, runs an idempotent entrypoint that:

- Generates an ed25519 keypair at `/root/.ssh/gitlab-runner-deploy[.pub]`
  if missing.
- Generates a `deploy-bundle/` containing 3 ready-to-use copies:
  - `id_ed25519` — raw private key (backup/inspection only, **never commit**).
  - `id_ed25519.pub` — public key (to install on target servers).
  - `id_ed25519.b64` — base64 single-line (the value to paste into the GitLab
    Group CI Variable).
- Registers the runner with GitLab if `config.toml` is missing.

Verify after start:

```bash
ls runner-ssh/deploy-bundle/
# → id_ed25519  id_ed25519.b64  id_ed25519.pub

docker logs ${GITLAB_CONTAINER_NAME}_runner | grep -A1 'PUBLIC KEY'
# → ssh-ed25519 AAAA... gitlab-runner-deploy
```

---

## 3. Create a GitLab group and register the runner

(One-shot, in the GitLab UI.)

1. Top-left → **New group** → name it (e.g. `myorg`).
2. **Group → Settings → CI/CD → Runners → New group runner**.
   - Tags: leave empty.
   - Untagged jobs: ✓ Run untagged jobs.
   - Description: `myorg-group-runner`.
   - Save → copy the registration token shown.
3. Paste the token as `RUNNER_REGISTRATION_TOKEN` in `.env`.
4. Restart the runner so the entrypoint picks it up:
   ```bash
   docker compose stop gitlab-runner
   sudo rm "$(docker volume inspect gitlab-runner-config --format '{{ .Mountpoint }}')/config.toml"
   docker compose up -d gitlab-runner
   ```
5. Group → Settings → CI/CD → Runners → confirm the runner appears « Online ».

---

## 4. Authorize the runner key on each target server

For every server you intend to deploy to (in the simplest case: just one):

```bash
# On the target server, as the user the deploy will use (often `debian`):
echo "<contents of runner-ssh/deploy-bundle/id_ed25519.pub>" >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
```

That's it. Every gpv2 project deploying to this server can now use the
runner's private key.

Sanity check from the runner container:

```bash
docker exec -it ${GITLAB_CONTAINER_NAME}_runner sh -c \
  'ssh -o StrictHostKeyChecking=accept-new -p <SSH_PORT> <USER>@<HOST> "echo OK"'
```

---

## 5. Create the Group CI/CD Variable (the key piece)

This is what makes the deploy reusable across every project of the group
without ever putting a secret in a repo.

Open: **Group → Settings → CI/CD → Variables → Add variable**.

| Field | Value |
|---|---|
| **Type** | `Variable` |
| **Environments** | `*` (All) |
| **Visibility** | **`Masked and hidden`** |
| **Flags → Protect variable** | unchecked (see note below) |
| **Flags → Expand variable reference** | leave checked (default) |
| **Key** | `SSH_PRIVATE_KEY_B64` |
| **Value** | the entire content of `runner-ssh/deploy-bundle/id_ed25519.b64` (a single-line base64 string) |

**Why these choices:**

- **Type `Variable`** (not `File`): GitLab's `File` type sometimes mangles
  multi-line values pasted from the UI (line endings, trailing whitespace),
  causing `error in libcrypto` at runtime. Storing the key as a single-line
  base64 string and decoding at job time bypasses this entirely.
- **`Masked and hidden`**: once saved, **the value cannot be retrieved from
  the UI or API** — even by Owners or admins. To rotate, you delete + recreate.
  This is the strongest protection against silent UI/API leaks.
- **Not Protected**: a Protected variable is only exposed to pipelines on
  Protected branches/tags. If you Protect it, you must also mark every
  deploying branch (typically `main`) as Protected — see step 7. You can
  start unprotected (simpler) and tighten later.

To populate the value from the host:

```bash
cat runner-ssh/deploy-bundle/id_ed25519.b64
# → copy the entire single-line output and paste it into the UI Value field
```

---

## 6. (Recommended) Protect `main` on each project

This is what makes a Protected `SSH_PRIVATE_KEY_B64` actually usable, AND
prevents random feature branches from running pipelines that could try to
exfiltrate the key.

For each project: **Settings → Repository → Branch rules → Add branch rule**.

| Field | Value |
|---|---|
| Branch name | `main` |
| Allowed to push and merge | the role you trust to deploy (usually `Maintainers`) |
| Allowed to merge | same |
| Allow force push | unchecked |

For the **whole group** going forward, you can also pre-set this at the
group level: **Group → Settings → General → Permissions and group
features → Default branch protection → "Protected"**. This applies only to
**newly-created** projects in the group; existing projects must be done
one-by-one (or via the GitLab API).

---

## 7. Project `.gitlab-ci.yml`

A reusable template that any project of the group can drop in, customizing
only 5 variables:

```yaml
# CI/CD pipeline — generic gpv2 NestJS API microservice template.
#
# Customize the 5 # CUSTOMIZE variables below per project. Everything else
# is shared and ships from the GitLab Group CI/CD Variables (the SSH key)
# and the runner.

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
  # === CUSTOMIZE per project ================================================
  DEPLOY_HOST: "your-target.example.com"               # CUSTOMIZE
  DEPLOY_USER: "debian"                                # CUSTOMIZE
  DEPLOY_PORT: "22"                                    # CUSTOMIZE
  DEPLOY_PATH: "/var/docker/your-org/your-project"     # CUSTOMIZE
  COMPOSE_PROFILES_DEPLOY: "--mariadb"                 # CUSTOMIZE
  # === Constants — do not modify ============================================
  DOCKER_DRIVER: overlay2
  DOCKER_TLS_CERTDIR: ""
  PNPM_VERSION: "10.33.0"
  HUSKY: "0"

cache:
  key:
    files:
      - pnpm-lock.yaml
  paths:
    - .pnpm-store/
    - node_modules/

# Stage 1 — test (develop + main)
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
    - pnpm run test:up -- $COMPOSE_PROFILES_DEPLOY
  after_script:
    - pnpm run test:down || true
  rules:
    - if: $CI_COMMIT_BRANCH == "develop"
    - if: $CI_COMMIT_BRANCH == "main"
  timeout: 30 minutes

# Stage 2 — deploy (main only, auto on green tests)
deploy-prod:
  stage: deploy
  image: alpine:3
  needs:
    - job: pnpm-test-up
      artifacts: false
  cache: []
  before_script:
    - apk add --no-cache openssh-client
    - mkdir -p ~/.ssh && chmod 700 ~/.ssh
    # Decode the key from the group-level Hidden variable into a real file.
    - echo "$SSH_PRIVATE_KEY_B64" | base64 -d > ~/.ssh/id_ed25519
    - chmod 600 ~/.ssh/id_ed25519
    # Fail fast if the decoded key is malformed.
    - ssh-keygen -lf ~/.ssh/id_ed25519
    # TOFU host fingerprints (no static known_hosts to maintain).
    - |
      cat > ~/.ssh/config <<EOF
      Host *
        StrictHostKeyChecking=accept-new
        UserKnownHostsFile=/dev/null
        LogLevel=ERROR
      EOF
    - chmod 600 ~/.ssh/config
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
        pnpm prod:up $COMPOSE_PROFILES_DEPLOY
      "
  rules:
    - if: $CI_COMMIT_BRANCH == "main"
  environment:
    name: production
    url: https://${DEPLOY_HOST}
  timeout: 15 minutes
```

**Key points:**

- The deploy job decodes `$SSH_PRIVATE_KEY_B64` into `~/.ssh/id_ed25519` at
  the very start, then `ssh-keygen -lf` validates the key as a fail-fast
  sanity check (printing its SHA256 fingerprint into the job log).
- `StrictHostKeyChecking=accept-new` + `UserKnownHostsFile=/dev/null`
  removes any need to maintain a static `known_hosts`. First-contact
  fingerprints are accepted automatically; new target servers don't need any
  per-project change.

---

## 8. Initial clone on the target server

Once per project, before the first deploy:

```bash
# On the target server, as the deploy user
sudo mkdir -p /var/docker/your-org
sudo chown -R debian:debian /var/docker/your-org
cd /var/docker/your-org
git clone -b main <project-https-or-ssh-url> your-project
cd your-project
pnpm install      # generates .env.dev/.env.prod/.env.test if your project uses them
```

---

## 9. Pipeline flow

| Branch / event | Stages run | Effect |
|---|---|---|
| push `develop` | `pnpm-test-up` | Validates the tree |
| push `main` | `pnpm-test-up` → (green) → `deploy-prod` | Validates + auto-deploys |
| push tag, MR, other | none (filtered by `workflow.rules`) | |

Deploy job actions (on the target server):

1. `git fetch origin main`
2. `git reset --hard origin/main` (handles any local divergence)
3. `pnpm install`
4. `pnpm prod:down`
5. `pnpm prod:up <profiles>`

---

## 10. Re-using on other projects in the group

For each new project in the group:

1. Drop the same `.gitlab-ci.yml` (above) into the project root.
2. Adjust the 5 `# CUSTOMIZE` variables for the target.
3. (If you Protected the variable in step 5) protect `main` on the new
   project (step 6).
4. Clone the project on the target server at the path matching `DEPLOY_PATH`.
5. Push to `main`.

**No GitLab UI variable to create per project.** No `.deploy/` folder. No
secret in the repo.

---

## 11. Rotating the SSH key

Do this if the key is leaked, or as routine hygiene every N months.

1. **Generate a new keypair on the runner** (same VPS as GitLab):
   ```bash
   docker exec ${GITLAB_CONTAINER_NAME}_runner sh -c '
     rm -f /root/.ssh/gitlab-runner-deploy /root/.ssh/gitlab-runner-deploy.pub
     rm -rf /root/.ssh/deploy-bundle
     ssh-keygen -t ed25519 -C "gitlab-runner-deploy" -f /root/.ssh/gitlab-runner-deploy -N ""
     mkdir -p /root/.ssh/deploy-bundle
     cp /root/.ssh/gitlab-runner-deploy /root/.ssh/deploy-bundle/id_ed25519
     chmod 600 /root/.ssh/deploy-bundle/id_ed25519
     cp /root/.ssh/gitlab-runner-deploy.pub /root/.ssh/deploy-bundle/id_ed25519.pub
     base64 -w0 /root/.ssh/gitlab-runner-deploy > /root/.ssh/deploy-bundle/id_ed25519.b64
     echo "=== NEW PUBLIC KEY ==="
     cat /root/.ssh/gitlab-runner-deploy.pub
     echo "======================"
   '
   ```
2. **Add the new pubkey** to `~/.ssh/authorized_keys` on every target server
   **before** removing the old one. Test SSH with the new key.
3. **Remove the old pubkey** from `~/.ssh/authorized_keys` on every target.
4. **Update the GitLab Group Variable**: since `SSH_PRIVATE_KEY_B64` is
   `Masked and hidden`, you cannot edit the value — you must delete and
   recreate. Group → Settings → CI/CD → Variables:
   - 🗑️ delete `SSH_PRIVATE_KEY_B64`
   - Add variable with the same settings as step 5, value = new
     `id_ed25519.b64`.
5. Re-run the latest deploy pipeline to verify.

---

## 12. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `error in libcrypto` in deploy job | Key value got mangled (line endings, BOM, etc.) when entering GitLab UI | Use base64 + `env_var` type as documented; verify with `ssh-keygen -lf` after decode |
| `Permission denied (publickey)` | Public key not on the target server, or wrong user | Re-do step 4 on the right user/server |
| Variable empty in the job, deploy fails before SSH | Variable is Protected but the branch is not | Either uncheck Protected (step 5) or protect the branch (step 6) |
| Runner offline | `RUNNER_REGISTRATION_TOKEN` invalid or stale `config.toml` | Re-do step 3 (wipe `config.toml` + restart) |
| Pipeline never starts | `workflow.rules` filtered out the event (e.g. tag) | Check the rules block of `.gitlab-ci.yml` |

---

## Legacy alternative (deprecated — do not use for new setups)

Older versions of this guide stored the private key directly in each
project repo at `.deploy/id_ed25519` and the host fingerprints at
`.deploy/known_hosts`. **This is no longer recommended:**

- A leaked private key in git history stays there forever — even after
  removal, it must be considered permanently compromised.
- Every project carries its own copy of the secret → harder to rotate
  consistently.
- Anyone with read access to the repo (current or future, including via
  backups) has the key.

If you have an existing project using this pattern, migrate to the
`SSH_PRIVATE_KEY_B64` group variable workflow above and rotate the key.
