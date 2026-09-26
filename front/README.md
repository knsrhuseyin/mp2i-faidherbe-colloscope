# Front — Cloudflare Pages

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
