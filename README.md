# Colloscope Cloudflare

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

## Centre de documents de HX1

L’onglet **Documents** rassemble maths, anglais et physique avec navigation dans les dossiers, recherche sans accents, fichiers récents, pagination et liens d’origine. Il ne copie pas les PDF et ne change pas les permissions des plateformes sources. Les liens de maths sont orientés vers Cahier de Prépa dès que leur correspondance RSS est connue ; les archives sans lien d’origine restent identifiées comme Drive privé.

Le catalogue et ses sources sont protégés côté API par un mot de passe de classe, distinct du mot de passe administrateur. **Admin → Documents** permet de changer ce mot de passe et les dossiers sources. Le changement de mot de passe révoque toutes les anciennes sessions Documents. Les mots de passe sont salés et dérivés avec PBKDF2-SHA256 (100 000 itérations), jamais renvoyés par l’API. Les sessions sont signées, limitées à sept jours et vérifiées à chaque lecture ; huit essais de connexion par IP sont autorisés par quinze minutes. Le planning reste public.

Appliquer `api/migrations/0003_documents.sql` avant la mise en production, puis définir le mot de passe et les trois sources dans l’administration. Les adresses réelles des dossiers sont stockées en D1, pas dans les fichiers statiques du site. Le catalogue n’est jamais mis en cache par le service worker. Un mot de passe partagé limite l’accès aux personnes qui le connaissent ; il ne vérifie pas individuellement l’identité d’un élève et ne protège pas les liens d’origine qui seraient publics.

Le dépôt `knsrhuseyin/cahier-de-prepa-sync` publie les métadonnées via son job **Publier le catalogue Collo**, prévu sur les exécutions programmées et les pushs sur main. Le collecteur réutilise les secrets Google/RSS déjà présents dans ce dépôt pour les maths. Pour les dossiers publics d’anglais, il lit la structure de la page de partage, avec une limite vérifiée de moins de 50 enfants par dossier : si ce format change ou si un dossier atteint cette limite, la mise à jour échoue sans remplacer l’ancien catalogue. On peut alors migrer ce connecteur vers une autorisation Drive API dédiée. La physique utilise le WebDAV public du Nuage.

L’authentification de publication utilise les jetons OIDC courts de GitHub Actions, avec audience `collo-document-catalogue`, dépôt/branche/workflow exacts vérifiés par le Worker. Aucun nouveau secret de publication permanent n’est nécessaire. Les appels `/api/documents/collector-config`, `/ingest` et `/collector-error` ne sont pas ouverts aux sessions élèves ni administrateur ordinaires. Un catalogue est préparé par lots, puis rendu visible atomiquement seulement après validation du nombre total d’entrées et de la révision de la source. En cas d’erreur, le dernier catalogue publié et sa date restent visibles. Changer une source efface son ancien catalogue avant le prochain passage du collecteur.

Les tests `api/documents.test.mjs` couvrent l’accès élève/admin, le hash, la rotation, la limitation des essais, les signatures OIDC et leurs droits, les lots atomiques, les changements de source, la navigation et les liens sûrs.


### Dates du catalogue et annonces Discord

Les ajouts détectés après l’initialisation gardent une date de première détection stable. Les archives existantes ne sont pas considérées comme nouvellement ajoutées. Pour les maths, la date de publication du RSS Cahier de Prépa est conservée, y compris après disparition du flux ; la date de la copie Drive ne sert jamais de date de cours. Sans date de publication, l’anglais et la physique affichent explicitement la date de modification fournie par la source. Les dates inconnues sont classées en dernier. Le tri utilise des instants UTC et un ordre stable pour la pagination.

Dans **Admin → Documents → Annonces Discord**, configurer un webhook pour le salon d’anglais et un pour le salon de physique. Les URLs sont chiffrées en D1 avec une clé dérivée de `SESSION_SECRET`, jamais renvoyées au navigateur ou au collecteur. La rotation de ce secret impose de réenregistrer les webhooks. Les actions d’administration permettent de mettre en pause, supprimer ou envoyer un test dans chaque salon.

Le collecteur existant vérifie les sources selon sa planification GitHub Actions toutes les dix minutes environ (des retards GitHub sont possibles). Une publication complète du catalogue ajoute les nouveaux fichiers à une file D1 ; le cron Worker existant délivre ces messages. Aucun historique n’est annoncé à l’activation et les dossiers, renommages et réapparitions déjà connus ne créent pas de doublon. Les refus certains sont réessayés, les envois dont la réponse est inconnue sont signalés dans Admin sans réémission automatique pour éviter un doublon. Les messages ne mentionnent aucun rôle/utilisateur.

La migration idempotente `api/migrations/0004_document_updates.sql` ajoute les dates, l’historique et la file Discord. Le Worker initialise aussi automatiquement ces tables au premier accès Documents ou au premier cron, et prend le catalogue existant comme référence initiale. Les rappels de colle et les annonces maths existantes restent indépendants.
