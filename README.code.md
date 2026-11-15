# Comprendre le code de Collo

Ce guide explique où se trouve chaque partie du projet et quel fichier modifier selon le besoin. Le [README principal](README.md) décrit l’installation et le déploiement ; [NOTIFICATIONS.md](NOTIFICATIONS.md) explique l’activation des rappels.

## Les trois parties à distinguer

- **Le navigateur**, dans `front/`, affiche le planning et les formulaires. Il demande les données au serveur ; il ne peut pas décider seul qu’un utilisateur est administrateur.
- **Le Worker**, dans `api/src/`, vérifie les accès, traite les requêtes et programme les notifications. **D1** est sa base de données SQLite persistante.
- **Le collecteur Python**, dans le dépôt `cahier-de-prepa-sync`, lit les sources de cours et envoie leurs métadonnées au Worker. Les PDF restent chez leurs fournisseurs.

Les deux fonctions de `front/functions/` tournent aussi côté serveur, mais sur **Cloudflare Pages** : elles produisent le manifeste d’installation et les icônes personnalisées.

## Par où commencer la lecture

1. Ouvrir `front/index.html` pour repérer les écrans et les identifiants des éléments.
2. Lire `front/app.js` pour suivre le chargement et l’affichage du planning.
3. Lire `api/src/index.js` pour comprendre les routes et la sauvegarde côté serveur.
4. Choisir ensuite le module de la fonctionnalité à modifier dans les tableaux ci-dessous.

## Interface et planning : `front/`

| Fichier | Ce qu’il fait concrètement |
| --- | --- |
| [`index.html`](front/index.html) | Structure de la page : résumé, sélection du groupe, filtres, liste de colles et fenêtres Documents/Admin/Rappels. Les identifiants tels que `groupSelect` relient le HTML au JavaScript. |
| [`config.js`](front/config.js) | Contient l’adresse publique de l’API. C’est ici que le navigateur apprend quel Worker appeler. |
| [`app.js`](front/app.js) | Garde le planning chargé, la semaine, le groupe et le filtre sélectionnés. `loadData()` charge le planning ; `render()` affiche les contrôles ; `renderTemporal()` actualise ce qui dépend de l’heure ; `refreshPlanning()` récupère une version distante. |
| [`planning-model.mjs`](front/planning-model.mjs) | Convertit les JSON importés dans le format attendu et calcule les colles d’un groupe à partir des semaines et affectations. `sessionsFor()` retourne les séances triées ; ses résultats sont réutilisés tant que l’objet de données ne change pas. |
| [`admin.mjs`](front/admin.mjs) | Gère le brouillon administrateur, les formulaires de créneaux/semaines et l’import/export JSON. Le brouillon est une copie : sa modification ne change pas immédiatement le planning public. `saveAdmin()` publie avec la version d’origine du brouillon. |
| [`api-client.mjs`](front/api-client.mjs) | Point commun des appels JSON du navigateur. Ajoute le jeton de la bonne session, traite les erreurs et les délais, regroupe les lectures identiques simultanées. Un appel annulable reste indépendant ; une écriture n’est jamais réémise automatiquement. |
| [`dom.mjs`](front/dom.mjs) | Échappe le texte inséré dans le HTML et met à jour l’affichage sans remplacer les éléments inchangés. `renderRows()` conserve les lignes par `item.key`, ce qui préserve les boutons et leur focus. |
| [`documents.js`](front/documents.js) | Affiche la connexion de classe, les matières, dossiers, résultats et pages du catalogue. Annule les recherches dépassées. Contient aussi le panneau admin des mots de passe, sources et webhooks Documents. |
| [`notifications.js`](front/notifications.js) | Gère les rappels de cet appareil : permission du navigateur, abonnement push, délais et groupe choisi. Enregistre cet abonnement auprès du Worker ; ce fichier n’exécute pas les rappels lorsque la page est fermée. |
| [`appearance.js`](front/appearance.js) | Applique les couleurs à la page, actualise les icônes et construit l’éditeur de palettes et de périodes avec son aperçu. |
| [`theme-core.mjs`](front/theme-core.mjs) | Définit les thèmes, valide les palettes/périodes et choisit le thème d’une date en heure de Paris. Module partagé avec le Worker : il ne dépend pas du DOM. |
| [`style.css`](front/style.css) | Mise en page générale du planning, des formulaires et des adaptations mobiles. |
| [`documents.css`](front/documents.css) | Styles de la bibliothèque Documents, des résultats, de la pagination et de ses paramètres. |
| [`appearance.css`](front/appearance.css) | Styles des palettes, de l’aperçu, des décorations et de l’éditeur de thèmes. |

### Installation et images

