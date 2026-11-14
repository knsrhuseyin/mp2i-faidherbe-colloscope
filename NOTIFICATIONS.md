# Collo sur iPhone et Android

Le dossier `front` est une PWA installable. Le bouton **Rappels** permet d’installer l’application et d’activer jusqu’à cinq rappels par colle, de 0 à 10 080 minutes avant le début. Les réglages sont propres au téléphone et suivent son groupe sélectionné après confirmation du serveur. Un test et une désactivation sont disponibles.

Les notifications sont envoyées par le Worker Cloudflare, même si l’application est fermée. Aucun onglet ouvert ni minuteur sur le téléphone n’est nécessaire. Les dates sont calculées en `Europe/Paris`, avec les changements d’heure. Le planning enregistré dans D1 est relu à chaque exécution.

## Activation dans Cloudflare

Le code seul n’active pas les notifications : il faut appliquer la migration et ajouter les clés dans le compte Cloudflare qui héberge déjà l’API. Conserver la même clé publique au fil des déploiements ; changer de paire impose de réabonner les téléphones.

Depuis `api`, avec Node 22.13+ (Node 24 recommandé) :

```bash
npm install
npx wrangler login
npx wrangler d1 migrations apply colloscope-db --remote
node scripts/vapid-keys.mjs
```

La dernière commande génère la paire de clés localement. Ne jamais committer les clés privées. Copier chaque valeur dans le secret correspondant, via les invites de Wrangler :

```bash
npx wrangler secret put VAPID_PUBLIC_KEY
npx wrangler secret put VAPID_PRIVATE_KEY
npx wrangler secret put VAPID_SUBJECT
```

`VAPID_SUBJECT` est une adresse de contact de l’administrateur sous la forme `mailto:ton-adresse@example.com`. La clé publique est destinée à être accessible aux navigateurs ; la clé privée reste dans les secrets du Worker.

```bash
npm run check
npx wrangler deploy
```

`wrangler.jsonc` ajoute un Cron Trigger chaque minute. Vérifier son activation dans Cloudflare **Worker → Settings → Trigger Events**. Déployer aussi le dossier `front` dans le projet Pages existant (automatique après fusion si l’intégration Git décrite dans le README est configurée).

Ne pas changer le nom du Worker, l’identifiant de la base D1 ou `ALLOWED_ORIGINS`. Si le front est servi depuis une autre origine, l’ajouter explicitement à `ALLOWED_ORIGINS`. HTTPS est obligatoire pour l’installation et les notifications.

Sans les trois secrets, l’API renvoie `enabled: false` et l’interface explique que le serveur n’est pas activé. La migration doit précéder l’activation des secrets et le déploiement du nouveau Worker.

## Installation et vérification sur téléphone

1. Ouvrir l’adresse Cloudflare Pages du colloscope et choisir son groupe.
2. Sur iPhone avec iOS 16.4+ : Safari → Partager → Sur l’écran d’accueil, puis ouvrir cette icône. Sur Android : bouton Installer dans Rappels ou menu de Chrome → Installer l’application.
3. Ouvrir **Rappels**, saisir par exemple `15, 60, 1440`, puis **Activer / Enregistrer**. Autoriser les notifications du téléphone.
4. Cliquer sur **Tester** et vérifier la réception. Vérifier aussi en fermant l’application.
5. Pour vérifier le Cron, créer depuis l’administration une colle de test quelques minutes dans le futur et régler un rappel à 0. Fermer l’application, vérifier l’arrivée, puis supprimer le créneau de test.
6. Changer de groupe et vérifier les réglages ; désactiver les rappels et vérifier qu’aucun rappel ultérieur n’est envoyé sur cet appareil.

La réception dépend du réseau, des permissions et du système (mode concentration, économie d’énergie, etc.). Le Cron fonctionne à la minute ; ce n’est pas une alarme à la seconde. Les erreurs temporaires sont réessayées dans une fenêtre de cinq minutes, sans envoyer de vieux rappels après la colle. Une erreur 404/410 du service push supprime l’abonnement expiré.

Les abonnements contiennent une adresse technique de service push, ses clés, un groupe et les délais. Ils sont conservés dans D1 jusqu’à désactivation ou expiration détectée. Les traces d’envoi sont purgées après huit jours. L’API n’accepte que les services push de navigateurs connus, limite les écritures par IP et exige un identifiant aléatoire de 256 bits propre à l’appareil. Les endpoints et clés ne sont jamais journalisés.

## Validation automatisée

`npm run check` exécute les tests de l’API existante et les tests push sur une base SQLite en mémoire : migrations, réglages, chiffrement/déchiffrement RFC 8291, signature VAPID, été/hiver, validation des endpoints, dédoublonnage, reprise après erreur et désactivation. Ces tests n’envoient rien à un téléphone et ne remplacent pas la vérification réelle ci-dessus.

Le service worker met uniquement la coque de l’application en cache, jamais les réponses API ni les sessions d’administration. La consultation du planning nécessite toujours Internet. Lors d’une future mise à jour des fichiers de la coque, incrémenter `CACHE` dans `front/sw.js` ; la nouvelle version s’active lorsque les fenêtres de l’ancienne version sont fermées.
