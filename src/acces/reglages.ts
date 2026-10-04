// Réglages de l'accès, regroupés ici pour être faciles à ajuster.

const MINUTE = 60_000;
const JOUR = 24 * 60 * MINUTE;

/** Durée de maintien de la session sur l'appareil. */
export const DUREE_SESSION_MS = 90 * JOUR;
/** La session est prolongée au plus une fois par jour, pour limiter les écritures. */
export const INTERVALLE_PROLONGATION_MS = JOUR;
/** Durée d'inactivité avant fermeture du mode gestionnaire. */
export const INACTIVITE_GESTIONNAIRE_MS = 15 * MINUTE;

/** Fenêtre de comptage des essais de code. */
export const FENETRE_ESSAIS_MS = 15 * MINUTE;
/** Essais autorisés par appareil (adresse IP) dans la fenêtre. */
export const MAX_ESSAIS_PAR_ORIGINE = 5;
/** Essais autorisés toutes origines confondues dans la fenêtre. */
export const MAX_ESSAIS_GLOBAL = 30;

export const LONGUEUR_MIN_CODE_COMMUN = 6;
export const LONGUEUR_MIN_CODE_GESTIONNAIRE = 8;
export const LONGUEUR_MAX_CODE = 64;

export const LONGUEUR_MAX_NOM = 60;

export type TypeCode = "commun" | "gestionnaire";

export const CLE_PARAMETRE: Record<TypeCode, string> = {
  commun: "code_commun",
  gestionnaire: "code_gestionnaire",
};
