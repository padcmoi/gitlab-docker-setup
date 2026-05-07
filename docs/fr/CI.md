# GitLab CI/CD — guide complet déploiement SSH

_[🇬🇧 English version](../en/CI.md) | 🇫🇷 Version française_

Ce guide décrit l'**installation complète** pour déployer n'importe quel
projet d'un groupe GitLab vers un serveur distant via SSH, en utilisant
le GitLab + Group Runner auto-hébergés fournis par ce template.

La chaîne :

```
git push main → pipeline GitLab → Group Runner → SSH serveur cible → git pull + build
```

La **clé SSH de déploiement vit dans une seule variable CI/CD au niveau du
groupe** (`SSH_PRIVATE_KEY_B64`, encodée en base64, `Masquée et cachée`).
Tous les projets du groupe en héritent automatiquement. **Aucun secret ne
vit jamais dans un repo de projet.**

---

## TL;DR

1. Démarrer GitLab + Runner avec `docker compose up -d`. Le runner
   auto-génère une paire de clés ed25519 et un `deploy-bundle/`.
2. Sur chaque serveur cible : ajouter `id_ed25519.pub` à
   `~/.ssh/authorized_keys`.
3. Dans l'UI GitLab : créer un Groupe, enregistrer le runner, puis créer
   une **Variable CI/CD de groupe** nommée `SSH_PRIVATE_KEY_B64`, type
   `Variable`, visibilité `Masquée et cachée`, valeur = contenu de
   `id_ed25519.b64`.
4. Dans chaque projet du groupe : ajouter un `.gitlab-ci.yml` qui décode la
   clé au moment du job et fait le SSH vers la cible.

---

## 1. Pré-requis

- Un serveur (Linux + Docker) pour GitLab + GitLab Runner — couvert par le
  `docker-compose.yml` de ce template.
- Un ou plusieurs serveurs cibles joignables en SSH pour les déploiements.
- Un reverse proxy devant GitLab pour la terminaison TLS (configs d'exemple
  dans ce repo : `apache-gitlab.conf`, `nginx-gitlab.conf`).

---

## 2. Démarrer GitLab + Runner

Suivre le [README principal](README.md) (ou la [version anglaise](../en/README.md)).

Au premier boot, l'entrypoint du container runner (idempotent) :

- Génère une paire ed25519 dans `/root/.ssh/gitlab-runner-deploy[.pub]` si
  absente.
- Génère un `deploy-bundle/` contenant 3 copies prêtes à l'emploi :
  - `id_ed25519` — clé privée brute (backup/inspection uniquement, **ne jamais
    commiter**).
  - `id_ed25519.pub` — clé publique (à installer sur les serveurs cibles).
  - `id_ed25519.b64` — base64 sur une seule ligne (la valeur à coller dans
    la variable de groupe GitLab).
- Enregistre le runner auprès de GitLab si `config.toml` est absent.

Vérification après démarrage :

```bash
ls runner-ssh/deploy-bundle/
# → id_ed25519  id_ed25519.b64  id_ed25519.pub

docker logs ${GITLAB_CONTAINER_NAME}_runner | grep -A1 'PUBLIC KEY'
# → ssh-ed25519 AAAA... gitlab-runner-deploy
```

---

## 3. Créer un groupe GitLab et enregistrer le runner

(One-shot, dans l'UI GitLab.)

1. En haut à gauche → **Nouveau groupe** → nommez-le (ex : `monorg`).
2. **Groupe → Paramètres → CI/CD → Runners → Nouveau runner de groupe**.
   - Tags : laisser vide.
   - Tâches sans tag : ✓ Run untagged jobs.
   - Description : `monorg-group-runner`.
   - Save → copier le token affiché.
3. Coller le token comme `RUNNER_REGISTRATION_TOKEN` dans `.env`.
4. Redémarrer le runner pour qu'il le reprenne :
   ```bash
   docker compose stop gitlab-runner
   sudo rm "$(docker volume inspect gitlab-runner-config --format '{{ .Mountpoint }}')/config.toml"
   docker compose up -d gitlab-runner
   ```
5. Groupe → Paramètres → CI/CD → Runners → vérifier que le runner apparaît
   « Online ».

---

## 4. Autoriser la clé du runner sur chaque serveur cible

Pour chaque serveur que vous comptez déployer (souvent un seul) :

```bash
# Sur le serveur cible, sous l'utilisateur du déploiement (souvent `debian`) :
echo "<contenu de runner-ssh/deploy-bundle/id_ed25519.pub>" >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
```

C'est tout. Tous les projets du groupe peuvent désormais utiliser la clé
privée du runner pour déployer sur ce serveur.

Test depuis le container runner :

```bash
docker exec -it ${GITLAB_CONTAINER_NAME}_runner sh -c \
  'ssh -o StrictHostKeyChecking=accept-new -p <SSH_PORT> <USER>@<HOST> "echo OK"'
```

---

## 5. Créer la variable CI/CD de groupe (la pièce maîtresse)

C'est ce qui rend le déploiement réutilisable sur tous les projets du
groupe sans jamais mettre de secret dans un repo.

Ouvrir : **Groupe → Paramètres → CI/CD → Variables → Ajouter une variable**.

| Champ | Valeur |
|---|---|
| **Type** | `Variable` |
| **Environnements** | `*` (Tous) |
| **Visibilité** | **`Masquée et cachée`** |
| **Drapeaux → Protéger la variable** | décoché (voir note ci-dessous) |
| **Drapeaux → Étendre la référence** | laisser coché (par défaut) |
| **Clé** | `SSH_PRIVATE_KEY_B64` |
| **Valeur** | l'intégralité de `runner-ssh/deploy-bundle/id_ed25519.b64` (chaîne base64 sur une seule ligne) |

**Pourquoi ces choix :**

- **Type `Variable`** (pas `Fichier`) : le type `Fichier` de GitLab corrompt
  parfois les valeurs multi-lignes collées via l'UI (sauts de ligne,
  whitespace de fin), ce qui provoque `error in libcrypto` au runtime.
  Stocker la clé en base64 sur une ligne et décoder au job contourne
  totalement ce problème.
