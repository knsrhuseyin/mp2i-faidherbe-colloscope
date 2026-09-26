# Colloscope Cloudflare

Ce dépôt sépare complètement le site public et son API :

```text
colloscope-cloudflare/
├── front/  → site statique Cloudflare Pages
└── api/    → API Cloudflare Worker + base D1
```

Le front affiche automatiquement la semaine actuelle, la prochaine colle et le nombre de colles restantes. Il mémorise le groupe choisi et utilise le thème sombre par défaut. L’administration permet d’importer un JSON ou de modifier les créneaux visuellement.

Le mot de passe n’est jamais présent dans le front ni dans GitHub : il est enregistré comme secret du Worker. Tu peux utiliser le mot de passe initial que tu as choisi, mais change-le avant de rendre le site public.

## 1. Mettre le projet sur GitHub

Décompresse l’archive, puis place son contenu dans ton dépôt :

```bash
git add .
git commit -m "Ajout du front et de l'API Cloudflare"
git push
```

Les deux projets Cloudflare utiliseront ce même dépôt.

## 2. Créer l’API et la base D1

Sur NixOS, ouvre un environnement temporaire avec Node, Git et OpenSSL :

```bash
nix-shell -p nodejs_22 git openssl
cd api
npm install
npx wrangler login
npx wrangler d1 create colloscope-db
```

La dernière commande affiche un `database_id`. Copie-le dans `api/wrangler.jsonc` à la place de `PASTE_D1_DATABASE_ID_HERE`, puis initialise les tables :

```bash
npx wrangler d1 migrations apply colloscope-db --remote
```

Déploie une première fois l’API :

```bash
npx wrangler deploy
```

Note l’URL affichée, par exemple `https://colloscope-api.ton-compte.workers.dev`.

Ajoute ensuite les deux secrets. Wrangler te demandera leur valeur sans l’écrire dans le dépôt :

```bash
npx wrangler secret put ADMIN_PASSWORD
# saisis ton mot de passe administrateur

openssl rand -hex 32
npx wrangler secret put SESSION_SECRET
# colle le résultat de la commande précédente
```

## 3. Relier le front à l’API

Dans `front/config.js`, remplace :

```js
API_URL: "https://CHANGE-ME.workers.dev",
```

par l’URL exacte du Worker, sans `/` final. Commit et push la modification.

## 4. Créer le projet Cloudflare Pages

Dans **Workers & Pages**, crée une application Pages et choisis **Connect to Git**. Sélectionne ton dépôt GitHub et configure :

| Réglage | Valeur |
|---|---|
| Branche de production | `main` |
| Framework preset | `None` |
| Root directory | `front` |
| Build command | `exit 0` |
| Build output directory | `.` |

Lance le déploiement, puis note l’adresse Pages, par exemple `https://mon-colloscope.pages.dev`.

## 5. Autoriser l’adresse du front dans l’API

Dans `api/wrangler.jsonc`, remplace `https://CHANGE-ME.pages.dev` par l’adresse Pages exacte. Garde les deux adresses locales si tu veux tester sur ton ordinateur.

Commit et push :

```bash
git add front/config.js api/wrangler.jsonc
git commit -m "Configuration des adresses Cloudflare"
git push
```

## 6. Connecter le Worker au même dépôt GitHub

Ouvre le Worker **colloscope-api** dans Cloudflare, puis **Settings → Builds** et connecte le dépôt GitHub. Configure :

| Réglage | Valeur |
|---|---|
| Root directory | `api` |
| Build command | `npm run check` |
| Deploy command | `npx wrangler deploy` |
| Build watch include | `api/**` |

Le nom du Worker dans Cloudflare doit rester `colloscope-api`, comme dans `wrangler.jsonc`. La base D1 et les secrets créés plus haut restent attachés à ce Worker.

Dans le projet Pages, tu peux aussi régler **Build watch paths** sur `front/**`. Ainsi, une modification de l’API ne redéploiera pas inutilement le front, et inversement.

À partir de là :

- un push touchant `front/**` redéploie Pages ;
- un push touchant `api/**` teste et redéploie le Worker ;
- les données modifiées depuis l’administration sont conservées dans D1 ;
- le mot de passe reste uniquement dans les secrets Cloudflare.

## Modifier le mot de passe plus tard

Depuis le dossier `api` :

```bash
npx wrangler secret put ADMIN_PASSWORD
```

La session admin dure huit heures. Les tentatives de connexion sont limitées à cinq par adresse IP toutes les quinze minutes.

## Vérifier avant un push

```bash
cd api
npm run check
```

Le front n’a aucune dépendance et peut être ouvert avec un simple serveur HTTP local.
