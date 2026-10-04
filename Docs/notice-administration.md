# Fablab Stock : notice d'administration

Cette notice s'adresse au gestionnaire du fablab. Le fonctionnement courant est décrit dans le
[guide des enseignants](guide-enseignants.md).

## Les deux codes

| Code | Qui le connaît | Il sert à |
|---|---|---|
| Code d'accès commun | Tous les enseignants | Entrer dans l'application |
| Code gestionnaire | Le gestionnaire seul | Ouvrir l'administration |

Les deux codes doivent être différents. Aucun n'est conservé en clair : l'application n'en garde
qu'une empreinte, et personne ne peut les relire, pas même vous.

## Ouvrir le mode gestionnaire

- **Sur PC** : bouton **Mode gestionnaire**, en bas de la barre latérale.
- **Sur téléphone** : bouton **Menu**, puis **Mode gestionnaire**.

Saisissez le code gestionnaire. L'entrée **Administration** apparaît alors dans la navigation.

Le mode se referme de lui-même après **15 minutes sans action d'administration**. Vous pouvez aussi
le refermer avec « Quitter le mode gestionnaire ». Sur un appareil partagé, refermez-le toujours.

## Première mise en service

1. Ouvrez l'application : elle affiche « Mise en service ».
2. Saisissez le code gestionnaire initial (celui défini lors de l'installation).
3. Définissez le **code d'accès commun** (6 caractères au minimum), puis communiquez-le aux enseignants.
4. Changez le **code gestionnaire** (8 caractères au minimum) dans le second panneau du même écran.
5. Onglet **Enseignants** : ajoutez les noms.
6. Onglet **Machines** : ajoutez les imprimantes et la découpeuse laser.
7. Onglet **Catalogue** : ajoutez les références de filament et de plaques.
8. Onglet **Inventaire** : saisissez le stock réel de chaque référence, avec le commentaire
   « Inventaire initial ».

## Administration, onglet par onglet

### Catalogue

Une référence décrit une matière : type, matériau, couleur, teinte d'affichage, diamètre (filament)
ou épaisseur et format (plaque), marque et fournisseur facultatifs.

- **Seuil** : au seuil ou en dessous, la référence passe « À commander ».
- **Cible** : le stock visé après une commande. Elle est toujours supérieure ou égale au seuil.
- **Teinte d'affichage** : la couleur réelle de la matière, pour le pictogramme du casier.

Une référence ne se supprime jamais : elle se **désactive**. Elle disparaît alors du stock, de la
saisie et de la liste à commander, mais reste dans l'historique. Elle se réactive d'un clic.

Le type d'une référence (filament ou plaque) ne peut plus changer après sa création.

### Machines

Chaque machine utilise un type de matière : seules les machines compatibles sont proposées lors d'un
prélèvement. Une machine se désactive, elle ne se supprime pas.

### Enseignants

La liste des noms proposés à la saisie. Il n'y a ni compte ni mot de passe par personne : le nom est
déclaratif.

- **Renommer** un nom le corrige aussi dans tout l'historique.
- **Désactiver** un nom le retire de la saisie ; ses anciens mouvements restent à son nom.

### Codes d'accès

- **Code d'accès commun** : à changer en début d'année scolaire, ou s'il a circulé. Tous les autres
  appareils sont alors déconnectés et devront saisir le nouveau code.
- **Code gestionnaire** : le code actuel est redemandé pour le changer.

### Inventaire

Après un comptage réel, cliquez **Corriger** sur la référence, saisissez le **stock constaté**,
choisissez votre nom et indiquez un commentaire (obligatoire). L'application enregistre l'écart comme
un mouvement de correction, visible dans l'historique.

## Annuler un mouvement

Dans **Historique**, en mode gestionnaire, le bouton **Annuler** est proposé sur tous les mouvements,
sans limite de date, y compris les corrections d'inventaire. Les enseignants, eux, ne peuvent annuler
que le dernier mouvement d'une référence, dans les 24 heures.

Deux limites, valables pour tout le monde :

- une annulation ne s'annule pas : on ressaisit le mouvement voulu ;
- une annulation qui rendrait le stock négatif est refusée (par exemple une livraison déjà
  consommée). Faites alors une correction d'inventaire.

## Passer une commande

Écran **À commander** : ajustez les quantités si besoin, puis **Exporter en CSV** ou **Imprimer**.
Les quantités modifiées à l'écran ne sont pas enregistrées. L'application ne suit pas l'état des
commandes : à la livraison, saisissez une **entrée de stock**.

## Chaque rentrée scolaire

1. Changer le code d'accès commun.
2. Mettre à jour la liste des enseignants : désactiver les départs, ajouter les arrivées.
3. Faire un inventaire et corriger les écarts.
4. Revoir les seuils et les cibles du catalogue.

## En cas de problème

### Un enseignant a oublié le code d'accès commun

Redonnez-le lui. Si vous l'avez vous-même oublié, définissez-en un nouveau dans
Administration > Codes d'accès : cela ne demande que le code gestionnaire.

### Le code gestionnaire est oublié

Il ne peut pas être relu. La remise à zéro se fait depuis un ordinateur disposant du projet et de
l'accès au compte Cloudflare :

1. Choisir un nouveau code initial et l'enregistrer comme secret :

   ```bash
   npx wrangler secret put CODE_GESTIONNAIRE_INITIAL
   ```

2. Effacer l'empreinte de l'ancien code dans la base :

   ```bash
   npx wrangler d1 execute fablab-stock --remote --command "DELETE FROM settings WHERE cle = 'code_gestionnaire'"
   ```

3. Ouvrir le mode gestionnaire avec le nouveau code initial, puis le changer dans
   Administration > Codes d'accès.

Le code d'accès commun, les sessions des enseignants et toutes les données sont conservés.

### « Trop d'essais »

Après cinq codes faux depuis un même appareil, ou trente au total, la saisie est bloquée un quart
d'heure. Il suffit d'attendre. Les appareils déjà connectés ne sont pas gênés.

### Un stock affiché est faux

Faites une correction d'inventaire. Ne cherchez pas à compenser par un faux prélèvement ou une
fausse entrée : l'historique deviendrait trompeur.

## Ce que l'outil ne fait pas (version 1)

Pas de compte individuel, pas d'accès élève, pas de suivi à la bobine ni des chutes de plaques, pas
de suivi des commandes ni des prix, pas d'envoi d'e-mail, pas de fonctionnement hors ligne.

La sauvegarde automatique de la base n'est pas encore en place.

## Données personnelles

Seuls les noms des enseignants sont enregistrés, avec leurs mouvements. Aucune donnée d'élève. Les
adresses IP ne sont jamais stockées en clair : seule une empreinte est gardée un quart d'heure, pour
limiter les essais de code.
