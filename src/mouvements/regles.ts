// Règles de gestion des mouvements (spécifications, section 6).
// Toute écriture dans la table movement passe par ce fichier.

import { horodatage } from "../commun/heure";
import type { Base } from "../donnees/base";
import { lireEnseignant } from "../donnees/enseignants";
import { lireMachine } from "../donnees/machines";
import {
  dernierMouvement,
  estAnnule,
  insererAnnulation,
  insererCorrection,
  insererMouvement,
  lireMouvement,
  type Mouvement,
} from "../donnees/mouvements";
import { lireReference, type Reference } from "../donnees/references";
import { ErreurApi } from "../erreurs";

export const QUANTITE_MAX = 9999;
export const LONGUEUR_MAX_PROJET = 60;
export const LONGUEUR_MAX_COMMENTAIRE = 200;
/** Délai pendant lequel un enseignant peut annuler un mouvement (règle 3). */
export const DELAI_ANNULATION_MS = 24 * 60 * 60 * 1000;

export interface ResultatMouvement {
  mouvement: Mouvement;
  /** Stock de la référence après le mouvement. */
  stock: number;
}

// ---------- Contrôle des valeurs saisies ----------

function refuser(champ: string, message: string): never {
  throw new ErreurApi(400, "CHAMP_INVALIDE", message, { champ });
}

function identifiant(valeur: unknown, champ: string, libelle: string): number {
  if (typeof valeur !== "number" || !Number.isSafeInteger(valeur) || valeur <= 0) {
    refuser(champ, `${libelle} est obligatoire.`);
  }
  return valeur;
}

function quantite(valeur: unknown, min: number, champ = "quantite", libelle = "La quantité"): number {
  if (typeof valeur !== "number" || !Number.isInteger(valeur) || valeur < min || valeur > QUANTITE_MAX) {
    refuser(champ, `${libelle} doit être un nombre entier entre ${min} et ${QUANTITE_MAX}.`);
  }
  return valeur;
}

function texte(valeur: unknown, champ: string, libelle: string, max: number, obligatoire: boolean): string | null {
  if (valeur !== undefined && valeur !== null && typeof valeur !== "string") {
    refuser(champ, `${libelle} doit être un texte.`);
  }
  const propre = typeof valeur === "string" ? valeur.normalize("NFC").replace(/\s+/g, " ").trim() : "";
  if (obligatoire && propre === "") refuser(champ, `${libelle} est obligatoire.`);
  if ([...propre].length > max) refuser(champ, `${libelle} ne doit pas dépasser ${max} caractères.`);
  return propre === "" ? null : propre;
}

function unites(reference: Reference, n: number): string {
  const nom = reference.type === "filament" ? "bobine" : "plaque";
  return `${n} ${nom}${n > 1 ? "s" : ""}`;
}

// ---------- Contrôles communs ----------

/** Règle 4 : une référence désactivée n'est plus utilisable en saisie. */
async function referenceActive(base: Base, id: number): Promise<Reference> {
  const reference = await lireReference(base, id);
  if (!reference) throw new ErreurApi(404, "INTROUVABLE", "Référence introuvable.");
  if (!reference.actif) {
    throw new ErreurApi(409, "REFERENCE_INACTIVE", "Cette référence est désactivée : elle n'accepte plus de saisie.");
  }
  return reference;
}

/** Règle 8 : seul un nom actif de la liste peut être associé à un nouveau mouvement. */
async function enseignantActif(base: Base, id: number): Promise<void> {
  const enseignant = await lireEnseignant(base, id);
  if (!enseignant || !enseignant.actif) {
    throw new ErreurApi(
      409,
      "ENSEIGNANT_INACTIF",
      "Ce nom n'est plus dans la liste des enseignants. Choisissez un autre nom.",
      { champ: "teacher_id" },
    );
  }
}

/** Le déclencheur de la base (règle 1) reste le dernier rempart en cas de saisies simultanées. */
function estRefusStockNegatif(erreur: unknown): boolean {
  return erreur instanceof Error && erreur.message.includes("REGLE_1");
}

