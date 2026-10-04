// Contrôle des données saisies pour le catalogue (références et machines).
// Chaque refus indique le champ concerné et un message en français.

import type { TypeMatiere } from "../donnees/machines";
import type { DonneesReference } from "../donnees/references";
import { ErreurApi } from "../erreurs";

export const DIAMETRES_FILAMENT = [1.75, 2.85];
const LONGUEUR_MAX_TEXTE = 60;
const QUANTITE_MAX = 9999;
const EPAISSEUR_MAX_MM = 100;
const COTE_MAX_MM = 5000;

function refuser(champ: string, message: string): never {
  throw new ErreurApi(400, "CHAMP_INVALIDE", message, { champ });
}

function nettoyer(valeur: unknown): string {
  return typeof valeur === "string" ? valeur.normalize("NFC").replace(/\s+/g, " ").trim() : "";
}

export function texteObligatoire(valeur: unknown, champ: string, libelle: string): string {
  const texte = nettoyer(valeur);
  if (texte === "" || [...texte].length > LONGUEUR_MAX_TEXTE) {
    refuser(champ, `${libelle} est obligatoire, en ${LONGUEUR_MAX_TEXTE} caractères au plus.`);
  }
  return texte;
}

function texteFacultatif(valeur: unknown, champ: string, libelle: string): string {
  if (valeur !== undefined && valeur !== null && typeof valeur !== "string") {
    refuser(champ, `${libelle} doit être un texte.`);
  }
  const texte = nettoyer(valeur);
  if ([...texte].length > LONGUEUR_MAX_TEXTE) {
    refuser(champ, `${libelle} ne doit pas dépasser ${LONGUEUR_MAX_TEXTE} caractères.`);
  }
  return texte;
}

function entier(valeur: unknown, champ: string, libelle: string, min: number, max: number): number {
  if (typeof valeur !== "number" || !Number.isInteger(valeur) || valeur < min || valeur > max) {
    refuser(champ, `${libelle} doit être un nombre entier entre ${min} et ${max}.`);
  }
  return valeur;
}

export function typeMatiere(valeur: unknown): TypeMatiere {
  if (valeur !== "filament" && valeur !== "plaque") {
    refuser("type", "Le type doit être « filament » ou « plaque ».");
  }
  return valeur;
}

export function booleen(valeur: unknown, champ: string): boolean {
  if (typeof valeur !== "boolean") refuser(champ, "Valeur attendue : oui ou non.");
  return valeur;
}

/**
 * Données complètes d'une référence, contrôlées. `corps` contient les champs
 * envoyés ; `actuelle` les valeurs existantes lors d'une modification.
 */
export function validerReference(
  corps: Record<string, unknown>,
  type: TypeMatiere,
  actuelle: DonneesReference | null,
): DonneesReference {
  const lire = (champ: keyof DonneesReference) => (corps[champ] !== undefined ? corps[champ] : actuelle?.[champ]);

  const teinte = nettoyer(lire("teinte")).toUpperCase();
  if (!/^#[0-9A-F]{6}$/.test(teinte)) {
    refuser("teinte", "La teinte d'affichage doit être un code couleur du type #C9402D.");
  }

  const seuil = entier(lire("seuil"), "seuil", "Le seuil d'alerte", 0, QUANTITE_MAX);
  const cible = entier(lire("cible"), "cible", "Le niveau cible", 0, QUANTITE_MAX);
  // Règle 5 : le niveau cible est toujours supérieur ou égal au seuil d'alerte.
  if (cible < seuil) {
    refuser("cible", "Le niveau cible doit être supérieur ou égal au seuil d'alerte.");
  }

  const commun = {
    type,
    materiau: texteObligatoire(lire("materiau"), "materiau", "Le matériau"),
    couleur: texteFacultatif(lire("couleur"), "couleur", "La couleur"),
    teinte,
    marque: texteFacultatif(lire("marque"), "marque", "La marque") || null,
    fournisseur: texteFacultatif(lire("fournisseur"), "fournisseur", "Le fournisseur") || null,
    seuil,
    cible,
    actif: lire("actif") === undefined ? true : booleen(lire("actif"), "actif"),
  };

  if (type === "filament") {
    const diametre = lire("diametre_mm");
    if (typeof diametre !== "number" || !DIAMETRES_FILAMENT.includes(diametre)) {
      refuser("diametre_mm", "Le diamètre doit être 1,75 mm ou 2,85 mm.");
    }
    return { ...commun, diametre_mm: diametre, epaisseur_mm: null, longueur_mm: null, largeur_mm: null };
  }

  const epaisseur = lire("epaisseur_mm");
  if (typeof epaisseur !== "number" || !Number.isFinite(epaisseur) || epaisseur <= 0 || epaisseur > EPAISSEUR_MAX_MM) {
    refuser("epaisseur_mm", `L'épaisseur doit être un nombre supérieur à 0, de ${EPAISSEUR_MAX_MM} mm au plus.`);
  }
  return {
    ...commun,
    diametre_mm: null,
    // Deux décimales suffisent, et évitent les écarts d'arrondi.
    epaisseur_mm: Math.round(epaisseur * 100) / 100,
    longueur_mm: entier(lire("longueur_mm"), "longueur_mm", "La longueur", 1, COTE_MAX_MM),
    largeur_mm: entier(lire("largeur_mm"), "largeur_mm", "La largeur", 1, COTE_MAX_MM),
  };
}

const memeTexte = (a: string | null, b: string | null) =>
  (a ?? "").localeCompare(b ?? "", "fr", { sensitivity: "base" }) === 0;

/** Deux références sont des doublons si tout ce qui les décrit est identique. */
export function memeReference(a: DonneesReference, b: DonneesReference): boolean {
  return (
    a.type === b.type &&
    memeTexte(a.materiau, b.materiau) &&
    memeTexte(a.couleur, b.couleur) &&
    memeTexte(a.marque, b.marque) &&
    a.diametre_mm === b.diametre_mm &&
    a.epaisseur_mm === b.epaisseur_mm &&
    a.longueur_mm === b.longueur_mm &&
    a.largeur_mm === b.largeur_mm
  );
}
