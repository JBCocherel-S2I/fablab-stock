# Spécifications : outil de gestion du stock de matières du fablab

Document destiné à Claude Code. Il décrit le besoin, les décisions déjà prises, le modèle de données, les écrans, les règles de gestion et la méthode de livraison.

Contexte : fablab du Lycée Jean Moulin (STI2D). Matières suivies : filament pour imprimantes 3D et plaques pour découpeuse laser.

---

## 1. Objectif

Savoir à tout moment ce qu'il reste de chaque matière, qui a prélevé quoi, quand, pour quelle machine et quel projet ou quelle classe, et produire une liste de réapprovisionnement exploitable pour passer commande.

## 2. Décisions actées (ne pas remettre en cause sans validation)

| Sujet | Décision |
|---|---|
| Hébergement | Cloudflare Workers + base D1, offre gratuite, coût total 0 euro |
| Accès | Site web utilisable sur téléphone et PC, installable comme une appli (PWA) |
| Utilisateurs | Enseignants et gestionnaire du fablab uniquement, pas d'accès élève |
| Comptes | Aucun système de création de compte, aucun mot de passe individuel |
| Protection de l'accès | Un code commun pour entrer dans l'application, un code gestionnaire distinct pour le catalogue, la liste des enseignants et les corrections |
| Identification de l'enseignant | Liste de noms prédéfinie et gérée par le gestionnaire, l'enseignant choisit son nom dans la liste |
| Suivi du filament | Par référence, en nombre de bobines entières (les bobines restent dans le CFS, pas de suivi à la bobine ni de pesée) |
| Suivi des plaques | Par référence, en nombre de plaques entières |
| Prélèvement | Enseignant, quantité, machine, projet ou classe, date automatique |
| Réapprovisionnement | Liste à commander calculée et exportable, sans suivi de l'état des commandes |
| QR code | Un seul QR code, celui qui ouvre l'application. Aucun QR code par référence, par bobine ou par étagère |
| Identité visuelle | Métaphore du rayonnage et des casiers (voir section 7.1). Volontairement distincte des autres outils de l'enseignant : ne pas reprendre leur charte graphique (Verdana, bleu et orange Okabe-Ito, panneaux arrondis, thème clair et sombre) |
| Versionnage | Dépôt GitHub |
| Sauvegarde | Export nocturne de la base, récupéré par un Raspberry |

## 3. Utilisateurs et niveaux d'accès

- **Enseignant** : entre avec le code commun, choisit son nom dans la liste, consulte le stock, enregistre ses prélèvements et ses entrées de stock, annule un mouvement dans les conditions de la section 6, consulte l'historique, consulte et exporte la liste à commander.
- **Gestionnaire du fablab** : tout ce que fait un enseignant, plus, après saisie du code gestionnaire, la gestion du catalogue (références, seuils, machines), de la liste des enseignants, des deux codes, et les corrections d'inventaire.

Limite assumée : le nom est déclaratif. L'outil ne peut pas vérifier que la personne qui choisit un nom est bien celle-ci. Ce niveau de confiance est jugé suffisant pour un fablab entre collègues. Pour limiter les erreurs de saisie, le dernier nom choisi est mémorisé sur l'appareil et proposé par défaut.

Données personnelles : seuls des noms d'enseignants sont stockés. Aucune donnée d'élève.

## 4. Modèle de données

### 4.1 Référence de matière (`material`)

| Champ | Détail |
|---|---|
| id | identifiant |
| type | `filament` ou `plaque` |
| matériau | PLA, PETG, ABS, TPU... pour le filament ; contreplaqué, MDF, PMMA, carton... pour les plaques |
| couleur ou aspect | texte libre |
| teinte d'affichage | code couleur choisi à la création, utilisé pour la pastille et le pictogramme du casier (par exemple la vraie couleur du filament, ou la teinte du bois ou du plastique pour une plaque) |
| marque | texte libre, facultatif |
| diamètre | filament uniquement (1,75 mm ou 2,85 mm) |
| épaisseur | plaques uniquement, en mm |
| format | plaques uniquement, longueur x largeur en mm |
| fournisseur | texte libre, facultatif |
| seuil d'alerte | entier, en unités |
| niveau cible | entier, en unités, supérieur ou égal au seuil |
| stock actuel | entier, calculé à partir des mouvements |
| actif | booléen, une référence se désactive, elle ne se supprime jamais |