| Fichier ou dossier | Ce qu’il fait concrètement |
| --- | --- |
| [`sw.js`](front/sw.js) | Service worker de l’application installable : garde la coque disponible hors ligne, affiche les notifications reçues et ouvre l’application au clic. Les réponses API et le catalogue privé restent hors de son cache. |
| [`manifest.webmanifest`](front/manifest.webmanifest) | Manifeste statique de repli : nom, icônes et mode d’affichage de l’application installée. |
| [`manifest-core.mjs`](front/manifest-core.mjs) | Construit le manifeste adapté au thème publié et les adresses d’icônes. Son identifiant d’application reste stable lorsque le thème change. |
| [`functions/manifest.webmanifest.js`](front/functions/manifest.webmanifest.js) | Route Pages qui lit le thème publié et renvoie le manifeste dynamique. |
| [`functions/icons/custom.png.js`](front/functions/icons/custom.png.js) | Route Pages qui valide une palette reçue dans l’URL et renvoie une icône PNG de taille autorisée. |
| [`_routes.json`](front/_routes.json) | Indique à Pages quelles adresses sont prises en charge par ces fonctions serveur. |
| [`icon-art.mjs`](front/icon-art.mjs) | Produit les dessins SVG HX1/67 et les variantes de favicon. |
| [`icon-png.mjs`](front/icon-png.mjs) | Dessine les pixels des palettes personnalisées et assemble un PNG sans bibliothèque graphique. |
| [`icons/themes/`](front/icons/themes/) | Modèles d’icônes : un SVG et les tailles PNG 192/512 pour chaque thème. |
| [`icons/favicons/`](front/icons/favicons/) | Petites icônes SVG transparentes des onglets du navigateur. |
| [`icons/icon-192.png`](front/icons/icon-192.png), [`icon-512.png`](front/icons/icon-512.png), [`badge-hx1.png`](front/icons/badge-hx1.png) | Icônes par défaut et badge des notifications. |
| [`assets/`](front/assets/) | Trois illustrations de Noël : fond de nuit, guirlande et carte. Ce sont des ressources visuelles, pas de la logique applicative. |

## Serveur et stockage : `api/`

| Fichier | Ce qu’il fait concrètement |
| --- | --- |
| [`src/index.js`](api/src/index.js) | Entrée du Worker. Vérifie les origines autorisées, gère la connexion admin et le planning, puis délègue Documents/Push. Sa fonction `scheduled()` lance les rappels et annonces depuis le cron. |
| [`src/default-data.js`](api/src/default-data.js) | Planning de départ utilisé lorsque D1 ne contient aucun planning. Ce fichier ne remplace pas un planning déjà enregistré dans la base. |
| [`src/documents.js`](api/src/documents.js) | Routes des sources et du catalogue. Valide les URL et métadonnées ; reçoit les lots du collecteur ; rend une génération visible une fois complète ; permet la navigation et la recherche. |
| [`src/document-auth.js`](api/src/document-auth.js) | Mot de passe de classe, limitation des essais et sessions Documents. Vérifie aussi les jetons GitHub Actions du collecteur, avec dépôt, branche, audience et workflow attendus. |
| [`src/document-store.js`](api/src/document-store.js) | Initialise de façon répétable les tables des dates, premières détections et annonces. Prend le catalogue déjà présent comme référence silencieuse. |
| [`src/document-discord.js`](api/src/document-discord.js) | Chiffre les webhooks anglais/physique, prépare les messages de nouveauté ou de mise à jour et traite leurs files d’envoi. Une livraison incertaine est conservée pour vérification plutôt que réémise automatiquement. |
| [`src/notifications.js`](api/src/notifications.js) | Valide et stocke les abonnements push, calcule les instants des colles en heure de Paris et sélectionne les rappels arrivés à échéance. |
| [`src/web-push.js`](api/src/web-push.js) | Chiffre un message pour l’appareil destinataire et signe l’envoi avec VAPID. Ne décide pas quand une colle doit être annoncée. |
| [`wrangler.jsonc`](api/wrangler.jsonc) | Déclare le nom/point d’entrée du Worker, le lien vers D1, les origines autorisées et le cron. |
| [`scripts/vapid-keys.mjs`](api/scripts/vapid-keys.mjs) | Outil local générant les clés VAPID des rappels. Sa sortie inclut une clé privée à saisir dans les secrets Cloudflare. |
| [`package.json`](api/package.json) | Commandes de développement, de vérification, de formatage et de déploiement, avec les dépendances de développement. |
| [`package-lock.json`](api/package-lock.json) | Versions exactes résolues des dépendances, réutilisées par `npm ci`. Fichier généré par npm. |

### Les migrations D1, dans l’ordre

Une migration crée les tables ; elle ne remplace pas le code qui les utilise.

| Fichier | Tables ou fonction ajoutées |
| --- | --- |
| [`0001_initial.sql`](api/migrations/0001_initial.sql) | Planning enregistré (`colloscope_data`) et compteurs d’essais de connexion (`login_attempts`). |
| [`0002_push.sql`](api/migrations/0002_push.sql) | Appareils abonnés (`push_devices`) et rappels réservés/confirmés (`push_deliveries`). |
| [`0003_documents.sql`](api/migrations/0003_documents.sql) | Accès de classe (`document_access`), sources (`document_sources`) et générations du catalogue (`document_items`). |
| [`0004_document_updates.sql`](api/migrations/0004_document_updates.sql) | Dates d’origine, premières détections, webhooks et file d’annonces Discord des documents. |
| [`0005_document_changes.sql`](api/migrations/0005_document_changes.sql) | File persistante des mises à jour, avec une identité par génération pour distinguer deux changements successifs. |

