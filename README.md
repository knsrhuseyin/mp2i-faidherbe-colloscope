# Colloscope Cloudflare

Pour comprendre le rôle des fichiers et savoir où modifier le code, lire le [guide de lecture du code](README.code.md).

Ce dépôt sépare complètement le site public et son API :

```text
colloscope-cloudflare/
├── front/  → site statique Cloudflare Pages
└── api/    → API Cloudflare Worker + base D1
```

Le front affiche automatiquement la semaine actuelle, la prochaine colle et le nombre de colles restantes. Il mémorise le groupe choisi et utilise le thème sombre par défaut. L’administration permet d’importer un JSON ou de modifier les créneaux visuellement.

Le mot de passe n’est jamais présent dans le front ni dans GitHub : il est enregistré comme secret du Worker. Tu peux utiliser le mot de passe initial que tu as choisi, mais change-le avant de rendre le site public.

## Application mobile et rappels

Le front peut être installé sur iPhone et Android. Les notifications configurables nécessitent une activation du Worker et une migration D1 : voir [NOTIFICATIONS.md](NOTIFICATIONS.md).

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
nix-shell -p nodejs_24 git openssl
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
| Build watch include | `api/**`, `front/theme-core.mjs`, `front/manifest-core.mjs` |

Le nom du Worker dans Cloudflare doit rester `colloscope-api`, comme dans `wrangler.jsonc`. La base D1 et les secrets créés plus haut restent attachés à ce Worker.

### Aperçus des pull requests

Dans **Settings → Builds → Previews Base**, conserver le répertoire `/api` et régler :

| Réglage | Valeur |
|---|---|
| Build command | `npm run check && npm run db:migrate:preview` |
| Preview command | `npx wrangler preview` |