Une unité = une bobine entière pour le filament, une plaque entière pour les plaques.

### 4.2 Mouvement (`movement`)

| Champ | Détail |
|---|---|
| id | identifiant |
| date et heure | automatique |
| référence | lien vers `material` |
| nature | `prelevement`, `entree`, `correction` ou `annulation` |
| quantité | entier strictement positif, le signe est déduit de la nature (correction : entier relatif) |
| enseignant | lien vers la liste des enseignants, choisi à chaque saisie |
| machine | obligatoire pour un prélèvement |
| projet ou classe | obligatoire pour un prélèvement |
| commentaire | facultatif |
| mouvement annulé | pour une annulation, lien vers le mouvement d'origine |

Le stock actuel d'une référence est toujours la somme des mouvements. Un mouvement n'est jamais modifié ni supprimé.

### 4.3 Machine (`machine`)

Nom (par exemple "Imprimante 1", "Découpeuse laser"), type compatible (`filament` ou `plaque`), actif. Gérée par le gestionnaire.

### 4.4 Enseignant (`teacher`)

Nom d'affichage, actif. Liste gérée par le gestionnaire. Un enseignant retiré de la liste est désactivé (il disparaît du sélecteur) mais reste visible dans l'historique. Il n'y a ni identifiant, ni mot de passe, ni rôle associé à un enseignant.

### 4.5 Paramètres d'accès (`settings`)

Deux secrets stockés sous forme de hachage : le code commun et le code gestionnaire. Tous deux sont modifiables par le gestionnaire depuis l'application. Le premier code gestionnaire est défini à l'installation par une variable secrète, jamais écrite dans le dépôt GitHub.

### 4.6 Projet ou classe

Champ texte à saisie libre avec suggestions automatiques construites à partir des valeurs déjà utilisées, pour éviter les variantes d'écriture. À confirmer en fin de première livraison (voir section 11).

## 5. Écrans et comportements

### 5.1 Accès
- Écran de saisie du code commun. Une fois validé, la session est maintenue longtemps sur l'appareil pour ne pas redemander le code à chaque usage.
- Le mode gestionnaire s'obtient en saisissant le code gestionnaire depuis un menu discret. Cette session est plus courte et se referme d'elle-même après inactivité.
- Protection contre les essais répétés : limitation du nombre de tentatives, avec message clair.

### 5.2 Tableau de bord (vue en casiers)
- Les références actives sont présentées comme un rayonnage : une étagère "Filament" et une étagère "Plaques", chacune composée de casiers.
- Un casier correspond à une référence. Il affiche un pictogramme (une bobine pour le filament, une pile de plaques vue en coupe pour les plaques) rempli selon le stock rapporté au niveau cible, la teinte de la matière, une étiquette (matériau, couleur, diamètre ou épaisseur et format) et le stock en grands chiffres. Le seuil et le niveau cible ne sont pas affichés sur le casier, ils servent uniquement à déclencher l'état "À commander".
- Un casier au seuil ou en dessous reçoit la mention écrite "À commander" et un contour renforcé, en plus de sa couleur. L'état ne repose jamais sur la couleur seule.
- Toucher un casier ouvre l'écran de prélèvement avec la référence déjà choisie.
- Filtres : type (filament ou plaque), matériau, couleur, épaisseur. Recherche texte.
- Une vue en liste (tableau) est disponible d'un bouton, utile pour trier et comparer sur PC, et comme alternative accessible à la vue en casiers.
- Disposition : 2 colonnes de casiers sur téléphone, 4 à 6 sur PC.

### 5.3 Prélèvement
- Choix de l'enseignant dans la liste, pré-rempli avec le dernier nom utilisé sur l'appareil.
- Choix de la référence : déjà faite si l'on arrive depuis un casier, sinon liste avec recherche, les plus utilisées en tête.
- Quantité (par défaut 1, boutons plus et moins adaptés au toucher).
- Machine (liste filtrée selon le type de matière).
- Projet ou classe.
- Commentaire facultatif.
- Confirmation claire après enregistrement avec le nouveau stock affiché.
- Blocage avec message explicite si la quantité demandée dépasse le stock.
- Possibilité d'annuler le mouvement juste après l'avoir enregistré.

