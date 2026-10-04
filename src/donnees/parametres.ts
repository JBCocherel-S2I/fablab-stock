// Table settings : paramètres clé/valeur (hachages des deux codes).

import type { Base } from "./base";

export async function lireParametre(base: Base, cle: string): Promise<string | null> {
  const ligne = await base.premier<{ valeur: string }>("SELECT valeur FROM settings WHERE cle = ?", [cle]);
  return ligne ? ligne.valeur : null;
}

export async function ecrireParametre(base: Base, cle: string, valeur: string, maintenant: string): Promise<void> {
  await base.executer(
    `INSERT INTO settings (cle, valeur, modifie_le) VALUES (?, ?, ?)
     ON CONFLICT (cle) DO UPDATE SET valeur = excluded.valeur, modifie_le = excluded.modifie_le`,
    [cle, valeur, maintenant],
  );
}

/** N'écrit que si la clé n'existe pas encore. */
export async function creerParametreSiAbsent(
  base: Base,
  cle: string,
  valeur: string,
  maintenant: string,
): Promise<void> {
  await base.executer(
    `INSERT INTO settings (cle, valeur, modifie_le) VALUES (?, ?, ?)
     ON CONFLICT (cle) DO NOTHING`,
    [cle, valeur, maintenant],
  );
}
