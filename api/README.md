# API — Cloudflare Worker + D1

L’API sert le colloscope au front et protège toutes les modifications par une session administrateur signée.

## Installation

```bash
npm install
npx wrangler login
npx wrangler d1 create colloscope-db
```

Copie le `database_id` retourné dans `wrangler.jsonc`, puis exécute :

```bash
npx wrangler d1 migrations apply colloscope-db --remote
npx wrangler deploy
npx wrangler secret put ADMIN_PASSWORD
openssl rand -hex 32
npx wrangler secret put SESSION_SECRET
```

Pour `SESSION_SECRET`, colle la valeur aléatoire générée par OpenSSL. Modifie aussi `ALLOWED_ORIGINS` dans `wrangler.jsonc` avec l’URL exacte du front Pages.

## Déploiement GitHub automatique

Dans **Worker → Settings → Builds** :

- Root directory : `api`
- Build command : `npm run check`
- Deploy command : `npx wrangler deploy`
- Build watch include : `api/**`

Le nom du Worker dans Cloudflare doit correspondre au champ `name` de `wrangler.jsonc`.

## Routes

- `GET /health`
- `GET /api/colloscope`
- `POST /api/admin/login`
- `GET /api/admin/session`
- `POST /api/admin/colloscope`
