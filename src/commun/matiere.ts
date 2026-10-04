// Libellés d'une référence côté serveur (exports CSV). Mêmes règles que
// public/scripts/matiere.js, pour que les exports reprennent les étiquettes de l'écran.

import type { TypeMatiere } from "../donnees/machines";

export interface DescriptionMatiere {
  type: TypeMatiere;
  materiau: string;
  couleur: string;
  diametre_mm: number | null;
  epaisseur_mm: number | null;
  longueur_mm: number | null;
  largeur_mm: number | null;
}

const NOMBRE = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2, useGrouping: false });

export function libelleType(type: TypeMatiere): string {
  return type === "filament" ? "Filament" : "Plaque";
}

/** "PLA · Noir" pour un filament, "PMMA Clair" pour une plaque. */
export function libelleReference(r: DescriptionMatiere): string {
  if (!r.couleur) return r.materiau;
  return r.type === "filament" ? `${r.materiau} · ${r.couleur}` : `${r.materiau} ${r.couleur}`;
}

/** "1,75 mm" pour un filament, "3 mm · 600 × 400" pour une plaque. */
export function specification(r: DescriptionMatiere): string {
  return r.type === "filament"
    ? `${NOMBRE.format(r.diametre_mm ?? 0)} mm`
    : `${NOMBRE.format(r.epaisseur_mm ?? 0)} mm · ${r.longueur_mm} × ${r.largeur_mm}`;
}
