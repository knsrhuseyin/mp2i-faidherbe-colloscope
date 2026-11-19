# API — Cloudflare Worker + D1

Voir aussi le [guide complet des fichiers et des parcours de données](../README.code.md).

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

`npm run check` exécute les suites Node, dont les régressions de concurrence et le client HTTP partagé. Après `npm ci --ignore-scripts`, `npm run check:runtime` vérifie aussi le Worker avec D1 dans Miniflare : limitation des connexions simultanées, sauvegardes concurrentes, retrait des anciennes routes Documents et absence d’envoi Discord. Tous les appels externes de ce test sont simulés.

Pour les parcours navigateur : `npx playwright install chromium`, puis `npm run check:browser`. Les quatorze parcours couvrent les écrans mobile et bureau : conservation des éléments, du focus et du défilement, passage à une colle terminée, mise à jour distante, annulation d’une recherche, import/export, sauvegarde, conflits et nouvelle tentative après erreur. Le serveur local de test écoute uniquement sur 127.0.0.1:4173 et les API sont simulées. Un Chrome déjà installé peut être utilisé via `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`.

Les trois contrôles s’exécutent sur chaque pull request et push sur main.

## Garder les sources lisibles

`npm run format` remet les sources JavaScript, HTML et CSS en forme avec la configuration `.prettierrc.json` de la racine. `npm run format:check` vérifie ce format sans écrire. Les en-têtes de modules donnent leur rôle et les commentaires détaillent les contraintes importantes ; le guide de lecture explique les relations entre fichiers.
