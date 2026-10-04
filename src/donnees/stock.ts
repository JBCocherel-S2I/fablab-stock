// Calcul du stock : toujours la somme des mouvements, jamais une valeur stockée.

import type { Base } from "./base";

export interface StockReference {
  material_id: number;
  stock: number;
}

/** Stock de chaque référence (0 si aucun mouvement). */
export async function stockParReference(base: Base): Promise<StockReference[]> {
  return base.tous<StockReference>(
    `SELECT m.id AS material_id, COALESCE(SUM(v.delta), 0) AS stock
       FROM material m
       LEFT JOIN movement v ON v.material_id = m.id
      GROUP BY m.id
      ORDER BY m.id`,
  );
}

/** Stock d'une référence, ou null si elle n'existe pas. */
export async function stockDeReference(base: Base, materialId: number): Promise<number | null> {
  const ligne = await base.premier<{ stock: number }>(
    `SELECT COALESCE(SUM(v.delta), 0) AS stock
       FROM material m
       LEFT JOIN movement v ON v.material_id = m.id
      WHERE m.id = ?
      GROUP BY m.id`,
    [materialId],
  );
  return ligne ? ligne.stock : null;
}
