# gitlab-stats-nuxt

Dashboard interne en **Nuxt 4** (Nuxt UI 4 + Tailwind 4 + nuxt-auth-utils + vue3-apexcharts).

Affiche l'activité de développement (commits, lignes ajoutées/supprimées, par jour/mois/projet/dev/type) sur **tous les projets accessibles via l'API GitLab**, avec filtres multi-développeurs.

## Architecture

```
gitlab-stats-nuxt/
├── app/
│   ├── app.vue              layout racine (UApp + NuxtPage)
│   ├── pages/index.vue      dashboard complet
│   ├── components/StatsChart.vue  wrapper ApexCharts client-only
│   └── composables/useStats.ts    fetch + état des filtres
├── server/
│   ├── api/
│   │   ├── stats.get.ts     GET /api/stats?range=&projectId=&authors=
│   │   └── refresh.post.ts  POST /api/refresh (invalide le cache)
│   ├── routes/oauth/
│   │   ├── login.get.ts     démarre le flow OAuth GitLab
│   │   ├── callback.get.ts  callback OAuth
│   │   └── logout.get.ts    détruit la session
│   ├── middleware/auth.ts   exige session sur /api/*
│   └── utils/
│       ├── config.ts        lecture runtimeConfig + validation
│       ├── cache.ts         cache mémoire avec TTL
│       ├── gitlab.ts        client API + pagination
│       └── stats.ts         agrégation jour/mois/projet/auteur/type
├── plugins/apexcharts.client.ts   plugin vue3-apexcharts (client only)
├── assets/css/main.css            Tailwind + Nuxt UI
├── types/auth.d.ts                typage UserSession
├── nuxt.config.ts
├── package.json
└── Dockerfile
```

## Variables d'environnement

| Variable                           | Description                                      |
| ---------------------------------- | ------------------------------------------------ |
| `STATS_GITLAB_BASE_URL`            | URL de l'instance GitLab                         |
| `STATS_GITLAB_TOKEN`               | Token serveur scope `read_api`                   |
| `STATS_OAUTH_CLIENT_ID`            | Application ID de l'app OAuth GitLab             |
| `STATS_OAUTH_CLIENT_SECRET`        | Secret de l'app OAuth GitLab                     |
| `STATS_OAUTH_REDIRECT_URL`         | Callback OAuth (doit matcher exactement)         |
| `STATS_SESSION_SECRET`             | Secret 32+ chars pour chiffrer les sessions      |
| `STATS_SINCE` _(optionnel)_        | Date ISO de début, défaut `2025-01-01T00:00:00Z` |
| `STATS_CACHE_TTL_MS` _(optionnel)_ | TTL cache, défaut `900000` (15 min)              |

## Lancement

```bash
docker compose build gitlab-stats
docker compose up -d --no-deps gitlab-stats
```