### 5.4 Entrée de stock
Choix de l'enseignant, de la référence, quantité reçue, commentaire facultatif (par exemple numéro de bon de livraison). Crée un mouvement de nature `entree`.

### 5.5 Historique
- Tableau des mouvements, du plus récent au plus ancien.
- Filtres : période, enseignant, référence ou matière, machine, projet ou classe, nature.
- Export CSV de la sélection filtrée.

### 5.6 À commander
- Liste automatique des références actives dont le stock est inférieur ou égal au seuil.
- Quantité suggérée = niveau cible moins stock actuel.
- La quantité suggérée est modifiable à l'écran avant export, sans effet sur les données.
- Export CSV (encodage UTF-8 avec BOM, séparateur point-virgule, pour une ouverture directe dans Excel en version française). Colonnes : type, matériau, couleur, marque, diamètre ou épaisseur et format, fournisseur, stock actuel, seuil, niveau cible, quantité à commander.
- Version imprimable.

### 5.7 Catalogue (gestionnaire)
Création, modification et désactivation des références et des machines. Réglage du seuil et du niveau cible.

### 5.8 Liste des enseignants (gestionnaire)
Ajout, renommage et désactivation d'un nom. Le renommage s'applique aussi à l'historique, puisque les mouvements pointent vers l'enseignant et non vers un texte.

### 5.9 Codes d'accès (gestionnaire)
Modification du code commun et du code gestionnaire. Prévu pour changer le code commun en cas de fuite ou en début d'année scolaire.

### 5.10 Correction d'inventaire (gestionnaire)
Après comptage réel, le gestionnaire saisit le stock constaté. L'outil crée un mouvement de nature `correction` égal à l'écart, avec commentaire obligatoire.

## 6. Règles de gestion

1. Un stock ne peut pas devenir négatif. Un prélèvement supérieur au stock est refusé.
2. Aucun mouvement n'est modifié ni supprimé. Toute erreur se corrige par un mouvement inverse (annulation) ou une correction d'inventaire.
3. Comme l'identité n'est pas vérifiée, l'annulation par un enseignant est encadrée autrement : seul le dernier mouvement d'une référence peut être annulé, uniquement si aucun autre mouvement n'a été enregistré depuis sur cette référence, et dans un délai de 24 heures. L'annulation est elle-même tracée avec le nom choisi par la personne qui annule. Le gestionnaire peut annuler n'importe quel mouvement.
4. Une référence présente dans l'historique ne peut être que désactivée. Une référence désactivée n'apparaît plus dans les listes de saisie ni dans le point de commande.
5. Le niveau cible est toujours supérieur ou égal au seuil d'alerte.
6. Date et heure enregistrées côté serveur, affichées en heure de Paris.
7. Les alertes sont uniquement visuelles dans l'outil, sans envoi d'e-mail.
8. Seul un nom actif de la liste peut être associé à un nouveau mouvement. Les anciens mouvements gardent le nom d'origine, même désactivé.

## 7. Exigences non fonctionnelles

- **Responsive** : usage principal sur téléphone dans l'atelier, usage secondaire sur PC pour l'historique, le tableau de bord et les exports. Zones tactiles larges.
- **PWA** : manifeste et icône pour l'ajout à l'écran d'accueil. Pas de mode hors ligne en version 1 (une connexion internet est nécessaire).
- **Accessibilité** : exigences détaillées en section 7.1. Contrastes conformes WCAG AA vérifiés par code, information jamais portée par la couleur seule, respect de `prefers-reduced-motion`, navigation au clavier.
- **Langue** : interface entièrement en français.
- **Performance** : usage à quelques utilisateurs, très en dessous des limites de l'offre gratuite Cloudflare. Les limites exactes sont à revérifier dans la documentation Cloudflare au moment de la conception.
- **Sécurité** : les deux codes sont stockés sous forme de hachage robuste, jamais en clair. Cookies de session sécurisés. Limitation des tentatives de saisie de code. Aucun secret dans le dépôt GitHub. Contrôle du niveau d'accès côté serveur pour toutes les actions réservées au gestionnaire, jamais uniquement côté interface.

