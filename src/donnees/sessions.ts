// Table session.

import type { Base } from "./base";

export interface LigneSession {
  jeton_hache: string;
  cree_le: string;
  vu_le: string;
  expire_le: string;
  gestionnaire_vu_le: string | null;
}

export async function creerSession(base: Base, s: LigneSession): Promise<void> {
  await base.executer(
    `INSERT INTO session (jeton_hache, cree_le, vu_le, expire_le, gestionnaire_vu_le)
     VALUES (?, ?, ?, ?, ?)`,
    [s.jeton_hache, s.cree_le, s.vu_le, s.expire_le, s.gestionnaire_vu_le],
  );
}

export function lireSession(base: Base, jetonHache: string): Promise<LigneSession | null> {
  return base.premier<LigneSession>("SELECT * FROM session WHERE jeton_hache = ?", [jetonHache]);
}

export async function prolongerSession(
  base: Base,
  jetonHache: string,
  vuLe: string,
  expireLe: string,
): Promise<void> {
  await base.executer("UPDATE session SET vu_le = ?, expire_le = ? WHERE jeton_hache = ?", [
    vuLe,
    expireLe,
    jetonHache,
  ]);
}

/** Ouvre, prolonge (date) ou ferme (null) le mode gestionnaire d'une session. */
export async function marquerGestionnaire(base: Base, jetonHache: string, vuLe: string | null): Promise<void> {
  await base.executer("UPDATE session SET gestionnaire_vu_le = ? WHERE jeton_hache = ?", [vuLe, jetonHache]);
}

export async function supprimerSession(base: Base, jetonHache: string): Promise<void> {
  await base.executer("DELETE FROM session WHERE jeton_hache = ?", [jetonHache]);
}

/** Déconnecte tous les appareils sauf celui indiqué (changement du code commun). */
export async function supprimerAutresSessions(base: Base, jetonHache: string): Promise<void> {
  await base.executer("DELETE FROM session WHERE jeton_hache <> ?", [jetonHache]);
}

/** Ferme le mode gestionnaire partout ailleurs (changement du code gestionnaire). */
export async function fermerGestionnaireAilleurs(base: Base, jetonHache: string): Promise<void> {
  await base.executer("UPDATE session SET gestionnaire_vu_le = NULL WHERE jeton_hache <> ?", [jetonHache]);
}

export async function purgerSessionsExpirees(base: Base, maintenant: string): Promise<void> {
  await base.executer("DELETE FROM session WHERE expire_le <= ?", [maintenant]);
}
