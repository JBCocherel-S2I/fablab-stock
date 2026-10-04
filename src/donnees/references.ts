// Table material : références de matière. Le stock est toujours calculé à
// partir des mouvements (somme des delta), jamais stocké.

import type { Base, Parametre } from "./base";
import type { TypeMatiere } from "./machines";

/** Champs saisis par le gestionnaire. */
export interface DonneesReference {
  type: TypeMatiere;
  materiau: string;
  couleur: string;
  teinte: string;
  marque: string | null;
  diametre_mm: number | null;
  epaisseur_mm: number | null;
  longueur_mm: number | null;
  largeur_mm: number | null;
  fournisseur: string | null;
  seuil: number;
  cible: number;
  actif: boolean;
}

export interface Reference extends DonneesReference {
  id: number;
  stock: number;
}

type LigneReference = Omit<Reference, "actif"> & { actif: number };

const SELECTION = `
  SELECT m.id, m.type, m.materiau, m.couleur, m.teinte, m.marque, m.diametre_mm, m.epaisseur_mm,
         m.longueur_mm, m.largeur_mm, m.fournisseur, m.seuil, m.cible, m.actif,
         COALESCE(SUM(v.delta), 0) AS stock
    FROM material m
    LEFT JOIN movement v ON v.material_id = m.id`;

function versReference(l: LigneReference): Reference {
  return { ...l, actif: l.actif === 1 };
}

const ORDRE_FR = { sensitivity: "base", numeric: true } as const;

/** Filament d'abord, puis par matériau, couleur, épaisseur et format. */
function comparer(a: Reference, b: Reference): number {
  return (
    a.type.localeCompare(b.type) ||
    a.materiau.localeCompare(b.materiau, "fr", ORDRE_FR) ||
    a.couleur.localeCompare(b.couleur, "fr", ORDRE_FR) ||
    (a.diametre_mm ?? 0) - (b.diametre_mm ?? 0) ||
    (a.epaisseur_mm ?? 0) - (b.epaisseur_mm ?? 0) ||
    (a.longueur_mm ?? 0) - (b.longueur_mm ?? 0) ||
    (a.largeur_mm ?? 0) - (b.largeur_mm ?? 0) ||
    a.id - b.id
  );
}

export async function listerReferences(base: Base, inclureInactives: boolean): Promise<Reference[]> {
  const lignes = await base.tous<LigneReference>(
    `${SELECTION} ${inclureInactives ? "" : "WHERE m.actif = 1"} GROUP BY m.id`,
  );
  return lignes.map(versReference).sort(comparer);
}

export async function lireReference(base: Base, id: number): Promise<Reference | null> {
  const ligne = await base.premier<LigneReference>(`${SELECTION} WHERE m.id = ? GROUP BY m.id`, [id]);
  return ligne ? versReference(ligne) : null;
}

/** Nombre de références actives dont le stock est inférieur ou égal au seuil (5.6). */
export async function compterACommander(base: Base): Promise<number> {
  const ligne = await base.premier<{ n: number }>(
    `SELECT COUNT(*) AS n FROM (
       SELECT m.id
         FROM material m
         LEFT JOIN movement v ON v.material_id = m.id
        WHERE m.actif = 1
        GROUP BY m.id, m.seuil
       HAVING COALESCE(SUM(v.delta), 0) <= m.seuil
     ) AS a_commander`,
  );
  return ligne?.n ?? 0;
}

function valeurs(d: DonneesReference): Parametre[] {
  return [
    d.materiau,
    d.couleur,
    d.teinte,
    d.marque,
    d.diametre_mm,
    d.epaisseur_mm,
    d.longueur_mm,
    d.largeur_mm,
    d.fournisseur,
    d.seuil,
    d.cible,
    d.actif ? 1 : 0,
  ];
}

export async function creerReference(base: Base, d: DonneesReference): Promise<number> {
  const { dernierId } = await base.executer(
    `INSERT INTO material
       (type, materiau, couleur, teinte, marque, diametre_mm, epaisseur_mm, longueur_mm, largeur_mm,
        fournisseur, seuil, cible, actif)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [d.type, ...valeurs(d)],
  );
  if (dernierId === null) throw new Error("Référence non créée");
  return dernierId;
}

/** Le type d'une référence ne change jamais : il n'est pas mis à jour ici. */
export async function modifierReference(base: Base, id: number, d: DonneesReference): Promise<void> {
  await base.executer(
    `UPDATE material
        SET materiau = ?, couleur = ?, teinte = ?, marque = ?, diametre_mm = ?, epaisseur_mm = ?,
            longueur_mm = ?, largeur_mm = ?, fournisseur = ?, seuil = ?, cible = ?, actif = ?
      WHERE id = ?`,
    [...valeurs(d), id],
  );
}