## Trois exemples pour suivre le code

### Une salle est modifiée

1. `admin.mjs` modifie la salle dans son brouillon.
2. `api-client.mjs` envoie ce brouillon avec `expected_updated_at`.
3. `api/src/index.js` vérifie la session et les données, puis écrit dans D1 si la version n’a pas changé.
4. `app.js` recharge la version publiée ; `planning-model.mjs` recalcule les séances et `dom.mjs` actualise les lignes concernées.

### Un nouveau cours arrive

1. Le collecteur Python envoie les métadonnées par lots à `api/src/documents.js`.
2. Une `generation` identifie l’instantané préparé ; la `revision` vérifie que la configuration de source n’a pas changé pendant la collecte.
3. Après validation finale, cette génération devient visible. Les nouveaux fichiers et les changements de taille/date des fichiers existants peuvent entrer dans leurs files Discord, après comparaison avec la génération précédente.
4. `front/documents.js` affiche leurs liens ; `document-discord.js` envoie les annonces autorisées.

### Une colle approche

1. `front/notifications.js` a enregistré l’abonnement de cet appareil et ses délais.
2. Le cron du Worker appelle `api/src/notifications.js`.
3. Ce module réserve le rappel dans D1 ; `web-push.js` chiffre et transmet le message.
4. `front/sw.js` affiche la notification même si la page est fermée.

## Où modifier quoi ?

| Besoin | Premier fichier à ouvrir |
| --- | --- |
| Changer une carte, les semaines ou l’affichage des colles | `front/app.js`, puis `front/style.css` |
| Changer le calcul des séances ou lire un ancien JSON | `front/planning-model.mjs` |
| Ajouter un champ à l’éditeur | `front/admin.mjs`, puis la validation dans `api/src/index.js` |
| Modifier la recherche Documents | `front/documents.js` pour l’interface ; `api/src/documents.js` pour la requête |
| Ajouter une règle de thème | `front/theme-core.mjs`, puis `front/appearance.js` si un contrôle est nécessaire |
| Changer les délais ou le texte des rappels | `api/src/notifications.js` ; `front/notifications.js` pour leur saisie |
| Comprendre un doublon ou un envoi suspendu | `api/src/document-discord.js` et ses états persistants |

## Vérifications et fichiers de travail

| Fichier | Ce qu’il vérifie ou configure |
| --- | --- |
| [`api/test.mjs`](api/test.mjs) | Lecture/sauvegarde de l’API, connexion et conservation de l’apparence. |
| [`api/regressions.test.mjs`](api/regressions.test.mjs) | Connexions concurrentes, données de planning invalides et sauvegardes en conflit. |
| [`api/client.test.mjs`](api/client.test.mjs) | Regroupement des lectures, séparation des sessions, annulation, délais et erreurs réseau. |
| [`api/documents.test.mjs`](api/documents.test.mjs) | Accès de classe/admin/collecteur, lots atomiques, sources, recherche, dates et annonces. |
| [`api/push.test.mjs`](api/push.test.mjs) | Chiffrement, signature, heures de Paris, validation des abonnements et reprise des rappels. |
| [`api/appearance.test.mjs`](api/appearance.test.mjs) | Validation des thèmes et des périodes saisonnières. |
| [`api/icons.test.mjs`](api/icons.test.mjs) | SVG, PNG, manifeste, tailles autorisées et repli lorsque l’API est indisponible. |
| [`api/runtime.test.mjs`](api/runtime.test.mjs) | Worker exécuté dans Miniflare avec D1 : concurrence et compatibilité des envois Discord. |
| [`api/browser-tests/collo.spec.mjs`](api/browser-tests/collo.spec.mjs) | Parcours réels dans Chromium, en vues mobile et bureau, avec API simulée. |
| [`api/playwright.config.mjs`](api/playwright.config.mjs) | Configure ces deux vues et le serveur local des tests. |
| [`api/browser-server.mjs`](api/browser-server.mjs) | Sert uniquement les fichiers statiques aux tests navigateur sur `127.0.0.1:4173`. |
| [`.github/workflows/check.yml`](.github/workflows/check.yml) | Lance les vérifications sur les pull requests et sur main. |
| [`.prettierrc.json`](.prettierrc.json) | Format commun du JavaScript, HTML et CSS. |
| [`api/.gitignore`](api/.gitignore) | Exclut dépendances, état local Wrangler, configuration privée et résultats de tests. |

Depuis `api/` :

```bash
npm ci --ignore-scripts
npm run format:check
npm run check
npm run check:runtime
npx playwright install chromium
npm run check:browser
```

`npm run format` remet les sources en forme. Les tests du Worker et du navigateur remplacent leurs services externes par des réponses simulées. `node_modules/`, `.wrangler/` et `test-results/` sont des fichiers de travail générés, pas des sources à maintenir.

[`api/document-changes.test.mjs`](api/document-changes.test.mjs) vérifie les comparaisons d’instantanés anglais/physique, les reprises, la pause et les livraisons incertaines dans SQLite, sans réseau externe.