function stockInsuffisant(reference: Reference, stock: number): ErreurApi {
  return new ErreurApi(
    409,
    "STOCK_INSUFFISANT",
    stock === 0
      ? "Stock épuisé : il ne reste rien à prélever sur cette référence."
      : `Stock insuffisant : il reste ${unites(reference, stock)}.`,
    { stock },
  );
}

async function resultat(base: Base, id: number): Promise<ResultatMouvement> {
  const mouvement = (await lireMouvement(base, id))!;
  const reference = (await lireReference(base, mouvement.material_id))!;
  return { mouvement, stock: reference.stock };
}

// ---------- Prélèvement (5.3) ----------

export async function enregistrerPrelevement(
  base: Base,
  maintenant: Date,
  corps: Record<string, unknown>,
): Promise<ResultatMouvement> {
  const materialId = identifiant(corps.material_id, "material_id", "La référence");
  const teacherId = identifiant(corps.teacher_id, "teacher_id", "Le nom de l'enseignant");
  const machineId = identifiant(corps.machine_id, "machine_id", "La machine");
  const n = quantite(corps.quantite, 1);
  const projet = texte(corps.projet, "projet", "Le projet ou la classe", LONGUEUR_MAX_PROJET, true);
  const commentaire = texte(corps.commentaire, "commentaire", "Le commentaire", LONGUEUR_MAX_COMMENTAIRE, false);

  const reference = await referenceActive(base, materialId);
  await enseignantActif(base, teacherId);

  const machine = await lireMachine(base, machineId);
  if (!machine || !machine.actif) {
    throw new ErreurApi(409, "MACHINE_INACTIVE", "Cette machine n'est plus disponible. Choisissez-en une autre.", {
      champ: "machine_id",
    });
  }
  if (machine.type !== reference.type) {
    throw new ErreurApi(409, "MACHINE_INCOMPATIBLE", `La machine « ${machine.nom} » n'utilise pas ce type de matière.`, {
      champ: "machine_id",
    });
  }

  // Règle 1 : un prélèvement supérieur au stock est refusé.
  if (n > reference.stock) throw stockInsuffisant(reference, reference.stock);

  try {
    const id = await insererMouvement(base, {
      cree_le: horodatage(maintenant),
      material_id: materialId,
      nature: "prelevement",
      quantite: n,
      delta: -n,
      teacher_id: teacherId,
      machine_id: machineId,
      projet,
      commentaire,
      mouvement_annule_id: null,
    });
    return await resultat(base, id);
  } catch (erreur) {
    if (!estRefusStockNegatif(erreur)) throw erreur;
    const actuelle = (await lireReference(base, materialId))!;
    throw stockInsuffisant(actuelle, actuelle.stock);
  }
}

// ---------- Entrée de stock (5.4) ----------

export async function enregistrerEntree(
  base: Base,
  maintenant: Date,
  corps: Record<string, unknown>,
): Promise<ResultatMouvement> {
  const materialId = identifiant(corps.material_id, "material_id", "La référence");
  const teacherId = identifiant(corps.teacher_id, "teacher_id", "Le nom de l'enseignant");
  const n = quantite(corps.quantite, 1);
  const commentaire = texte(corps.commentaire, "commentaire", "Le commentaire", LONGUEUR_MAX_COMMENTAIRE, false);

  await referenceActive(base, materialId);
  await enseignantActif(base, teacherId);

  const id = await insererMouvement(base, {
    cree_le: horodatage(maintenant),
    material_id: materialId,
    nature: "entree",
    quantite: n,
    delta: n,
    teacher_id: teacherId,
    machine_id: null,
    projet: null,
    commentaire,
    mouvement_annule_id: null,
  });
  return resultat(base, id);
}

// ---------- Correction d'inventaire (5.10, gestionnaire) ----------

export async function enregistrerCorrection(
  base: Base,
  maintenant: Date,
  corps: Record<string, unknown>,
): Promise<ResultatMouvement> {
  const materialId = identifiant(corps.material_id, "material_id", "La référence");
  const teacherId = identifiant(corps.teacher_id, "teacher_id", "Le nom de l'enseignant");
  const constate = quantite(corps.stock_constate, 0, "stock_constate", "Le stock constaté");
  const commentaire = texte(corps.commentaire, "commentaire", "Le commentaire", LONGUEUR_MAX_COMMENTAIRE, true)!;

  await referenceActive(base, materialId);
  await enseignantActif(base, teacherId);

  const id = await insererCorrection(base, {
    cree_le: horodatage(maintenant),
    material_id: materialId,
    teacher_id: teacherId,
    stock_constate: constate,
    commentaire,
  });
  if (id === null) {
    throw new ErreurApi(
      409,
      "AUCUN_ECART",
      "Le stock constaté est égal au stock enregistré : aucune correction n'est nécessaire.",
    );
  }
  return resultat(base, id);
}

