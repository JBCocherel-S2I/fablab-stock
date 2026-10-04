// Routes d'accès : code commun, mode gestionnaire, déconnexion, modification des codes.

import { Hono } from "hono";
import { deleteCookie, setCookie } from "hono/cookie";
import { changerCode, codeCommunDefini, exigerCode, type ContexteVerification } from "../acces/codes";
import { empreinte, lireIterations } from "../acces/hachage";
import { DUREE_SESSION_MS } from "../acces/reglages";
import { activerGestionnaire, chargerSession, fermerGestionnaire, ouvrirSession } from "../acces/sessions";
import { exigerGestionnaire, exigerSession, lireCorps, type Contexte, type Environnement } from "../contexte";
import { compterACommander } from "../donnees/references";
import { fermerGestionnaireAilleurs, supprimerAutresSessions, supprimerSession } from "../donnees/sessions";

/**
 * Nom et options du cookie de session. En HTTPS (production), le préfixe __Host-
 * impose un cookie sécurisé, lié à ce seul site. En HTTP (développement local),
 * ces protections ne sont pas disponibles.
 */
function reglagesCookie(c: Contexte) {
  const https = new URL(c.req.url).protocol === "https:";
  return {
    nom: https ? "__Host-fablab-session" : "fablab-session",
    options: { path: "/", httpOnly: true, secure: https, sameSite: "Lax" as const },
  };
}

export function nomCookie(c: Contexte): string {
  return reglagesCookie(c).nom;
}

export function poserCookie(c: Contexte, jeton: string): void {
  const { nom, options } = reglagesCookie(c);
  setCookie(c, nom, jeton, { ...options, maxAge: DUREE_SESSION_MS / 1000 });
}

function iterations(c: Contexte): number {
  return lireIterations(c.env.ITERATIONS_HACHAGE);
}

async function contexteVerification(c: Contexte): Promise<ContexteVerification> {
  return {
    base: c.var.base,
    maintenant: c.var.maintenant,
    origine: await empreinte(c.req.header("cf-connecting-ip") ?? "inconnue"),
    codeGestionnaireInitial: (c.env as { CODE_GESTIONNAIRE_INITIAL?: string }).CODE_GESTIONNAIRE_INITIAL,
    iterations: iterations(c),
  };
}

async function etatSession(c: Contexte) {
  const session = c.var.session;
  return {
    connecte: session !== null,
    gestionnaire: session?.gestionnaire ?? false,
    gestionnaireExpireLe: session?.gestionnaireExpireLe ?? null,
    codeCommunDefini: await codeCommunDefini(c.var.base),
    // Nombre de références à commander, pour la pastille de la navigation.
    aCommander: session ? await compterACommander(c.var.base) : null,
  };
}

/** Ouvre une session pour cet appareil et l'installe dans le contexte. */
async function creerSessionAppareil(c: Contexte, gestionnaire: boolean): Promise<void> {
  const jeton = await ouvrirSession(c.var.base, c.var.maintenant, gestionnaire);
  poserCookie(c, jeton);
  c.set("session", await chargerSession(c.var.base, jeton, c.var.maintenant));
}

export const routesAcces = new Hono<Environnement>();

routesAcces.get("/session", async (c) => c.json(await etatSession(c)));

// Entrée dans l'application par le code commun.
routesAcces.post("/acces/entrer", async (c) => {
  const corps = await lireCorps(c);
  await exigerCode(await contexteVerification(c), "commun", corps.code);
  if (!c.var.session) await creerSessionAppareil(c, false);
  return c.json(await etatSession(c));
});

// Ouverture du mode gestionnaire. Le code gestionnaire ouvre aussi une session
// s'il n'y en a pas : c'est ce qui permet la toute première mise en service.
routesAcces.post("/acces/gestionnaire", async (c) => {
  const corps = await lireCorps(c);
  await exigerCode(await contexteVerification(c), "gestionnaire", corps.code);
  if (c.var.session) {
    await activerGestionnaire(c.var.base, c.var.session, c.var.maintenant);
  } else {
    await creerSessionAppareil(c, true);
  }
  return c.json(await etatSession(c));
});

routesAcces.post("/acces/quitter-gestionnaire", exigerSession, async (c) => {
  await fermerGestionnaire(c.var.base, c.var.session!);
  return c.json(await etatSession(c));
});

routesAcces.post("/acces/deconnexion", async (c) => {
  if (c.var.session) await supprimerSession(c.var.base, c.var.session.jetonHache);
  const { nom, options } = reglagesCookie(c);
  deleteCookie(c, nom, options);
  c.set("session", null);
  return c.json(await etatSession(c));
});

// Nouveau code commun : tous les autres appareils sont déconnectés.
routesAcces.put("/acces/code-commun", exigerGestionnaire, async (c) => {
  const corps = await lireCorps(c);
  await changerCode(c.var.base, "commun", corps.nouveau, iterations(c), c.var.maintenant);
  await supprimerAutresSessions(c.var.base, c.var.session!.jetonHache);
  return c.json(await etatSession(c));
});

// Nouveau code gestionnaire : le code actuel est redemandé, et le mode
// gestionnaire est fermé sur les autres appareils.
routesAcces.put("/acces/code-gestionnaire", exigerGestionnaire, async (c) => {
  const corps = await lireCorps(c);
  await exigerCode(await contexteVerification(c), "gestionnaire", corps.actuel);
  await changerCode(c.var.base, "gestionnaire", corps.nouveau, iterations(c), c.var.maintenant);
  await fermerGestionnaireAilleurs(c.var.base, c.var.session!.jetonHache);
  return c.json(await etatSession(c));
});
