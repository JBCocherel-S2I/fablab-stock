// Présentation d'une référence de matière : libellé, spécification, pastille de teinte.
// Partagé par tous les écrans, pour que les étiquettes soient partout identiques.

import { h } from "./dom.js";

const NOMBRE = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });

export const TYPES = [
  { cle: "filament", libelle: "Filament", unite: "bobine", unites: "bobines" },
  { cle: "plaque", libelle: "Plaque", unite: "plaque", unites: "plaques" },
];

export function libelleType(type) {
  return TYPES.find((t) => t.cle === type)?.libelle ?? type;
}

/** "PLA · Noir" pour un filament, "PMMA Clair" pour une plaque. */
export function libelleReference(r) {
  if (!r.couleur) return r.materiau;
  return r.type === "filament" ? `${r.materiau} · ${r.couleur}` : `${r.materiau} ${r.couleur}`;
}

/** "1,75 mm" pour un filament, "3 mm · 600 × 400" pour une plaque. */
export function specification(r) {
  return r.type === "filament"
    ? `${NOMBRE.format(r.diametre_mm)} mm`
    : `${NOMBRE.format(r.epaisseur_mm)} mm · ${r.longueur_mm} × ${r.largeur_mm}`;
}

/** Nombre saisi à la française ("2,5") converti en nombre, ou null si vide ou invalide. */
export function lireNombre(texte) {
  const propre = String(texte).trim().replace(",", ".");
  if (propre === "" || !/^\d+(\.\d+)?$/.test(propre)) return null;
  return Number(propre);
}

export function ecrireNombre(nombre) {
  return nombre === null || nombre === undefined ? "" : NOMBRE.format(nombre).replace(/\s/g, "");
}

/** Pastille de teinte : ronde pour un filament, rectangulaire pour une plaque. */
export function pastilleTeinte(type, teinte) {
  const pastille = h("span", { class: `teinte teinte--${type}`, "aria-hidden": "true" });
  pastille.style.setProperty("--teinte", teinte);
  return pastille;
}
