// Sessions : une session par appareil, longue pour l'accès commun, avec un mode
// gestionnaire qui se referme après une période d'inactivité.

import { horodatage } from "../commun/heure";
import type { Base } from "../donnees/base";
import {
  creerSession,
  lireSession,
  marquerGestionnaire,
  prolongerSession,
  purgerSessionsExpirees,
} from "../donnees/sessions";
import { empreinte, jetonAleatoire } from "./hachage";
import { DUREE_SESSION_MS, INACTIVITE_GESTIONNAIRE_MS, INTERVALLE_PROLONGATION_MS } from "./reglages";

export interface SessionActive {
  jetonHache: string;
  gestionnaire: boolean;
  /** Fin du mode gestionnaire s'il n'y a pas de nouvelle action, sinon null. */
  gestionnaireExpireLe: string | null;
  /** Vrai si la session vient d'être prolongée : le cookie doit être renouvelé. */
  prolongee: boolean;
}

function plus(date: Date, ms: number): string {
  return horodatage(new Date(date.getTime() + ms));
}

/** Crée une session et renvoie le jeton à placer dans le cookie. */
export async function ouvrirSession(base: Base, maintenant: Date, gestionnaire: boolean): Promise<string> {
  await purgerSessionsExpirees(base, horodatage(maintenant));
  const jeton = jetonAleatoire();
  await creerSession(base, {
    jeton_hache: await empreinte(jeton),
    cree_le: horodatage(maintenant),
    vu_le: horodatage(maintenant),
    expire_le: plus(maintenant, DUREE_SESSION_MS),
    gestionnaire_vu_le: gestionnaire ? horodatage(maintenant) : null,
  });
  return jeton;
}

/** Retrouve la session d'un jeton de cookie, ou null si elle est absente ou expirée. */
export async function chargerSession(
  base: Base,
  jeton: string | undefined,
  maintenant: Date,
): Promise<SessionActive | null> {
  if (!jeton) return null;
  const jetonHache = await empreinte(jeton);
  const ligne = await lireSession(base, jetonHache);
  if (!ligne || ligne.expire_le <= horodatage(maintenant)) return null;

  let prolongee = false;
  if (maintenant.getTime() - Date.parse(ligne.vu_le) >= INTERVALLE_PROLONGATION_MS) {
    await prolongerSession(base, jetonHache, horodatage(maintenant), plus(maintenant, DUREE_SESSION_MS));
    prolongee = true;
  }

  const finGestionnaire = ligne.gestionnaire_vu_le
    ? Date.parse(ligne.gestionnaire_vu_le) + INACTIVITE_GESTIONNAIRE_MS
    : null;
  const gestionnaire = finGestionnaire !== null && maintenant.getTime() < finGestionnaire;

  return {
    jetonHache,
    gestionnaire,
    gestionnaireExpireLe: gestionnaire ? horodatage(new Date(finGestionnaire)) : null,
    prolongee,
  };
}

/** Ouvre le mode gestionnaire, ou repousse sa fermeture à chaque action du gestionnaire. */
export async function activerGestionnaire(base: Base, session: SessionActive, maintenant: Date): Promise<void> {
  await marquerGestionnaire(base, session.jetonHache, horodatage(maintenant));
  session.gestionnaire = true;
  session.gestionnaireExpireLe = plus(maintenant, INACTIVITE_GESTIONNAIRE_MS);
}

export async function fermerGestionnaire(base: Base, session: SessionActive): Promise<void> {
  await marquerGestionnaire(base, session.jetonHache, null);
  session.gestionnaire = false;
  session.gestionnaireExpireLe = null;
}
