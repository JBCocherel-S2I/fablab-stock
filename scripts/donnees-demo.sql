-- Données fictives reprises des maquettes, pour essayer l'application en local.
-- Ne jamais les charger sur la base en ligne.
-- Chaque ligne n'est ajoutée que si elle n'existe pas déjà : le script peut être relancé.
-- (Une instruction par ligne : D1 limite le nombre de SELECT réunis par UNION.)

-- Machines
INSERT INTO machine (nom, type) SELECT 'Imprimante 1', 'filament' WHERE NOT EXISTS (SELECT 1 FROM machine WHERE nom = 'Imprimante 1');
INSERT INTO machine (nom, type) SELECT 'Imprimante 2', 'filament' WHERE NOT EXISTS (SELECT 1 FROM machine WHERE nom = 'Imprimante 2');
INSERT INTO machine (nom, type) SELECT 'Imprimante 3', 'filament' WHERE NOT EXISTS (SELECT 1 FROM machine WHERE nom = 'Imprimante 3');
INSERT INTO machine (nom, type) SELECT 'Découpeuse laser', 'plaque' WHERE NOT EXISTS (SELECT 1 FROM machine WHERE nom = 'Découpeuse laser');

-- Filaments
INSERT INTO material (type, materiau, couleur, teinte, diametre_mm, fournisseur, seuil, cible) SELECT 'filament', 'PLA', 'Noir', '#2A2D34', 1.75, 'Fournisseur A', 2, 8 WHERE NOT EXISTS (SELECT 1 FROM material WHERE type = 'filament' AND materiau = 'PLA' AND couleur = 'Noir' AND diametre_mm = 1.75);
INSERT INTO material (type, materiau, couleur, teinte, diametre_mm, fournisseur, seuil, cible) SELECT 'filament', 'PLA', 'Blanc', '#EFEFE9', 1.75, 'Fournisseur A', 2, 8 WHERE NOT EXISTS (SELECT 1 FROM material WHERE type = 'filament' AND materiau = 'PLA' AND couleur = 'Blanc' AND diametre_mm = 1.75);
INSERT INTO material (type, materiau, couleur, teinte, diametre_mm, fournisseur, seuil, cible) SELECT 'filament', 'PETG', 'Bleu', '#2F6DB5', 1.75, 'Fournisseur A', 2, 6 WHERE NOT EXISTS (SELECT 1 FROM material WHERE type = 'filament' AND materiau = 'PETG' AND couleur = 'Bleu' AND diametre_mm = 1.75);
INSERT INTO material (type, materiau, couleur, teinte, diametre_mm, fournisseur, seuil, cible) SELECT 'filament', 'PLA', 'Rouge', '#C9402D', 1.75, 'Fournisseur A', 2, 6 WHERE NOT EXISTS (SELECT 1 FROM material WHERE type = 'filament' AND materiau = 'PLA' AND couleur = 'Rouge' AND diametre_mm = 1.75);
INSERT INTO material (type, materiau, couleur, teinte, diametre_mm, fournisseur, seuil, cible) SELECT 'filament', 'PETG', 'Gris', '#8A8F98', 1.75, 'Fournisseur A', 2, 6 WHERE NOT EXISTS (SELECT 1 FROM material WHERE type = 'filament' AND materiau = 'PETG' AND couleur = 'Gris' AND diametre_mm = 1.75);
INSERT INTO material (type, materiau, couleur, teinte, diametre_mm, fournisseur, seuil, cible) SELECT 'filament', 'ABS', 'Vert', '#3B8C5A', 1.75, 'Fournisseur A', 2, 4 WHERE NOT EXISTS (SELECT 1 FROM material WHERE type = 'filament' AND materiau = 'ABS' AND couleur = 'Vert' AND diametre_mm = 1.75);

-- Plaques
INSERT INTO material (type, materiau, couleur, teinte, epaisseur_mm, longueur_mm, largeur_mm, fournisseur, seuil, cible) SELECT 'plaque', 'Contreplaqué', '', '#C9A36B', 3, 600, 400, 'Fournisseur B', 5, 20 WHERE NOT EXISTS (SELECT 1 FROM material WHERE type = 'plaque' AND materiau = 'Contreplaqué' AND couleur = '' AND epaisseur_mm = 3 AND longueur_mm = 600 AND largeur_mm = 400);
INSERT INTO material (type, materiau, couleur, teinte, epaisseur_mm, longueur_mm, largeur_mm, fournisseur, seuil, cible) SELECT 'plaque', 'Contreplaqué', '', '#B98A4E', 5, 600, 400, 'Fournisseur B', 4, 12 WHERE NOT EXISTS (SELECT 1 FROM material WHERE type = 'plaque' AND materiau = 'Contreplaqué' AND couleur = '' AND epaisseur_mm = 5 AND longueur_mm = 600 AND largeur_mm = 400);
INSERT INTO material (type, materiau, couleur, teinte, epaisseur_mm, longueur_mm, largeur_mm, fournisseur, seuil, cible) SELECT 'plaque', 'PMMA', 'Clair', '#CFE6EE', 3, 600, 400, 'Fournisseur B', 3, 10 WHERE NOT EXISTS (SELECT 1 FROM material WHERE type = 'plaque' AND materiau = 'PMMA' AND couleur = 'Clair' AND epaisseur_mm = 3 AND longueur_mm = 600 AND largeur_mm = 400);
INSERT INTO material (type, materiau, couleur, teinte, epaisseur_mm, longueur_mm, largeur_mm, fournisseur, seuil, cible) SELECT 'plaque', 'MDF', '', '#A98A6A', 3, 600, 400, 'Fournisseur B', 4, 15 WHERE NOT EXISTS (SELECT 1 FROM material WHERE type = 'plaque' AND materiau = 'MDF' AND couleur = '' AND epaisseur_mm = 3 AND longueur_mm = 600 AND largeur_mm = 400);
INSERT INTO material (type, materiau, couleur, teinte, epaisseur_mm, longueur_mm, largeur_mm, fournisseur, seuil, cible) SELECT 'plaque', 'Carton', 'Plume', '#F4F1EA', 5, 700, 500, 'Fournisseur B', 3, 10 WHERE NOT EXISTS (SELECT 1 FROM material WHERE type = 'plaque' AND materiau = 'Carton' AND couleur = 'Plume' AND epaisseur_mm = 5 AND longueur_mm = 700 AND largeur_mm = 500);