// ---------- Annulation (règles 2 et 3) ----------

export async function annulerMouvement(
  base: Base,
  maintenant: Date,
  mouvementId: number,
  corps: Record<string, unknown>,
  estGestionnaire: boolean,
): Promise<ResultatMouvement> {
  const teacherId = identifiant(corps.teacher_id, "teacher_id", "Le nom de l'enseignant");
  const commentaire = texte(corps.commentaire, "commentaire", "Le commentaire", LONGUEUR_MAX_COMMENTAIRE, false);

  const original = await lireMouvement(base, mouvementId);
  if (!original) throw new ErreurApi(404, "INTROUVABLE", "Mouvement introuvable.");
  const reference = (await lireReference(base, original.material_id))!;

  const refus = (code: string, message: string) => new ErreurApi(409, code, message);

  if (original.nature === "annulation") {
    throw refus("ANNULATION_NON_ANNULABLE", "Une annulation ne s'annule pas. Enregistrez à nouveau le mouvement voulu.");
  }
  if (await estAnnule(base, original.id)) {
    throw refus("DEJA_ANNULE", "Ce mouvement a déjà été annulé.");
  }

  // L'annulation est tracée avec le nom choisi par la personne qui annule (règle 3).
  await enseignantActif(base, teacherId);

  if (!estGestionnaire) {
    // Règle 3 : un enseignant n'annule que le dernier mouvement d'une référence,
    // si rien d'autre n'a été enregistré depuis, et dans un délai de 24 heures.
    if (original.nature === "correction") {
      throw refus("GESTIONNAIRE_REQUIS_ANNULATION", "Seul le gestionnaire peut annuler une correction d'inventaire.");
    }
    if (!reference.actif) {
      throw refus("REFERENCE_INACTIVE", "Cette référence est désactivée : seul le gestionnaire peut annuler ce mouvement.");
    }
    if ((await dernierMouvement(base, original.material_id)) !== original.id) {
      throw refus(
        "PAS_LE_DERNIER_MOUVEMENT",
        "Ce mouvement ne peut plus être annulé : un autre mouvement a été enregistré depuis sur cette référence. Adressez-vous au gestionnaire.",
      );
    }
    if (maintenant.getTime() - Date.parse(original.cree_le) > DELAI_ANNULATION_MS) {
      throw refus(
        "DELAI_DEPASSE",
        "Ce mouvement a plus de 24 heures : il ne peut plus être annulé. Adressez-vous au gestionnaire.",
      );
    }
  }

  // Règle 1 : annuler une entrée déjà consommée rendrait le stock négatif.
  const stockNegatif = () =>
    refus(
      "STOCK_INSUFFISANT",
      "Annulation impossible : le stock deviendrait négatif. Faites plutôt une correction d'inventaire.",
    );
  if (reference.stock - original.delta < 0) throw stockNegatif();

  let id: number | null;
  try {
    id = await insererAnnulation(base, {
      cree_le: horodatage(maintenant),
      original,
      teacher_id: teacherId,
      commentaire,
      exigerDernier: !estGestionnaire,
    });
  } catch (erreur) {
    if (estRefusStockNegatif(erreur)) throw stockNegatif();
    throw erreur;
  }
  if (id === null) {
    // Un autre mouvement est arrivé entre le contrôle et l'écriture.
    throw (await estAnnule(base, original.id))
      ? refus("DEJA_ANNULE", "Ce mouvement a déjà été annulé.")
      : refus(
          "PAS_LE_DERNIER_MOUVEMENT",
          "Ce mouvement ne peut plus être annulé : un autre mouvement a été enregistré depuis sur cette référence. Adressez-vous au gestionnaire.",
        );
  }
  return resultat(base, id);
}
