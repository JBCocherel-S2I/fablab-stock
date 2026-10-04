// Table movement. Un mouvement s'ajoute, il ne se modifie ni ne se supprime jamais.

import type { Base } from "./base";

export type Nature = "prelevement" | "entree" | "correction" | "annulation";

export interface Mouvement {
  id: number;
  cree_le: string;
  material_id: number;
  nature: Nature;
  quantite: number;
  /** Effet signé sur le stock. */
  delta: number;
  teacher_id: number;
  machine_id: number | null;
  projet: string | null;
  commentaire: string | null;
  mouvement_annule_id: number | null;
}

export type NouveauMouvement = Omit<Mouvement, "id">;

const COLONNES =
  "cree_le, material_id, nature, quantite, delta, teacher_id, machine_id, projet, commentaire, mouvement_annule_id";

export async function insererMouvement(base: Base, m: NouveauMouvement): Promise<number> {
  const { dernierId } = await base.executer(
    `INSERT INTO movement (${COLONNES}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      m.cree_le,
      m.material_id,
      m.nature,
      m.quantite,
      m.delta,
      m.teacher_id,
      m.machine_id,
      m.projet,
      m.commentaire,
      m.mouvement_annule_id,
    ],
  );
  if (dernierId === null) throw new Error("Mouvement non enregistré");
  return dernierId;
}

export function lireMouvement(base: Base, id: number): Promise<Mouvement | null> {
  return base.premier<Mouvement>(`SELECT id, ${COLONNES} FROM movement WHERE id = ?`, [id]);
}

/** Identifiant du dernier mouvement enregistré sur une référence, ou null. */
export async function dernierMouvement(base: Base, materialId: number): Promise<number | null> {
  const ligne = await base.premier<{ id: number | null }>(
    "SELECT MAX(id) AS id FROM movement WHERE material_id = ?",
    [materialId],
  );
  return ligne?.id ?? null;
}

export async function estAnnule(base: Base, id: number): Promise<boolean> {
  const ligne = await base.premier<{ n: number }>(
    "SELECT COUNT(*) AS n FROM movement WHERE mouvement_annule_id = ?",
    [id],
  );
  return (ligne?.n ?? 0) > 0;
}

/**
 * Correction d'inventaire : l'écart est calculé par la base au moment même de
 * l'insertion (stock constaté moins somme des mouvements), pour rester juste
 * même si un autre mouvement arrive entre-temps. Renvoie null si l'écart est nul.
 */
export async function insererCorrection(
  base: Base,
  c: { cree_le: string; material_id: number; teacher_id: number; stock_constate: number; commentaire: string },
): Promise<number | null> {
  const { lignesModifiees, dernierId } = await base.executer(
    `INSERT INTO movement (cree_le, material_id, nature, quantite, delta, teacher_id, commentaire)
     SELECT ?, ?, 'correction', ? - COALESCE(SUM(delta), 0), ? - COALESCE(SUM(delta), 0), ?, ?
       FROM movement
      WHERE material_id = ?
     HAVING ? - COALESCE(SUM(delta), 0) <> 0`,
    [
      c.cree_le,
      c.material_id,
      c.stock_constate,
      c.stock_constate,
      c.teacher_id,
      c.commentaire,
      c.material_id,
      c.stock_constate,
    ],
  );
  return lignesModifiees > 0 ? dernierId : null;
}

/**
 * Annulation : le mouvement inverse n'est inséré que si l'original n'est pas
 * déjà annulé et, quand `exigerDernier` est vrai, s'il est toujours le dernier
 * mouvement de sa référence. Le tout en une seule instruction, donc sans
 * fenêtre entre le contrôle et l'écriture. Renvoie null si rien n'a été inséré.
 */
export async function insererAnnulation(
  base: Base,
  a: {
    cree_le: string;
    original: Mouvement;
    teacher_id: number;
    commentaire: string | null;
    exigerDernier: boolean;
  },
): Promise<number | null> {
  const o = a.original;
  const { lignesModifiees, dernierId } = await base.executer(
    `INSERT INTO movement (${COLONNES})
     SELECT ?, ?, 'annulation', ?, ?, ?, ?, ?, ?, ?
      WHERE NOT EXISTS (SELECT 1 FROM movement WHERE mouvement_annule_id = ?)
        AND (? = 0 OR (SELECT MAX(id) FROM movement WHERE material_id = ?) = ?)`,
    [
      a.cree_le,
      o.material_id,
      Math.abs(o.delta),
      -o.delta,
      a.teacher_id,
      o.machine_id,
      o.projet,
      a.commentaire,
      o.id,
      o.id,
      a.exigerDernier ? 1 : 0,
      o.material_id,
      o.id,
    ],
  );
  return lignesModifiees > 0 ? dernierId : null;
}

/** Nombre de prélèvements par référence, pour proposer les plus utilisées en tête. */
export async function utilisationsParReference(base: Base): Promise<Map<number, number>> {
  const lignes = await base.tous<{ material_id: number; n: number }>(
    "SELECT material_id, COUNT(*) AS n FROM movement WHERE nature = 'prelevement' GROUP BY material_id",
  );
  return new Map(lignes.map((l) => [l.material_id, l.n]));
}

/** Projets ou classes déjà saisis, les plus récents d'abord (4.6). */
export async function projetsConnus(base: Base, limite = 50): Promise<string[]> {
  const lignes = await base.tous<{ projet: string }>(
    `SELECT projet, MAX(id) AS dernier
       FROM movement
      WHERE nature = 'prelevement' AND projet IS NOT NULL
      GROUP BY projet
      ORDER BY dernier DESC
      LIMIT ?`,
    [limite],
  );
  return lignes.map((l) => l.projet);
}
