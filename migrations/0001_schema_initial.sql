-- Migration 0001 : schéma initial (spécifications, section 4).
-- SQL compatible SQLite, pour Cloudflare D1 comme pour une base SQLite locale.
-- Les tables de session et de limitation des tentatives arrivent au bloc 2.

-- 4.4 Enseignant : jamais supprimé, seulement désactivé.
CREATE TABLE teacher (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  nom     TEXT    NOT NULL UNIQUE CHECK (length(trim(nom)) > 0),
  actif   INTEGER NOT NULL DEFAULT 1 CHECK (actif IN (0, 1))
);

-- 4.3 Machine : compatible avec un seul type de matière.
CREATE TABLE machine (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  nom     TEXT    NOT NULL UNIQUE CHECK (length(trim(nom)) > 0),
  type    TEXT    NOT NULL CHECK (type IN ('filament', 'plaque')),
  actif   INTEGER NOT NULL DEFAULT 1 CHECK (actif IN (0, 1))
);

-- 4.1 Référence de matière. Le stock n'est pas stocké ici : il se calcule
-- toujours à partir des mouvements.
CREATE TABLE material (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  type          TEXT    NOT NULL CHECK (type IN ('filament', 'plaque')),
  materiau      TEXT    NOT NULL CHECK (length(trim(materiau)) > 0),
  couleur       TEXT    NOT NULL DEFAULT '',
  teinte        TEXT    NOT NULL CHECK (length(teinte) = 7 AND substr(teinte, 1, 1) = '#'),
  marque        TEXT,
  diametre_mm   REAL,
  epaisseur_mm  REAL,
  longueur_mm   INTEGER,
  largeur_mm    INTEGER,
  fournisseur   TEXT,
  seuil         INTEGER NOT NULL CHECK (seuil >= 0),
  cible         INTEGER NOT NULL,
  actif         INTEGER NOT NULL DEFAULT 1 CHECK (actif IN (0, 1)),
  -- Règle 5 : le niveau cible est toujours supérieur ou égal au seuil.
  CHECK (cible >= seuil),
  -- Diamètre pour le filament uniquement, épaisseur et format pour les plaques uniquement.
  -- Les "IS NOT NULL" sont indispensables : une comparaison avec NULL ne fait
  -- pas échouer un CHECK.
  CHECK (
    (type = 'filament'
      AND diametre_mm IS NOT NULL AND diametre_mm > 0
      AND epaisseur_mm IS NULL AND longueur_mm IS NULL AND largeur_mm IS NULL)
    OR
    (type = 'plaque'
      AND diametre_mm IS NULL
      AND epaisseur_mm IS NOT NULL AND epaisseur_mm > 0
      AND longueur_mm IS NOT NULL AND longueur_mm > 0
      AND largeur_mm IS NOT NULL AND largeur_mm > 0)
  )
);

-- 4.2 Mouvement.
-- `quantite` suit la spécification (entier positif, relatif pour une correction).
-- `delta` est l'effet signé sur le stock : stock d'une référence = somme des delta.
CREATE TABLE movement (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  -- Date et heure serveur, en UTC, au format ISO 8601 (règle 6).
  cree_le               TEXT    NOT NULL,
  material_id           INTEGER NOT NULL REFERENCES material (id),
  nature                TEXT    NOT NULL
                        CHECK (nature IN ('prelevement', 'entree', 'correction', 'annulation')),
  quantite              INTEGER NOT NULL,
  delta                 INTEGER NOT NULL,
  teacher_id            INTEGER NOT NULL REFERENCES teacher (id),
  machine_id            INTEGER REFERENCES machine (id),
  projet                TEXT,
  commentaire           TEXT,
  mouvement_annule_id   INTEGER REFERENCES movement (id),
  -- Cohérence entre nature, quantité et effet sur le stock.
  CHECK (
    (nature = 'prelevement' AND quantite > 0 AND delta = -quantite)
    OR (nature = 'entree'     AND quantite > 0 AND delta = quantite)
    OR (nature = 'correction' AND quantite <> 0 AND delta = quantite)
    OR (nature = 'annulation' AND quantite > 0 AND (delta = quantite OR delta = -quantite))
  ),
  -- Machine et projet ou classe obligatoires pour un prélèvement.
  CHECK (
    nature <> 'prelevement'
    OR (machine_id IS NOT NULL AND projet IS NOT NULL AND length(trim(projet)) > 0)
  ),
  -- Commentaire obligatoire pour une correction d'inventaire (5.10).
  CHECK (
    nature <> 'correction'
    OR (commentaire IS NOT NULL AND length(trim(commentaire)) > 0)
  ),
  -- Seule une annulation pointe vers un mouvement d'origine.
  CHECK ((nature = 'annulation') = (mouvement_annule_id IS NOT NULL))
);

CREATE INDEX movement_par_reference ON movement (material_id, id);
CREATE INDEX movement_par_date ON movement (cree_le);
-- Un mouvement ne peut être annulé qu'une seule fois.
CREATE UNIQUE INDEX movement_annule_une_fois ON movement (mouvement_annule_id)
  WHERE mouvement_annule_id IS NOT NULL;

-- Règle 2 : aucun mouvement n'est modifié ni supprimé.
CREATE TRIGGER movement_non_modifiable
BEFORE UPDATE ON movement
BEGIN
  SELECT RAISE(ABORT, 'REGLE_2 : un mouvement ne peut pas être modifié');
END;

CREATE TRIGGER movement_non_supprimable
BEFORE DELETE ON movement
BEGIN
  SELECT RAISE(ABORT, 'REGLE_2 : un mouvement ne peut pas être supprimé');
END;

-- Règle 1 : un stock ne peut pas devenir négatif. Le contrôle est fait dans la
-- base, au moment de l'insertion, pour rester vrai même si deux saisies arrivent
-- en même temps.
CREATE TRIGGER movement_stock_non_negatif
BEFORE INSERT ON movement
WHEN (
  SELECT COALESCE(SUM(delta), 0) FROM movement WHERE material_id = NEW.material_id
) + NEW.delta < 0
BEGIN
  SELECT RAISE(ABORT, 'REGLE_1 : le stock ne peut pas devenir négatif');
END;

-- Règle 4 : une référence, une machine ou un enseignant ne se supprime pas,
-- il se désactive.
CREATE TRIGGER material_non_supprimable
BEFORE DELETE ON material
BEGIN
  SELECT RAISE(ABORT, 'REGLE_4 : une référence se désactive, elle ne se supprime pas');
END;

CREATE TRIGGER teacher_non_supprimable
BEFORE DELETE ON teacher
BEGIN
  SELECT RAISE(ABORT, 'Un enseignant se désactive, il ne se supprime pas');
END;

CREATE TRIGGER machine_non_supprimable
BEFORE DELETE ON machine
BEGIN
  SELECT RAISE(ABORT, 'Une machine se désactive, elle ne se supprime pas');
END;

-- 4.5 Paramètres (hachages des deux codes, définis au bloc 2).
CREATE TABLE settings (
  cle         TEXT PRIMARY KEY,
  valeur      TEXT NOT NULL,
  modifie_le  TEXT NOT NULL
);
