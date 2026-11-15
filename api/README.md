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

## Sauvegardes et vérifications

Un POST authentifié vers `/api/admin/colloscope` doit inclure `expected_updated_at`, égal au `updated_at` reçu lors du chargement (ou `null` avant la première sauvegarde). Une version périmée renvoie HTTP 409 et conserve le planning enregistré ; une version absente renvoie HTTP 428. Après une mise à jour du site, recharger les anciens onglets administrateur. L’éditeur conserve le brouillon en cas de conflit pour permettre son export JSON.

Les semaines doivent être ordonnées, sans chevauchement, commencer le lundi et durer au plus sept jours. Les dates doivent exister, les identifiants de semaines/groupes être uniques et la fin d’un créneau suivre son début. Le planning ouvert récupère les modifications distantes au retour au premier plan ou au prochain rafraîchissement, en conservant les filtres.

`npm run check` exécute les suites Node, dont les régressions de concurrence. Après `npm ci --ignore-scripts`, `npm run check:runtime` vérifie aussi le Worker avec D1 dans Miniflare : limitation des connexions simultanées, sauvegardes concurrentes, envoi Discord et refus des redirections. Tous les appels externes de ce test sont simulés. Les deux contrôles s’exécutent sur chaque push et pull request.
