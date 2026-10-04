// Codes d'accès : vérification avec limitation des essais, et modification.

import { horodatage } from "../commun/heure";
import type { Base } from "../donnees/base";
import { creerParametreSiAbsent, ecrireParametre, lireParametre } from "../donnees/parametres";
import {
  compterTentatives,
  effacerTentatives,
  enregistrerTentative,
  purgerTentatives,
  supprimerTentative,
} from "../donnees/tentatives";
import { ErreurApi } from "../erreurs";
import { hacherCode, normaliserCode, verifierCode } from "./hachage";
import {
  CLE_PARAMETRE,
  FENETRE_ESSAIS_MS,
  LONGUEUR_MAX_CODE,
  LONGUEUR_MIN_CODE_COMMUN,
  LONGUEUR_MIN_CODE_GESTIONNAIRE,
  MAX_ESSAIS_GLOBAL,
  MAX_ESSAIS_PAR_ORIGINE,
  type TypeCode,
} from "./reglages";

const LIBELLE: Record<TypeCode, string> = {
  commun: "code d'accès",
  gestionnaire: "code gestionnaire",
};

export async function codeCommunDefini(base: Base): Promise<boolean> {
  return (await lireParametre(base, CLE_PARAMETRE.commun)) !== null;
}

/**
 * Hachage du code gestionnaire. À la toute première utilisation, il est créé à
 * partir du secret CODE_GESTIONNAIRE_INITIAL, qui ne sert plus ensuite.
 */
async function hachageGestionnaire(
  base: Base,
  codeInitial: string | undefined,
  iterations: number,
  maintenant: Date,
): Promise<string> {
  const existant = await lireParametre(base, CLE_PARAMETRE.gestionnaire);
  if (existant) return existant;
  if (!codeInitial || normaliserCode(codeInitial) === "") {
    throw new ErreurApi(
      503,
      "CODE_GESTIONNAIRE_NON_CONFIGURE",
      "Le code gestionnaire initial n'est pas configuré. Définissez le secret CODE_GESTIONNAIRE_INITIAL.",
    );
  }
  await creerParametreSiAbsent(
    base,
    CLE_PARAMETRE.gestionnaire,
    await hacherCode(codeInitial, iterations),
    horodatage(maintenant),
  );
  return (await lireParametre(base, CLE_PARAMETRE.gestionnaire))!;
}

function minutesRestantes(plusAncien: string | null, maintenant: Date): number {
  const fin = (plusAncien ? Date.parse(plusAncien) : maintenant.getTime()) + FENETRE_ESSAIS_MS;
  return Math.max(1, Math.ceil((fin - maintenant.getTime()) / 60_000));
}

export interface ContexteVerification {
  base: Base;
  maintenant: Date;
  /** Empreinte de l'adresse IP de l'appareil. */
  origine: string;
  /** Secret CODE_GESTIONNAIRE_INITIAL, s'il est défini. */
  codeGestionnaireInitial: string | undefined;
  /** Nombre d'itérations du hachage pour les nouveaux codes. */
  iterations: number;
}

/**
 * Vérifie un code. Lève une ErreurApi si le code est faux ou si le nombre
 * d'essais est dépassé. L'essai est enregistré avant la vérification, pour que
 * des essais lancés en rafale soient tous comptés.
 */
export async function exigerCode(ctx: ContexteVerification, type: TypeCode, saisie: unknown): Promise<void> {
  const { base, maintenant, origine } = ctx;
  const hachage =
    type === "gestionnaire"
      ? await hachageGestionnaire(base, ctx.codeGestionnaireInitial, ctx.iterations, maintenant)
      : await lireParametre(base, CLE_PARAMETRE.commun);
  if (!hachage) {
    throw new ErreurApi(
      409,
      "CODE_COMMUN_NON_DEFINI",
      "Le code d'accès n'est pas encore défini. Le gestionnaire doit le créer.",
    );
  }

  const debutFenetre = horodatage(new Date(maintenant.getTime() - FENETRE_ESSAIS_MS));
  await purgerTentatives(base, debutFenetre);
  const idEssai = await enregistrerTentative(base, type, origine, horodatage(maintenant));
  const compte = await compterTentatives(base, type, origine, debutFenetre);

  const bloqueOrigine = compte.origine > MAX_ESSAIS_PAR_ORIGINE;
  const bloqueGlobal = compte.total > MAX_ESSAIS_GLOBAL;
  if (bloqueOrigine || bloqueGlobal) {
    // Un essai refusé sans vérification ne prolonge pas le blocage.
    await supprimerTentative(base, idEssai);
    const minutes = minutesRestantes(bloqueOrigine ? compte.plusAncienOrigine : compte.plusAncienTotal, maintenant);
    throw new ErreurApi(
      429,
      "TROP_D_ESSAIS",
      `Trop d'essais. Réessayez dans ${minutes} minute${minutes > 1 ? "s" : ""}.`,
      { minutes },
    );
  }

  if (typeof saisie !== "string" || !(await verifierCode(saisie, hachage))) {
    const essaisRestants = MAX_ESSAIS_PAR_ORIGINE - compte.origine;
    throw new ErreurApi(
      401,
      "CODE_INCORRECT",
      essaisRestants > 0
        ? `Code incorrect. Il reste ${essaisRestants} essai${essaisRestants > 1 ? "s" : ""}.`
        : "Code incorrect. C'était le dernier essai avant blocage temporaire.",
      { essaisRestants },
    );
  }

  await effacerTentatives(base, type, origine);
}

/** Enregistre un nouveau code après contrôle de sa forme. */
export async function changerCode(
  base: Base,
  type: TypeCode,
  nouveau: unknown,
  iterations: number,
  maintenant: Date,
): Promise<void> {
  const minimum = type === "commun" ? LONGUEUR_MIN_CODE_COMMUN : LONGUEUR_MIN_CODE_GESTIONNAIRE;
  const code = typeof nouveau === "string" ? normaliserCode(nouveau) : "";
  // Longueur comptée en caractères, pas en unités UTF-16.
  const longueur = [...code].length;
  if (longueur < minimum || longueur > LONGUEUR_MAX_CODE) {
    throw new ErreurApi(
      400,
      "CODE_INVALIDE",
      `Le ${LIBELLE[type]} doit comporter entre ${minimum} et ${LONGUEUR_MAX_CODE} caractères.`,
    );
  }

  // Les deux codes doivent rester différents, sinon le code commun ouvrirait l'administration.
  const autre = await lireParametre(base, CLE_PARAMETRE[type === "commun" ? "gestionnaire" : "commun"]);
  if (autre && (await verifierCode(code, autre))) {
    throw new ErreurApi(
      400,
      "CODES_IDENTIQUES",
      "Le code d'accès et le code gestionnaire doivent être différents.",
    );
  }

  await ecrireParametre(base, CLE_PARAMETRE[type], await hacherCode(code, iterations), horodatage(maintenant));
}