### 7.1 Identité visuelle

Objectif : un outil qui ne ressemble pas aux autres productions de l'enseignant et qui évoque le fablab.

**Maquette validée par l'enseignant** : https://claude.ai/artifact/3ZP36zwM3yw9sfHr1yyrGQ (trois écrans de téléphone : tableau de bord en casiers, prélèvement de filament, prélèvement de plaque pour la découpeuse laser). Elle fait foi pour l'esprit visuel, l'organisation des écrans et le style des composants.

Valeurs de référence relevées sur la maquette (à reprendre comme variables CSS, contrastes WCAG AA à revérifier par code) :

| Rôle | Valeur |
|---|---|
| Fond de page (bois clair) | `#E8D6B1` |
| Montants et barres (acier) | `#4A535A` |
| Encre, contours, texte | `#1F1B16` |
| Texte secondaire | `#5A5148` |
| Étiquette papier | `#FFFDF6` |
| Fond de casier | `#F6EBD3` |
| Planche d'étagère | `#A9824C` |
| Alerte stock bas (brique) | `#B3361F` |

États d'un casier : "EN STOCK" (contour noir, étiquette sobre) et "! À COMMANDER" (contour brique renforcé, bandeau brique plein, texte blanc). L'écran de prélèvement garde exactement la même structure pour un filament et pour une plaque : seuls changent le pictogramme, l'unité (bobines ou plaques) et la liste des machines proposées. Les quantités affichent uniquement le stock, sans "/ niveau cible".