- **`Masquée et cachée`** : une fois sauvegardée, **la valeur ne peut plus
  être lue depuis l'UI ou l'API** — même par les Owners ou admins. Pour
  rotater, il faut delete + recreate. C'est la protection la plus forte
  contre les fuites silencieuses UI/API.
- **Non Protégée** : une variable Protégée n'est exposée qu'aux pipelines
  sur des branches/tags Protected. Si vous la Protégez, vous devez aussi
  marquer chaque branche déployante (typiquement `main`) comme Protected —
  voir étape 6. On peut commencer non-protégée (plus simple) et durcir plus
  tard.

Pour récupérer la valeur depuis le host :

```bash
cat runner-ssh/deploy-bundle/id_ed25519.b64
# → copier toute la sortie (une ligne) et la coller dans le champ Valeur de l'UI
```

---

## 6. (Recommandé) Protéger `main` sur chaque projet

C'est ce qui rend une variable `SSH_PRIVATE_KEY_B64` Protégée réellement
utilisable, ET empêche des branches feature aléatoires de lancer des
pipelines qui pourraient tenter d'exfiltrer la clé.

Pour chaque projet : **Paramètres → Dépôt → Règles des branches → Ajouter
une règle**.

| Champ | Valeur |
|---|---|
| Nom de la branche | `main` |
| Autorisés à pousser et fusionner | le rôle qui pousse en prod (souvent `Maintainers`) |
| Autorisés à fusionner | idem |
| Autoriser les poussées forcées | décoché |

