// Assemblage de l'API. L'horloge est injectable pour que les tests puissent
// faire avancer le temps (expiration de session, blocage des essais).

import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import { chargerSession } from "./acces/sessions";
import { enHeureDeParis, horodatage } from "./commun/heure";
import type { Environnement } from "./contexte";
import { baseD1 } from "./donnees/d1";
import { lireEtatBase } from "./donnees/etat";
import { ErreurApi } from "./erreurs";
import { nomCookie, poserCookie, routesAcces } from "./routes/acces";
import { routesCatalogue } from "./routes/catalogue";
import { routesCommande } from "./routes/commande";
import { routesEnseignants } from "./routes/enseignants";
import { routesHistorique } from "./routes/historique";
import { routesMouvements } from "./routes/mouvements";

const METHODES_DE_LECTURE = new Set(["GET", "HEAD", "OPTIONS"]);

/** Ce PC, ou un appareil du même réseau local : HTTP y est permis pour le développement. */
const HOTE_LOCAL =
  /^(localhost|127\.\d+\.\d+\.\d+|\[::1\]|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)$/;

export function creerApp(horloge: () => Date = () => new Date()) {
  const app = new Hono<Environnement>();

  app.use("/api/*", async (c, next) => {
    // En ligne, l'API ne répond qu'en HTTPS : un code ne doit jamais circuler en clair.
    const adresse = new URL(c.req.url);
    if (adresse.protocol === "http:" && !HOTE_LOCAL.test(adresse.hostname)) {
      throw new ErreurApi(400, "HTTPS_REQUIS", "Utilisez l'adresse en https:// pour accéder à l'application.");
    }

    // Protection contre les requêtes forgées depuis un autre site : une écriture
    // doit venir de l'application elle-même et être envoyée en JSON.
    if (!METHODES_DE_LECTURE.has(c.req.method)) {
      const origine = c.req.header("origin");
      if (origine && origine !== new URL(c.req.url).origin) {
        throw new ErreurApi(403, "ORIGINE_REFUSEE", "Requête refusée.");
      }
      if (!(c.req.header("content-type") ?? "").startsWith("application/json")) {
        throw new ErreurApi(400, "REQUETE_INVALIDE", "La requête est mal formée.");
      }
    }

    const maintenant = horloge();
    const base = baseD1(c.env.DB);
    c.set("maintenant", maintenant);
    c.set("base", base);

    const jeton = getCookie(c, nomCookie(c));
    const session = await chargerSession(base, jeton, maintenant);
    c.set("session", session);
    if (session?.prolongee && jeton) poserCookie(c, jeton);

    await next();
    c.header("Cache-Control", "no-store");
  });

  // État du socle : sert à vérifier le déploiement et la liaison avec la base.
  app.get("/api/etat", async (c) => {
    const base = await lireEtatBase(c.var.base);
    const ok = base.accessible && base.manquantes.length === 0;
    return c.json(
      {
        ok,
        application: "fablab-stock",
        base,
        heureServeur: horodatage(c.var.maintenant),
        heureParis: enHeureDeParis(c.var.maintenant),
      },
      ok ? 200 : 503,
    );
  });

  app.route("/api", routesAcces);
  app.route("/api", routesEnseignants);
  app.route("/api", routesCatalogue);
  app.route("/api", routesMouvements);
  app.route("/api", routesHistorique);
  app.route("/api", routesCommande);

  app.notFound((c) => c.json({ erreur: "Ressource introuvable.", code: "INTROUVABLE" }, 404));

  app.onError((erreur, c) => {
    if (erreur instanceof ErreurApi) {
      return c.json({ erreur: erreur.message, code: erreur.code, ...erreur.details }, erreur.statut, {
        "Cache-Control": "no-store",
      });
    }
    console.error(erreur);
    return c.json({ erreur: "Erreur interne. Réessayez dans un instant.", code: "ERREUR_INTERNE" }, 500);
  });

  return app;
}