Le bloc `previews` de `api/wrangler.jsonc` utilise `colloscope-preview-db`, une base D1 distincte de la production. `api/wrangler.preview-migrations.jsonc` doit toujours pointer vers cette même base ; la commande de build lui applique les migrations avant chaque aperçu. Les aperçus partagent cette base de test. Pour isoler une branche supplémentaire, créer une autre base et modifier les deux configurations sur cette branche, comme décrit dans la [documentation Cloudflare](https://developers.cloudflare.com/workers/previews/resources/#d1-migrations).

Les secrets de production ne sont pas copiés dans les aperçus. Sans secrets dédiés, la connexion administrateur et les notifications push restent désactivées. Les aperçus ne reçoivent pas les Cron Triggers de production. Les URL d’aperçu sont publiques.

Le front Pages conserve l’API définie dans `front/config.js`, y compris dans les aperçus Pages. Pour tester le front contre le Worker d’aperçu, utiliser son URL dans une copie locale de `config.js` et ajouter l’origine exacte du front à `previews.vars.ALLOWED_ORIGINS` si nécessaire. La configuration actuelle autorise les origines locales et l’alias Pages de la PR #3 ; elle n’autorise pas automatiquement les autres branches.

Si Pages échoue à l’envoi des fichiers avec le code Cloudflare `971` (limitation de débit), relancer le déploiement concerné après un délai ; cette erreur ne nécessite pas de modifier les sources.

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


## Palettes et thèmes saisonniers

Dans **Admin → Apparence**, choisir une des six palettes (Minuit citron, Craie & indigo, Prune & lavande, Bleu polaire, Sable & terracotta, Sauge & forêt) ou les thèmes Noël et Halloween.

- La palette par défaut est commune à toute la classe et s’applique en dehors des périodes.
- Créer un thème à partir d’une palette permet de modifier son nom, ses sept couleurs et sa décoration (flocon, citrouille, fleur ou étoile). Les modèles fournis restent disponibles.
- Ajouter une période, sélectionner son thème et renseigner ses dates avec l’année. Les dates de début et de fin sont inclusives, en heure de Paris. Pour une saison qui traverse le Nouvel An, choisir l’année suivante pour la fin.
- Les périodes actives ne peuvent pas se chevaucher. Une période peut être désactivée ou retirée. Un thème utilisé par une période ou par défaut doit être retiré de ces usages avant suppression.
- L’aperçu par date ne publie rien. **Enregistrer les modifications** publie le choix et les périodes ; **Annuler** les abandonne. Les autres appareils récupèrent les réglages en environ une minute quand l’appli est ouverte et connectée. Une page ouverte bascule automatiquement au plus tard 30 secondes après minuit, puis revient à la palette par défaut après la période.
- Le JSON exporté comprend l’apparence. Importer un ancien planning sans champ `appearance` conserve les réglages existants.

Les réglages sont conservés dans le JSON du colloscope existant en D1 ; aucune migration ni nouveau secret n’est requis. `front/theme-core.mjs` est partagé entre le front et le Worker. Inclure ce fichier dans les chemins surveillés par le build du Worker, en plus de `api/**`, lors de futures modifications du catalogue.

## Icônes HX1 et référence 67

Chaque palette a une icône distincte HX1 avec un petit 67, et Noël/Halloween ont leurs illustrations dédiées. L’onglet, le logo dans l’application et l’aperçu administrateur suivent immédiatement le thème actif, y compris ses périodes. Les thèmes personnalisés reprennent leurs couleurs et leur décoration.

Le manifeste d’installation est servi par la Pages Function `functions/manifest.webmanifest.js` : il relit l’apparence publiée et résout le thème à la date courante en heure de Paris. Son identifiant d’application reste le même pour éviter les doublons à l’installation. Les huit modèles utilisent des PNG 192/512 px dans `icons/themes/` ; `functions/icons/custom.png.js` génère les PNG des palettes personnalisées sans dépendance externe. Ces deux routes sont définies dans `_routes.json`. En cas d’indisponibilité de l’API, le manifeste utilise Minuit citron. Le fichier statique `manifest.webmanifest` fournit aussi ce modèle par défaut.

L’écran d’accueil reste géré par iOS/Android : son icône ne peut pas être remplacée de force par une page web. Android peut la mettre à jour ultérieurement ; sur iPhone, une réinstallation depuis Safari peut être nécessaire. Après réinstallation, vérifier les permissions et les rappels. Les nouvelles notifications utilisent l’icône du thème actif à l’heure de leur envoi ; les notifications déjà reçues ne changent pas.

Les sources vectorielles sont dans `icon-art.mjs` et `icons/themes/*.svg`, avec les PNG pré-rendus correspondants. Après modification du dessin des modèles, régénérer leurs PNG et incrémenter `ICON_VERSION` dans `manifest-core.mjs` ainsi que la version du cache dans `sw.js`.

Les favicons utilisent une variante transparente distincte (`themeFaviconSvg` et `icons/favicons/*.svg`) avec un contraste adapté au navigateur clair ou sombre. Les PNG de l’application installée gardent leur fond plein. Après modification d’un dessin, régénérer également ses variantes de favicon et incrémenter la version de leur URL dans `index.html` ainsi que celle du cache.

## Documents et synchronisation

Les documents et leurs réglages sont désormais dans [Prépa Sync](https://prepa-sync.knsr-family.com/documents), projet autonome accessible avec le compte knsr-family depuis le LAN ou WireGuard. Les boutons Documents sur ordinateur et mobile ouvrent ce tableau de bord.

Collo gère uniquement le planning, son apparence et les rappels de colles. Il ne stocke plus de webhook Discord actif, ne collecte plus les cours et n’envoie plus leurs annonces. Les anciennes routes `/api/documents/*` et `/api/admin/documents/*` répondent HTTP 410 avec le lien du tableau de bord.

Les anciennes migrations SQL restent présentes pour préserver l’historique des déploiements. Le transfert contrôlé des réglages et des annonces a été réalisé une seule fois ; `api/scripts/sync-migration.js` est un outil de transition qui ne constitue pas l’entrée de production.
