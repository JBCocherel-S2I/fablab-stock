// Table tentative : essais de saisie de code.

import type { Base } from "./base";

export interface CompteTentatives {
  /** Essais de cette origine dans la fenêtre. */
  origine: number;
  /** Essais toutes origines confondues dans la fenêtre. */
  total: number;
  /** Date du plus ancien essai de cette origine dans la fenêtre. */
  plusAncienOrigine: string | null;
  /** Date du plus ancien essai, toutes origines confondues, dans la fenêtre. */
  plusAncienTotal: string | null;
}

export async function enregistrerTentative(
  base: Base,
  type: string,
  origine: string,
  maintenant: string,
): Promise<number> {
  const { dernierId } = await base.executer(
    "INSERT INTO tentative (type, origine, cree_le) VALUES (?, ?, ?)",
    [type, origine, maintenant],
  );
  if (dernierId === null) throw new Error("Tentative non enregistrée");
  return dernierId;
}

export async function compterTentatives(
  base: Base,
  type: string,
  origine: string,
  depuis: string,
): Promise<CompteTentatives> {
  const ligne = await base.premier<{
    origine: number | null;
    total: number;
    plus_ancien_origine: string | null;
    plus_ancien_total: string | null;
  }>(
    `SELECT SUM(CASE WHEN origine = ? THEN 1 ELSE 0 END) AS origine,
            COUNT(*) AS total,
            MIN(CASE WHEN origine = ? THEN cree_le END) AS plus_ancien_origine,
            MIN(cree_le) AS plus_ancien_total
       FROM tentative
      WHERE type = ? AND cree_le > ?`,
    [origine, origine, type, depuis],
  );
  return {
    origine: ligne?.origine ?? 0,
    total: ligne?.total ?? 0,
    plusAncienOrigine: ligne?.plus_ancien_origine ?? null,
    plusAncienTotal: ligne?.plus_ancien_total ?? null,
  };
}

export async function supprimerTentative(base: Base, id: number): Promise<void> {
  await base.executer("DELETE FROM tentative WHERE id = ?", [id]);
}

/** Après un code correct : on oublie les essais de cette origine. */
export async function effacerTentatives(base: Base, type: string, origine: string): Promise<void> {
  await base.executer("DELETE FROM tentative WHERE type = ? AND origine = ?", [type, origine]);
}

export async function purgerTentatives(base: Base, avant: string): Promise<void> {
  await base.executer("DELETE FROM tentative WHERE cree_le <= ?", [avant]);
}