- **Métaphore** : un rayonnage d'atelier. Étagères, casiers, étiquettes papier collées sur les cases.
- **Matières et palette** : couleurs inspirées de matériaux réels (bois clair type contreplaqué, acier galvanisé, papier d'étiquette blanc cassé, encre noire). Une couleur d'accentuation unique et sobre, réservée aux alertes de stock. Pas de bleu et orange Okabe-Ito par défaut, pas de dégradés, pas d'effet de verre dépoli. Les teintes de filament affichées dans les pictogrammes proviennent du champ `teinte d'affichage` de chaque référence.
- **Formes** : angles droits ou très peu arrondis, contours francs, ombres portées nettes sans flou. Aspect "objet fabriqué" plutôt que "carte logicielle".
- **Typographie** : police conçue pour la lisibilité, Atkinson Hyperlegible, hébergée avec l'application (aucun service externe). Étiquettes en capitales espacées, chiffres de stock très grands et très lisibles.
- **Pictogrammes** : bobine et pile de plaques dessinées en SVG, générées par code à partir de l'état (stock, niveau cible, teinte), jamais figées. Toutes les couleurs passent par des variables CSS.
- **Mouvement** : retour discret au prélèvement (une unité "quitte" le casier), désactivé automatiquement si l'utilisateur a demandé une réduction des animations.
- **Thème** : un thème clair unique en version 1 (un atelier est lumineux, et cela évite de doubler le travail de vérification des contrastes). Pas de commutateur.
- **Écrans secondaires** : l'historique reste un tableau sobre, la liste à commander prend l'allure d'un bon de commande imprimable.

### 7.2 Usage sur PC

L'outil est conçu mobile d'abord pour l'atelier, mais il doit être pleinement utilisable sur PC, usage privilégié du gestionnaire pour l'administration, l'historique et les commandes.

- **Maquette PC validée par l'enseignant** : même lien que la maquette mobile (https://claude.ai/artifact/3ZP36zwM3yw9sfHr1yyrGQ), quatre écrans en dessous des écrans de téléphone : stock en casiers, historique, à commander (bon de réapprovisionnement) et administration (catalogue). Elle fait foi pour la disposition sur grand écran. Les onglets Machines, Enseignants, Codes d'accès et Inventaire de l'administration ne sont pas maquettés : ils suivent le même style que le catalogue.
- **Même identité visuelle** que sur téléphone : rayonnage, casiers, étiquettes, mêmes couleurs.
- **Navigation** : barre latérale ou barre supérieure permanente (Stock, Prélever, Historique, À commander, et une entrée Administration visible après saisie du code gestionnaire), à la place de la barre inférieure du téléphone.
- **Tableau de bord** : étagères sur toute la largeur, 4 à 6 casiers par rangée, filtres visibles en permanence, bascule casiers ou liste.
- **Historique** : tableau large avec filtres toujours affichés, tri par colonne, export CSV.
- **À commander** : pleine page, quantités modifiables avant export, export CSV et impression en un clic.
- **Administration** (gestionnaire) : catalogue, machines, liste des enseignants, codes d'accès et corrections d'inventaire, avec saisie plus confortable au clavier (formulaires sur deux colonnes, tabulation logique).
- **Prélèvement** : reste possible sur PC avec le même écran, centré et limité en largeur.
- Une seule base de code responsive, pas deux applications. Points de rupture à fixer en conception.

## 8. Architecture technique

- **Calcul** : Cloudflare Workers.
- **Base de données** : Cloudflare D1 (SQLite). Rester sur du SQL standard et isoler l'accès aux données dans une couche dédiée, afin de pouvoir migrer plus tard vers un Raspberry avec une base SQLite locale sans réécrire l'application.
- **Interface** : site web adapté au mobile, sans dépendance lourde, assets servis par Cloudflare.
- **Contrôle d'accès** : deux codes (commun et gestionnaire), sessions par cookie sécurisé. Aucun service d'authentification externe, aucune création de compte.
- **Dépôt** : GitHub, branche principale protégée, déploiement depuis le dépôt.
- **Sauvegarde** : un export complet de la base est produit chaque nuit et récupéré par le Raspberry (script planifié), conservé sur plusieurs jours avec rotation. Documenter la procédure de restauration.
- **Adresse** : sous-domaine fourni gratuitement par Cloudflare, aucun nom de domaine à acheter.
- **QR code d'accès** : hors de l'application. Il sera généré une fois l'adresse définitive connue (image et fichier vectoriel statiques, sans service tiers), à afficher dans le fablab.

## 9. Plan de livraison par blocs courts et testables

La validation de l'enseignant est attendue entre chaque bloc.

1. **Socle** : dépôt GitHub, déploiement Workers + D1, page d'accueil, schéma de base de données et migrations.
2. **Accès** : saisie du code commun, mode gestionnaire par second code, sessions, limitation des tentatives, modification des codes, liste des enseignants.
3. **Catalogue** : références et machines (création, modification, désactivation).
4. **Mouvements** : entrée de stock, prélèvement, annulation, correction d'inventaire, avec toutes les règles de gestion.
5. **Tableau de bord** et **historique** avec filtres, sur téléphone et sur PC. Les maquettes mobile et PC sont déjà validées (sections 7.1 et 7.2).
6. **À commander** avec export CSV et version imprimable.
7. **PWA et finitions** : manifeste, icône, identité visuelle complète, accessibilité, tests sur téléphone réel.
8. **Sauvegarde nocturne** et procédure de restauration testée.
9. **Documentation** : guide court pour les enseignants et notice d'administration.

Critères d'acceptation transversaux : chaque règle de gestion de la section 6 est couverte par un test, toutes les interfaces fonctionnent sur un petit écran de téléphone, les actions réservées au gestionnaire sont refusées côté serveur sans le code gestionnaire, et aucun calcul de stock n'est présenté sans avoir été vérifié par du code exécuté.

## 10. Hors périmètre de la version 1

Comptes individuels et authentification par personne, saisie par les élèves, QR code par référence ou par étagère, suivi des chutes de plaques, suivi à la bobine et pesée, suivi de l'état des commandes (passée, reçue), gestion des prix et des budgets, notifications par e-mail, mode hors ligne, thème sombre, plusieurs fablabs.

## 11. Points ouverts à trancher en cours de projet

1. Projet ou classe : saisie libre avec suggestions (proposition par défaut) ou liste gérée par le gestionnaire.
2. Durée de maintien de la session pour l'accès commun, et durée d'inactivité avant fermeture du mode gestionnaire.
3. Durée de conservation des sauvegardes sur le Raspberry.
4. Liste initiale des références, des machines et des noms d'enseignants à saisir pour démarrer (fournie par l'enseignant).
