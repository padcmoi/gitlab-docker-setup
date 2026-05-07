# 🚀 GitLab Docker Setup

_[🇬🇧 English version](../en/README.md) | 🇫🇷 Version française_

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Docker](https://img.shields.io/badge/Docker-20.10+-blue.svg)](https://docker.com)
[![GitLab CE](https://img.shields.io/badge/GitLab-CE-orange.svg)](https://gitlab.com)

> **Auto-héberger GitLab Community Edition + un Group Runner avec Docker
> Compose en moins de 5 minutes. Inclut des configs reverse-proxy
> Apache/Nginx prêtes à l'emploi, SMTP optionnel, et un setup CI/CD éprouvé
> pour les déploiements SSH.**

---

## Sommaire

- [Ce que vous obtenez](#-ce-que-vous-obtenez)
- [Installation rapide (5 min)](#-installation-rapide-5-min)
- [Configuration](#%EF%B8%8F-configuration)
- [Reverse proxy](#-reverse-proxy)
- [SSL / Let's Encrypt](#-ssl--lets-encrypt)
- [CI/CD — déploiements SSH](#-cicd--déploiements-ssh)
- [Commandes utiles](#%EF%B8%8F-commandes-utiles)
- [Backup & restore](#-backup--restore)
- [Checklist sécurité](#-checklist-sécurité)
- [Dépannage](#-dépannage)
- [Crédits](#-crédits)
- [Licence](#-licence)

---

## 🎯 Ce que vous obtenez

- **GitLab Community Edition** — votre instance GitLab privée.
- **GitLab Runner (executor Docker)** — auto-enregistré, prêt pour la
  CI/CD. Génère une clé SSH de déploiement au premier boot (cf
  [guide CI](CI.md)).
- **Configs reverse-proxy** — Apache ou Nginx, avec WebSocket et limites
  d'upload raisonnables.
- **SMTP optionnel** — toggle par une variable (`SMTP_ENABLE`).
- **TLS-friendly** — pensé pour Let's Encrypt ou certificats personnalisés
  terminés au reverse proxy.
- **Defaults orientés production** — rotation de logs, healthcheck,
  pinning d'image optionnel.

---

## 🚀 Installation rapide (5 min)

### 1. Pré-requis

```bash
# Vérifier Docker + Compose v2
docker --version
docker compose version    # PAS `docker-compose` — v1 est EOL
```

Si manquants sur Debian/Ubuntu :

```bash
sudo apt update
sudo apt install docker.io docker-compose-v2
```

### 2. Cloner

```bash
git clone https://github.com/padcmoi/gitlab-docker-setup.git
cd gitlab-docker-setup
```

### 3. Configurer

```bash
cp .env.sample .env
nano .env
```

Minimum à régler :

```env
GITLAB_HOST=votre-domaine.com
GITLAB_ROOT_EMAIL=admin@votre-domaine.com
GITLAB_ROOT_PASSWORD=<mot de passe fort — 12+ chars, mixte, chiffres, symboles>
SSH_PORT=2222           # PAS 22 (collision avec sshd du host)
```

> ⚠️ **CRITIQUE** — `GITLAB_ROOT_PASSWORD` doit être fort, sinon GitLab
> refuse de démarrer. La valeur par défaut dans `.env.sample` est un
> placeholder (`CHANGE_ME_TO_A_STRONG_PASSWORD`) précisément pour qu'un
> déploiement bâclé échoue bruyamment au lieu de tourner avec un admin
> devinable.

### 4. Créer le volume runner-config (one-shot)

```bash
docker volume create gitlab-runner-config
```

Persiste le `config.toml` du runner (l'inscription) entre recreate des
containers.

### 5. Démarrer

```bash
docker compose up -d

# Suivre le premier boot (2-5 minutes)
docker compose logs -f gitlab
```

### 6. Accès

- URL : `http://votre-domaine.com:1584` (puis ajouter un reverse proxy + TLS).
- Login : `root`
- Mot de passe : celui défini dans `GITLAB_ROOT_PASSWORD`.

---

## ⚙️ Configuration

### Variables

| Variable                    | Description                                                       | Exemple              |
| --------------------------- | ----------------------------------------------------------------- | -------------------- |
| `GITLAB_CONTAINER_NAME`     | Nom du container (utilisé aussi pour le runner : `<nom>_runner`)  | `gitlab_ce`          |
| `GITLAB_HOST`               | Hostname public                                                   | `gitlab.exemple.com` |
| `GITLAB_ROOT_EMAIL`         | Email admin                                                       | `admin@exemple.com`  |
| `GITLAB_ROOT_PASSWORD`      | Mot de passe admin (12+ chars). **Faible = crash au démarrage.**  | `S3cure!P@ss…`       |
| `GITLAB_VERSION`            | Optionnel — pin du tag image GitLab CE (default : `latest`)       | `17.5.2-ce.0`        |
| `RUNNER_VERSION`            | Optionnel — pin du tag image Runner (default : `latest`)          | `17.5.0`             |
| `RUNNER_REGISTRATION_TOKEN` | Token d'enregistrement runner de groupe (cf [guide CI](CI.md))    | `glrt-…`             |
| `HTTP_PORT`                 | Port host pour GitLab HTTP (bound à `127.0.0.1`)                  | `1584`               |
| `SSH_PORT`                  | Port host pour le SSH GitLab. **Ne pas utiliser 22.**             | `2222`               |
| `SMTP_*`                    | Crédentiels SMTP (optionnel, `SMTP_ENABLE=false` pour désactiver) | —                    |

### Pinning des versions d'image (recommandé en production)

`docker compose pull` sur `latest` finira par tirer une montée majeure qui
casse les migrations DB au restart. Pinner dans `.env` :

```env
GITLAB_VERSION=17.5.2-ce.0
RUNNER_VERSION=17.5.0
```

Tags : <https://hub.docker.com/r/gitlab/gitlab-ce/tags>.

### SMTP (optionnel)

```env
SMTP_ENABLE=true
SMTP_ADDRESS=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=votre-email@gmail.com
SMTP_PASS=votre-mot-de-passe-application
```

Pour désactiver : `SMTP_ENABLE=false` (le runner n'a pas besoin du SMTP).

---

## 🌐 Reverse proxy

GitLab écoute uniquement sur `127.0.0.1:${HTTP_PORT}` — terminez le TLS au
reverse proxy du host. Configs d'exemple (avec WebSocket, tuning d'upload,
forward-proto headers) :

### Apache2

```bash
sudo cp apache-gitlab.conf /etc/apache2/sites-available/gitlab.conf
sudo nano /etc/apache2/sites-available/gitlab.conf   # régler ServerName
sudo a2enmod proxy proxy_http proxy_wstunnel ssl headers rewrite
sudo a2ensite gitlab.conf
sudo systemctl reload apache2
```

### Nginx

```bash
sudo cp nginx-gitlab.conf /etc/nginx/sites-available/gitlab
sudo nano /etc/nginx/sites-available/gitlab          # régler server_name
sudo ln -s /etc/nginx/sites-available/gitlab /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

---

## 🔒 SSL / Let's Encrypt

```bash
sudo apt install certbot

# Arrêter brièvement le proxy pour libérer le port 80 (challenge standalone)
sudo systemctl stop apache2   # ou nginx
sudo certbot certonly --standalone -d votre-domaine.com
sudo systemctl start apache2  # ou nginx
```

Puis décommenter les lignes `SSLCertificate*` (Apache) ou
`ssl_certificate*` (Nginx) dans votre config et reload.

Pour le renouvellement automatique : `sudo systemctl enable --now
certbot.timer`. Couplez avec un `--deploy-hook` qui reload votre proxy.

---

## 🔁 CI/CD — déploiements SSH

Auto-héberger GitLab est la moitié du chemin ; l'autre moitié c'est faire
en sorte que vos projets se déploient sur vos serveurs sans clic UI. Ce
template fournit un workflow SSH-deploy éprouvé :

- Le runner génère une paire ed25519 au premier boot.
- Le base64 de la clé privée va dans **une seule variable CI/CD au niveau
  groupe** (`SSH_PRIVATE_KEY_B64`, `Masquée et cachée`).
- Tous les projets du groupe en héritent — pas de secret par projet, pas
  de dossier `.deploy/` dans les repos, pas de variable UI par projet.
- Un `.gitlab-ci.yml` réutilisable décode la clé au job et déploie en SSH.

**Guide complet : [CI/CD (FR)](CI.md) / [CI/CD (EN)](../en/CI.md).**

---

## 🛠️ Commandes utiles

```bash
# État
docker compose ps

# Logs
docker compose logs -f
docker compose logs -f gitlab           # juste GitLab
docker compose logs -f gitlab-runner    # juste le runner

# Redémarrer
docker compose restart

# Arrêter
docker compose down

# Mise à jour (après avoir vérifié le upgrade path GitLab pour la nouvelle version !)
docker compose pull && docker compose up -d
```

---

## 💾 Backup & restore

GitLab fournit son propre outil de backup :

```bash
# Créer un backup (atterrit dans /var/opt/gitlab/backups/ dans le container)
docker compose exec gitlab gitlab-backup create

# Lister les backups
docker compose exec gitlab ls -lh /var/opt/gitlab/backups/

# Restaurer (GitLab doit être partiellement arrêté — voir docs GitLab
# pour la procédure complète, ceci est juste le déclencheur) :
docker compose exec gitlab gitlab-backup restore BACKUP=<timestamp>_gitlab_backup
```

Sauvegardez aussi `/etc/gitlab/` (monté en `./config/`) qui contient
`gitlab-secrets.json` — sans lui le backup est inrestaurable.

---

## 🔐 Checklist sécurité

Avant d'exposer GitLab à internet :

- [ ] `GITLAB_ROOT_PASSWORD` fort et unique.
- [ ] `GITLAB_VERSION` pinné (pas `latest`).
- [ ] `SSH_PORT` non standard (pas 22).
- [ ] Reverse proxy sert uniquement HTTPS, avec HSTS une fois vérifié.
- [ ] Firewall : seuls les ports proxy (80/443) et `SSH_PORT` ouverts en
      externe ; le HTTP du container GitLab (`HTTP_PORT`) est bound à
      `127.0.0.1`, déjà privé.
- [ ] Backups planifiés et testés.
- [ ] Runner : `--docker-privileged` activé par défaut — OK pour usage
      interne/de confiance, mais **à revoir avant d'autoriser des forks
      externes ou MRs publiques**, car ça donne un root host depuis
      n'importe quel pipeline.
- [ ] Clés CI : suivre le [guide CI](CI.md), utiliser des
      variables groupe `Masquée et cachée`. **Ne jamais commiter une clé
      privée dans un repo**, même "privé".

---

## 🔍 Dépannage

**GitLab ne démarre pas**

```bash
docker compose logs gitlab
df -h        # GitLab a besoin de beaucoup de disque
free -m      # …et au moins 4 Go RAM en pratique
```

Cause fréquente : `GITLAB_ROOT_PASSWORD` faible → vérifier les logs pour
"password is too weak".

**Impossible d'accéder**

```bash
docker compose ps
curl -I http://127.0.0.1:1584   # bypasse le reverse proxy
```

Si `127.0.0.1:1584` répond mais pas l'URL publique → problème de reverse
proxy.

**Emails ne partent pas**

Vérifier les crédentiels SMTP, puis tester depuis l'intérieur :

```bash
docker compose exec gitlab gitlab-rails console
# > Notify.test_email('vous@exemple.com', 'sujet', 'corps').deliver_now
```

**Runner offline**

Voir [CI.md § 3](CI.md#3-créer-un-groupe-gitlab-et-enregistrer-le-runner).

---

## 🙏 Crédits

**Auteur** : [Julien Jean](https://www.linkedin.com/in/julienjean-nice/) — 💼
[LinkedIn](https://www.linkedin.com/in/julienjean-nice/)

Ce projet vous aide à auto-héberger une stack GitLab + CI/CD complète en
quelques minutes, avec les pièges et écueils de sécurité déjà résolus.

---

## 📄 Licence

MIT — voir [LICENSE](../../LICENSE).

---

⭐ **Ce projet vous a aidé ? Mettez une étoile au repo !** ⭐
