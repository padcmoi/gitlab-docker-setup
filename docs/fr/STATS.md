# 📊 Dashboard GitLab Stats

_🇫🇷 Version française | [🇬🇧 English version](../en/STATS.md)_

Dashboard Nuxt 4 autonome qui visualise l'**activité de commits d'équipe**
sur tous les projets visibles par un token GitLab côté serveur. Les
visiteurs se connectent via OAuth GitLab — l'URL peut donc être partagée
avec ton équipe ou ton patron.

> Source : [`gitlab-stats-nuxt/`](../../gitlab-stats-nuxt/)
> Conteneur : `gitlab_ce_stats` (build depuis le compose à la racine du repo)
> Lecture seule par design : `read_api` sur le PAT serveur, `read_user` sur le scope OAuth.

---

## Table des matières

- [Ce que tu obtiens](#-ce-que-tu-obtiens)
- [Pré-requis](#-pr%C3%A9-requis)
- [Installation (pas à pas)](#-installation-pas-%C3%A0-pas)
- [Snippet reverse-proxy (Nginx / Apache)](#-snippet-reverse-proxy)
- [Premier lancement](#-premier-lancement)
- [Routes](#-routes)
- [Comment les visiteurs s'authentifient](#-comment-les-visiteurs-sauthentifient)
- [Cache et rafraîchissement](#%EF%B8%8F-cache-et-rafra%C3%AEchissement)
- [Maintenance](#-maintenance)
- [Dépannage](#-d%C3%A9pannage)
- [Architecture (pour les curieux)](#-architecture-pour-les-curieux)

---

## ✨ Ce que tu obtiens

- **Filtres** : période (7j / 30j / 90j / 6 mois / 1 an / tout), projet,
  sélecteur multi-développeurs.
- **Charts multi-développeurs empilés avec légende** (top 10 + "Autres") :
  par jour, par semaine ISO, par mois, par heure (UTC), par jour de la semaine.
- **Charts simples** : top 15 projets, top 15 développeurs, donut types de
  commits (`feat` / `fix` / `refactor` / `chore` / `docs` / `test` / `style` /
  `perf` / `ci` / `build` / `other`), lignes ajoutées/supprimées par mois.
- **KPIs** (7) : projets, commits, jours actifs, moy. / jour actif,
  lignes ajoutées, lignes supprimées, lignes modifiées.
- **Tableau des derniers commits** (jusqu'à 100 lignes) : nom du projet et
  titre du commit cliquables vers GitLab, période affichée dans l'entête.

---

## ✅ Pré-requis

- GitLab Docker Setup déjà fonctionnel (le dashboard partage le même
  `docker-compose.yml`).
- Un compte GitLab **admin ou owner** capable de créer des applications
  OAuth et des personal access tokens.
- Un **vhost de reverse-proxy** pour un sous-domaine stats (le dashboard
  est lié à `127.0.0.1:${STATS_PORT:-52081}`, jamais exposé publiquement
  directement).
- Un enregistrement DNS pour `stats.ton-domaine.com` (ou le sous-domaine
  que tu choisis) pointant vers ton serveur.
- Un certificat SSL (Let's Encrypt fait l'affaire).

> **Note sur le compte GitLab.** La liste des projets du dashboard n'est
> pas filtrée (pas de `membership=true`). Avec un **token admin**, le
> dashboard couvre toute l'instance. Avec un token utilisateur classique,
> il ne couvre que les projets que cet utilisateur voit — ce qui peut être
> exactement ce que tu veux pour un dashboard d'équipe unique.

---

## 🛠 Installation (pas à pas)

### 1. Créer l'application OAuth

C'est ce contre quoi les visiteurs s'authentifieront.

GitLab → **User Settings → Applications** (ou **Admin Area → Applications**
pour une app au niveau de l'instance) :

| Champ | Valeur |
|-------|--------|
| Name | `gitlab-stats` |
| Redirect URI | `https://stats.ton-domaine.com/oauth/callback` (doit matcher `STATS_OAUTH_REDIRECT_URL` à l'octet près) |
| Confidentiel | ✅ |
| Scopes | `read_user` (uniquement) |

Enregistrer. Copier :

- **Application ID** → `STATS_OAUTH_CLIENT_ID`
- **Secret** (visible une seule fois) → `STATS_OAUTH_CLIENT_SECRET`

> Si GitLab impose une date d'expiration sur les PAT, tu peux désactiver
> ça dans **Admin Area → Settings → General → Account and limit →
> "Faire respecter la date d'expiration du jeton d'accès personnel"**.

### 2. Créer le token serveur (PAT)

C'est ce que le backend du dashboard utilise pour appeler l'API GitLab.

GitLab → **User Settings → Access Tokens** :

| Champ | Valeur |
|-------|--------|
| Name | `gitlab-stats-server` |
| Expiration | au choix (ou aucune si la contrainte est désactivée) |
| Scopes | `read_api` (uniquement) |

Enregistrer. Copier le token `glpat-...` → `STATS_GITLAB_TOKEN`.

### 3. Générer un secret de session

```bash
openssl rand -hex 32
```

Copier le résultat dans `STATS_SESSION_SECRET` (doit faire ≥ 32 caractères).

### 4. Remplir `.env`

Copie le bloc `STATS_*` depuis [`.env.sample`](../../.env.sample) dans ton
`.env` local et remplace les placeholders :

```env
STATS_PORT=52081
STATS_GITLAB_TOKEN=glpat-...
STATS_OAUTH_CLIENT_ID=...
STATS_OAUTH_CLIENT_SECRET=...
STATS_OAUTH_REDIRECT_URL=https://stats.ton-domaine.com/oauth/callback
STATS_SESSION_SECRET=...
STATS_SINCE=2025-01-01T00:00:00Z
STATS_CACHE_TTL_MS=900000
```

### 5. DNS

Crée un enregistrement `A` (ou `CNAME` vers ton host GitLab) pour
`stats.ton-domaine.com` pointant vers le même serveur.

### 6. Certificat SSL

```bash
sudo certbot certonly --nginx -d stats.ton-domaine.com
```

(Utilise `--apache` si tu es sur Apache, ou ton flow préféré.)

### 7. Vhost reverse-proxy

Voir le [snippet plus bas](#-snippet-reverse-proxy), choisis Nginx ou
Apache, installe-le et recharge ton reverse-proxy.

### 8. Build et démarrage — sans toucher au conteneur GitLab

```bash
docker compose build gitlab-stats
docker compose up -d --no-deps gitlab-stats
docker compose logs -f gitlab-stats
```

`--no-deps` garantit que les conteneurs `gitlab` et `gitlab-runner` en cours
d'exécution ne sont pas recréés. Tu devrais voir :

```
gitlab_ce_stats  | Listening on http://0.0.0.0:3000
```

---

## 🔌 Snippet reverse-proxy

### Nginx

Crée `/etc/nginx/sites-available/stats.ton-domaine.com` :

```nginx
server {
    listen 80;
    server_name stats.ton-domaine.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name stats.ton-domaine.com;

    ssl_certificate     /etc/letsencrypt/live/stats.ton-domaine.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/stats.ton-domaine.com/privkey.pem;

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

Activer et recharger :

```bash
sudo ln -s /etc/nginx/sites-available/stats.ton-domaine.com /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### Apache

```apache
<VirtualHost *:80>
    ServerName stats.ton-domaine.com
    Redirect permanent / https://stats.ton-domaine.com/
</VirtualHost>

<VirtualHost *:443>
    ServerName stats.ton-domaine.com

    SSLEngine on
    SSLCertificateFile     /etc/letsencrypt/live/stats.ton-domaine.com/fullchain.pem
    SSLCertificateKeyFile  /etc/letsencrypt/live/stats.ton-domaine.com/privkey.pem

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

Recharger Apache : `sudo systemctl reload apache2`.

---

## 🚀 Premier lancement

Ouvre `https://stats.ton-domaine.com/` dans un navigateur :

1. Tu atterris sur `/login` avec un bouton **"Se connecter avec GitLab"**.
2. Clique → tu es redirigé vers GitLab pour le consentement OAuth.
3. Après autorisation, GitLab te renvoie sur `/oauth/callback` → le
   dashboard crée ta session et t'envoie sur `/stats`.
4. Le premier chargement récupère tous les projets + tous les commits
   depuis `STATS_SINCE` (one-shot, ~10–60 s selon la taille de l'instance) ;
   les chargements suivants tapent le cache mémoire (15 min par défaut).

---

## 🛣 Routes

| URL | Comportement |
|---|---|
| `/` | Redirige vers `/login` ou `/stats` selon la session |
| `/login` | Écran de connexion avec le bouton OAuth |
| `/stats` | Le dashboard (redirige vers `/login` si pas de session) |
| `/oauth/login` | Démarre le flow OAuth |
| `/oauth/callback` | Échange le code, crée la session, redirige vers `/stats` |
| `/oauth/logout` | Détruit la session, redirige vers `/login` |
| `/api/stats` | Données agrégées (401 si non authentifié) |
| `/api/refresh` | Invalide le cache mémoire |

---

## 🔐 Comment les visiteurs s'authentifient

- **N'importe quel compte GitLab** de l'instance peut se connecter — l'app
  OAuth ne filtre pas par groupe ou rôle.
- Le **PAT serveur** est le propriétaire des données récupérées. Avec un
  token admin, le dashboard voit tous les projets ; avec un token user
  classique, il ne voit que les projets visibles pour cet utilisateur.
- Les sessions sont des cookies signés (`nuxt-session`) utilisant
  `STATS_SESSION_SECRET`, HttpOnly + SameSite=Lax.

---

## ♻️ Cache et rafraîchissement

- Le backend met en cache `listProjects()` et `listCommits(projectId, since)`
  en mémoire avec un TTL `STATS_CACHE_TTL_MS` (15 min par défaut).
- Le bouton **Rafraîchir** dans l'entête du dashboard appelle
  `POST /api/refresh` pour invalider le cache, puis refetch.
- Le cache est **par instance de conteneur**. Redémarrer `gitlab-stats`
  vide le cache.

---

## 🧰 Maintenance

### Mettre à jour le dashboard

```bash
cd /chemin/vers/gitlab-docker-setup
git pull                                  # récupère les dernières sources
docker compose build gitlab-stats
docker compose up -d --no-deps gitlab-stats
```

### Suivre les logs

```bash
docker compose logs -f gitlab-stats
```

### Lancer le tooling dev (format, install, lint) sans polluer l'hôte

```bash
docker compose --profile tools run --rm gitlab-stats-tools pnpm install
docker compose --profile tools run --rm gitlab-stats-tools pnpm format
```

Les volumes `gitlab-stats-nuxt-node-modules`, `-nuxt-cache`, `-output`,
`-pnpm-store` stockent les dépendances et artefacts de build — ton
arborescence `gitlab-stats-nuxt/` reste propre.

### Arrêter le dashboard (en gardant GitLab)

```bash
docker compose stop gitlab-stats
```

### Suppression complète (conteneurs + volumes nommés)

```bash
docker compose --profile tools rm -sfv gitlab-stats gitlab-stats-tools
docker volume rm \
  gitlab-stats-nuxt-node-modules \
  gitlab-stats-nuxt-nuxt-cache \
  gitlab-stats-nuxt-output \
  gitlab-stats-nuxt-pnpm-store
```

GitLab + Runner ne sont pas touchés.

---

## 🩺 Dépannage

| Symptôme | Cause probable | Solution |
|---|---|---|
| `Missing env var: STATS_GITLAB_TOKEN` dans les logs | `.env` pas chargé ou var vide | Vérifier avec `docker compose config` que la valeur apparaît, puis `up -d --force-recreate` |
| `STATS_SESSION_SECRET must be at least 32 chars` | Secret trop court | Régénérer avec `openssl rand -hex 32` |
| Le navigateur reste sur `/oauth/callback` avec "Invalid OAuth state" | Cookies bloqués ou `STATS_OAUTH_REDIRECT_URL` ne matche pas le Redirect URI dans l'app GitLab | Rendre les deux URLs **identiques** (schéma, host, chemin) |
| Le dashboard affiche `0 projects` | Le PAT est sur un user sans aucun projet membership | Utiliser un token admin, ou rejoindre les groupes concernés |
| Le dashboard reste sur "Chargement en cours…" à vie | Le premier call récupère tous les commits depuis `STATS_SINCE` | Patiente — les grosses instances prennent 1–2 min au démarrage à froid. Les chargements suivants sont instantanés. |
| 401 en appelant `/api/stats` au curl | L'endpoint exige le cookie de session | C'est voulu. Utilise le navigateur. |
| Erreur SSL hairpin NAT quand le conteneur appelle l'API GitLab | Le conteneur n'arrive pas à joindre son propre hostname public | Le compose mappe déjà `${GITLAB_HOST}:host-gateway` via `extra_hosts` ; vérifie que ton firewall laisse le conteneur joindre la host-gateway |

---

## 🧱 Architecture (pour les curieux)

```
gitlab-stats-nuxt/
├── app/
│   ├── pages/
│   │   ├── index.vue       redirige /login ou /stats selon la session
│   │   ├── login.vue       bouton OAuth login
│   │   └── stats.vue       dashboard (filtres, KPIs, charts, derniers commits)
│   ├── components/StatsChart.vue   wrapper ApexCharts (ClientOnly + fallback)
│   ├── composables/useStats.ts     fetch + état des filtres
│   ├── plugins/apexcharts.client.ts
│   └── assets/css/main.css         Tailwind v4 + reset cursor-pointer
├── server/
│   ├── api/
│   │   ├── stats.get.ts            GET /api/stats?range=&projectId=&authors=
│   │   └── refresh.post.ts         POST /api/refresh
│   ├── routes/oauth/{login,callback,logout}.get.ts
│   ├── middleware/auth.ts          protège /api/* (401 sans session)
│   └── utils/{config,cache,gitlab,stats}.ts
├── types/auth.d.ts                 typage UserSession
├── Dockerfile                      multi-stage builder + runner alpine
└── nuxt.config.ts
```

Stack : **Nuxt 4** (Nitro), **Nuxt UI 4** (Tailwind v4 inclus),
**nuxt-auth-utils** pour OAuth + sessions signées, **vue3-apexcharts** pour
les charts. Pas de base de données — projets + commits vivent dans un
cache mémoire à l'intérieur du process Nitro.