Pour le **groupe entier** à l'avenir, vous pouvez aussi pré-régler ça au
niveau groupe : **Groupe → Paramètres → Général → Permissions et
fonctionnalités du groupe → Protection initiale de la branche par défaut →
"Protégée"**. Cela ne s'applique qu'aux **nouveaux projets** créés ensuite ;
les projets existants doivent être réglés un par un (ou via l'API GitLab).

---

## 7. `.gitlab-ci.yml` du projet

Un template réutilisable que tout projet du groupe peut adopter en
ajustant uniquement 5 variables :

```yaml
# CI/CD pipeline — template générique microservice NestJS API.
#
# Customisez les 5 variables marquées # CUSTOMIZE par projet. Tout le reste
# est partagé : la clé SSH vient de la variable de groupe, le runner est
# inscrit au niveau groupe.

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
  # === CUSTOMIZE par projet =================================================
  DEPLOY_HOST: "votre-cible.exemple.com"               # CUSTOMIZE
  DEPLOY_USER: "debian"                                # CUSTOMIZE
  DEPLOY_PORT: "22"                                    # CUSTOMIZE
  DEPLOY_PATH: "/var/docker/votre-org/votre-projet"    # CUSTOMIZE
  COMPOSE_PROFILES_DEPLOY: "--mariadb"                 # CUSTOMIZE
  # === Constantes — ne pas modifier ========================================
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

# Stage 2 — deploy (main uniquement, auto si tests verts)
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
    # Décoder la clé depuis la variable groupe Hidden vers un vrai fichier.
    - echo "$SSH_PRIVATE_KEY_B64" | base64 -d > ~/.ssh/id_ed25519
    - chmod 600 ~/.ssh/id_ed25519
    # Fail-fast si la clé décodée est invalide.
    - ssh-keygen -lf ~/.ssh/id_ed25519
    # TOFU sur les fingerprints d'hôte (pas de known_hosts à maintenir).
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

**Points clés :**

- Le job deploy décode `$SSH_PRIVATE_KEY_B64` dans `~/.ssh/id_ed25519` au
  tout début, puis `ssh-keygen -lf` valide la clé en fail-fast (en imprimant
  son empreinte SHA256 dans les logs du job).
- `StrictHostKeyChecking=accept-new` + `UserKnownHostsFile=/dev/null`
  supprime tout besoin de maintenir un `known_hosts` statique. Les
  fingerprints du premier contact sont acceptés automatiquement ; les
  nouveaux serveurs cibles ne nécessitent aucun changement par projet.

---

## 8. Clone initial sur le serveur cible

Une fois par projet, avant le premier déploiement :

```bash
# Sur le serveur cible, en tant qu'utilisateur de déploiement
sudo mkdir -p /var/docker/votre-org
sudo chown -R debian:debian /var/docker/votre-org
cd /var/docker/votre-org
git clone -b main <project-https-or-ssh-url> votre-projet
cd votre-projet
pnpm install      # génère .env.dev/.env.prod/.env.test si le projet en a besoin
```

---

## 9. Flux de pipeline

| Branche / event | Stages joués | Effet |
|---|---|---|
| push `develop` | `pnpm-test-up` | Valide l'arbre |
| push `main` | `pnpm-test-up` → (vert) → `deploy-prod` | Valide + déploie auto |
| push tag, MR, autre | aucun (filtré par `workflow.rules`) | |

Actions du job deploy (sur le serveur cible) :

1. `git fetch origin main`
2. `git reset --hard origin/main` (gère toute divergence locale)
3. `pnpm install`
4. `pnpm prod:down`
5. `pnpm prod:up <profils>`

---

## 10. Réutilisation sur d'autres projets du groupe

Pour chaque nouveau projet du groupe :

1. Déposer le même `.gitlab-ci.yml` (ci-dessus) dans le projet.
2. Ajuster les 5 variables `# CUSTOMIZE` pour la cible.
3. (Si vous avez Protected la variable à l'étape 5) protéger `main` sur le
   nouveau projet (étape 6).
4. Cloner le projet sur le serveur cible au chemin de `DEPLOY_PATH`.
5. Push sur `main`.

**Aucune variable UI à créer par projet.** Aucun dossier `.deploy/`. Aucun
secret dans le repo.

---

## 11. Rotation de la clé SSH

À faire si la clé est leakée, ou par hygiène tous les N mois.

1. **Générer une nouvelle paire sur le runner** (même VPS que GitLab) :
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
     echo "=== NOUVELLE CLÉ PUBLIQUE ==="
     cat /root/.ssh/gitlab-runner-deploy.pub
     echo "============================="
   '
   ```
2. **Ajouter la nouvelle pubkey** à `~/.ssh/authorized_keys` sur chaque
   serveur cible **avant** de retirer l'ancienne. Tester le SSH avec la
   nouvelle clé.
3. **Retirer l'ancienne pubkey** de `~/.ssh/authorized_keys` sur chaque
   cible.
4. **Mettre à jour la variable de groupe GitLab** : comme
   `SSH_PRIVATE_KEY_B64` est `Masquée et cachée`, la valeur n'est pas
   éditable — il faut delete + recreate. Groupe → Paramètres → CI/CD →
   Variables :
   - 🗑️ supprimer `SSH_PRIVATE_KEY_B64`
   - Ajouter une variable avec les mêmes réglages qu'à l'étape 5, valeur =
     nouveau `id_ed25519.b64`.
5. Relancer le dernier pipeline de déploiement pour vérifier.

---

## 12. Dépannage

| Symptôme | Cause | Fix |
|---|---|---|
| `error in libcrypto` dans le job deploy | La valeur de la clé a été corrompue (sauts de ligne, BOM…) en passant par l'UI GitLab | Utiliser base64 + type `env_var` comme documenté ; vérifier avec `ssh-keygen -lf` après décodage |
| `Permission denied (publickey)` | Pubkey absente sur le serveur cible, ou mauvais utilisateur | Refaire l'étape 4 sur le bon user/serveur |
| Variable vide dans le job, deploy fail avant SSH | Variable Protégée mais branche pas Protected | Soit décocher Protected (étape 5) soit protéger la branche (étape 6) |
| Runner offline | `RUNNER_REGISTRATION_TOKEN` invalide ou `config.toml` obsolète | Refaire l'étape 3 (wipe `config.toml` + restart) |
| Pipeline ne démarre jamais | `workflow.rules` a filtré l'event (ex : tag) | Vérifier le bloc `workflow.rules` du `.gitlab-ci.yml` |

---

## Alternative legacy (dépréciée — ne pas utiliser pour les nouveaux setups)

Les anciennes versions de ce guide stockaient la clé privée directement
dans chaque repo de projet à `.deploy/id_ed25519`, et les fingerprints
d'hôte à `.deploy/known_hosts`. **Ce n'est plus recommandé :**

- Une clé privée fuitée dans l'historique git y reste à jamais — même
  après suppression, elle doit être considérée comme définitivement
  compromise.
- Chaque projet porte sa propre copie du secret → rotation cohérente
  difficile.
- N'importe qui ayant accès en lecture au repo (actuel ou futur, y
  compris via les backups) a la clé.

Si vous avez un projet existant utilisant ce pattern, migrez vers le
workflow `SSH_PRIVATE_KEY_B64` ci-dessus et rotater la clé.
