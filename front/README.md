# Front — Cloudflare Pages

Voir aussi le [guide complet des fichiers et des parcours de données](../README.code.md).

Site statique en HTML, CSS et JavaScript, sans étape de compilation.

Avant le premier déploiement, ouvre `config.js` et remplace `CHANGE-ME` par l’URL publique du Worker, sans `/` final.

Dans le projet Cloudflare Pages relié à GitHub :

- **Framework preset** : None
- **Root directory** : `front`
- **Build command** : `exit 0`
- **Build output directory** : `.`

Pour tester localement :

```bash
python3 -m http.server 8080
```

Ouvre ensuite `http://127.0.0.1:8080`.

## Organisation du front

- `app.js` : état du planning public et rafraîchissement.
- `planning-model.mjs` : dates, import/normalisation JSON et calcul des colles, avec cache par version des données et groupe.
- `admin.mjs` : édition, import/export et sauvegarde du brouillon avec sa version d’origine.
- `api-client.mjs` : client JSON commun au planning, aux Documents et aux rappels ; lectures simultanées regroupées par session, délai maximal et annulation explicite. Les écritures ne sont jamais regroupées ni réémises automatiquement.
- `dom.mjs` : mise à jour des blocs et lignes conservées par identifiant. Les boutons gardent leur focus et la bande des semaines n’est recentrée que lors d’une sélection explicite.
- le lien vers Prépa Sync et `notifications.js` : espace Documents et rappels. Une recherche obsolète ou une fermeture de l’espace Documents annule ses lectures en cours.

Les modules sont ajoutés au cache de la coque PWA. Les réponses de l’API, documents et sessions restent hors de ce cache.
