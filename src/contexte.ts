// Types et gardes partagés par les routes de l'API.

import type { Context, MiddlewareHandler } from "hono";
import { activerGestionnaire, type SessionActive } from "./acces/sessions";
import type { Base } from "./donnees/base";
import { ErreurApi } from "./erreurs";

export type Environnement = {
  Bindings: Env;
  Variables: {
    base: Base;
    maintenant: Date;
    session: SessionActive | null;
  };
};

export type Contexte = Context<Environnement>;

/** Refuse la requête si l'appareil n'a pas de session ouverte par le code commun. */
export const exigerSession: MiddlewareHandler<Environnement> = async (c, next) => {
  if (!c.var.session) {
    throw new ErreurApi(401, "SESSION_REQUISE", "Saisissez le code d'accès pour continuer.");
  }
  await next();
};

/**
 * Refuse la requête hors mode gestionnaire. Ce contrôle est fait ici, côté
 * serveur, pour toutes les actions réservées au gestionnaire. Chaque action
 * autorisée repousse la fermeture automatique du mode.
 */
export const exigerGestionnaire: MiddlewareHandler<Environnement> = async (c, next) => {
  const session = c.var.session;
  if (!session) {
    throw new ErreurApi(401, "SESSION_REQUISE", "Saisissez le code d'accès pour continuer.");
  }
  if (!session.gestionnaire) {
    throw new ErreurApi(
      403,
      "GESTIONNAIRE_REQUIS",
      "Cette action est réservée au gestionnaire. Saisissez le code gestionnaire.",
    );
  }
  await activerGestionnaire(c.var.base, session, c.var.maintenant);
  await next();
};

/** Corps JSON de la requête, sous forme d'objet. */
export async function lireCorps(c: Contexte): Promise<Record<string, unknown>> {
  let corps: unknown;
  try {
    corps = await c.req.json();
  } catch {
    corps = null;
  }
  if (typeof corps !== "object" || corps === null || Array.isArray(corps)) {
    throw new ErreurApi(400, "REQUETE_INVALIDE", "La requête est mal formée.");
  }
  return corps as Record<string, unknown>;
}

/** Identifiant entier positif pris dans l'adresse. */
export function lireIdentifiant(c: Contexte, nom = "id"): number {
  const brut = c.req.param(nom) ?? "";
  const id = Number(brut);
  if (!/^\d+$/.test(brut) || !Number.isSafeInteger(id) || id <= 0) {
    throw new ErreurApi(404, "INTROUVABLE", "Élément introuvable.");
  }
  return id;
}
