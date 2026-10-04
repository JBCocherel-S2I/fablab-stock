# Fablab Stock

Suivi du stock de matières du fablab (filament pour imprimantes 3D, plaques pour découpeuse laser).
Spécifications : [Docs/specifications-gestion-stock-fablab.md](Docs/specifications-gestion-stock-fablab.md).

Hébergement : Cloudflare Workers + base D1, offre gratuite.

**Site en ligne : https://fablab-stock.fablab-stock.workers.dev**
(QR code d'accès dans [Docs/qr-code/](Docs/qr-code/)). Chaque envoi sur la branche `main` redéploie le
site automatiquement. Une nouvelle migration de la base s'applique à la main : `npm run migrer:prod`.

## Documentation

- [Guide des enseignants](Docs/guide-enseignants.md)
- [Notice d'administration](Docs/notice-administration.md), dont la procédure à suivre si le code gestionnaire est oublié

## Avancement

- [x] Bloc 1 : socle (projet, schéma de base, migrations, page d'accueil, tests)
- [x] Bloc 2 : accès (codes, sessions, limitation des essais, liste des enseignants)
- [x] Bloc 3 : catalogue (références et machines : création, modification, désactivation)
- [x] Bloc 4 : mouvements (prélèvement, entrée de stock, annulation, correction d'inventaire)
- [x] Bloc 5 : tableau de bord en casiers et historique (filtres, tri, export CSV, annulation)
- [x] Bloc 6 : à commander (bon de réapprovisionnement, export CSV, impression)
- [x] Bloc 7 : PWA et finitions (manifeste, icônes, animation, accessibilité)
- [x] Bloc 9 : documentation

La sauvegarde nocturne (bloc 8) est mise de côté pour le moment.

## Organisation du dépôt

| Dossier | Contenu |
|---|---|
| `src/index.ts`, `src/app.ts` | Point d'entrée du Worker et assemblage de l'API |
| `src/routes/` | Routes de l'API |
| `src/acces/` | Codes, hachage, sessions, réglages de l'accès |
| `src/mouvements/regles.ts` | Règles de gestion des mouvements (section 6 des spécifications). Toute écriture de mouvement passe par ce fichier |
| `src/catalogue/` | Contrôle des données du catalogue |
| `src/donnees/` | Couche d'accès aux données. `base.ts` est le contrat, `d1.ts` l'adaptateur Cloudflare D1. Seul `d1.ts` connaît D1 : une migration vers SQLite sur Raspberry se limite à écrire un second adaptateur |
| `src/commun/` | Fonctions partagées (heure de Paris, contraste) |
| `migrations/` | Schéma de la base, en SQL compatible SQLite |
| `public/` | Interface (HTML, CSS, JavaScript, police), servie directement par Cloudflare |
| `tests/` | Tests exécutés sur une vraie base SQLite locale |

## Commandes

```bash
npm install            # installer les dépendances (une fois)
npm run migrer:local   # créer ou mettre à jour la base locale
npm run demo:local     # charger les données fictives des maquettes (base locale uniquement)
npm run dev            # lancer l'application sur http://localhost:8787
npm test               # exécuter les tests
npm run verifier       # vérifier les types
npm run dev:reseau     # comme dev, mais joignable depuis un téléphone du même réseau
npm run icones         # régénérer les icônes (seulement si le dessin change)
```

La page http://localhost:8787/etat.html indique si l'application et la base répondent.

Pour repartir d'une base locale vide : arrêter `npm run dev`, supprimer le dossier `.wrangler/state`,
puis relancer `npm run migrer:local`.

## Secrets

Aucun secret (code d'accès, jeton) ne doit être écrit dans ce dépôt.

Le seul secret de l'application est `CODE_GESTIONNAIRE_INITIAL` : le premier code gestionnaire
(8 caractères au minimum). Il ne sert qu'à la toute première ouverture du mode gestionnaire. Il est
alors enregistré sous forme de hachage dans la base, et se change ensuite depuis l'application
(Administration > Codes d'accès).

- **En local** : copiez `.dev.vars.exemple` sous le nom `.dev.vars` et choisissez une valeur.
  Le fichier `.dev.vars` est ignoré par git.
- **En ligne** : commande `npx wrangler secret put CODE_GESTIONNAIRE_INITIAL`, ou tableau de bord
  Cloudflare (Worker `fablab-stock` > Paramètres > Variables et secrets > type « Secret »).
  La valeur est chiffrée et n'est plus lisible ensuite.

Le code d'accès commun n'est pas un secret de déploiement : le gestionnaire le définit dans
l'application à la première mise en service.

L'identifiant de la base D1 dans `wrangler.jsonc` n'est pas un secret : il ne donne aucun accès
sans le compte Cloudflare.

## Accès : réglages

Les durées et limites sont regroupées dans `src/acces/reglages.ts` : session de 90 jours, mode
gestionnaire refermé après 15 minutes sans action, 5 essais de code par appareil et 30 au total par
quart d'heure.

**Coût du hachage des codes : `ITERATIONS_HACHAGE`** (dans `wrangler.jsonc`). Les codes sont hachés
avec PBKDF2-SHA256. L'offre gratuite Cloudflare annonce 10 ms de temps processeur par requête.
Mesures faites en ligne le 4 octobre 2026 : une requête ordinaire coûte 1 à 4 ms, et un hachage
environ 20 ms pour 100000 itérations. Cloudflare a accepté ces dépassements, sans garantie pour
l'avenir. Le réglage retenu est **25000** : la saisie d'un code coûte alors 10 à 15 ms (mesuré), à la
limite de ce qui est annoncé. Pour rester nettement dessous, descendre à 10000.

Après un changement de cette valeur, les codes déjà enregistrés restent valables avec leur ancien
coût ; ils prennent le nouveau quand on les change depuis l'application.

## Essai sur un téléphone, avant la mise en ligne

1. Arrêter `npm run dev`, puis lancer `npm run dev:reseau`.
2. Relever l'adresse IPv4 du PC (commande `ipconfig` sous Windows).
3. Sur le téléphone, connecté au même réseau Wi-Fi, ouvrir `http://ADRESSE-DU-PC:8787`.

Windows peut demander d'autoriser l'accès au réseau lors du premier lancement. L'installation sur
l'écran d'accueil ne se teste réellement qu'une fois le site en ligne, en HTTPS.

## Icônes et police

Les icônes de `public/icones/` sont produites par `scripts/generer-icones.mjs`, sans dépendance.


Police : Atkinson Hyperlegible (Braille Institute, licence SIL OFL), hébergée dans `public/polices/`.
