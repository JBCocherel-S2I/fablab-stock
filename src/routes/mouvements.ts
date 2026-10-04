// Routes des mouvements : prélèvement (5.3), entrée de stock (5.4),
// annulation (règle 3) et correction d'inventaire (5.10).

import { Hono } from "hono";
import { exigerGestionnaire, exigerSession, lireCorps, lireIdentifiant, type Environnement } from "../contexte";
import { listerEnseignants } from "../donnees/enseignants";
import { listerMachines } from "../donnees/machines";
import { projetsConnus, utilisationsParReference } from "../donnees/mouvements";
import { listerReferences } from "../donnees/references";
import {
  annulerMouvement,
  enregistrerCorrection,
  enregistrerEntree,
  enregistrerPrelevement,
} from "../mouvements/regles";

export const routesMouvements = new Hono<Environnement>();

// Tout ce dont les écrans de saisie ont besoin, en un seul appel : références
// actives avec leur stock, machines et enseignants actifs, projets déjà saisis.
routesMouvements.get("/saisie", exigerSession, async (c) => {
  const base = c.var.base;
  const [references, machines, enseignants, projets, utilisations] = await Promise.all([
    listerReferences(base, false),
    listerMachines(base, false),
    listerEnseignants(base, false),
    projetsConnus(base),
    utilisationsParReference(base),
  ]);
  return c.json({
    references: references.map((r) => ({ ...r, utilisations: utilisations.get(r.id) ?? 0 })),
    machines,
    enseignants,
    projets,
  });
});

routesMouvements.post("/mouvements/prelevement", exigerSession, async (c) => {
  return c.json(await enregistrerPrelevement(c.var.base, c.var.maintenant, await lireCorps(c)), 201);
});

routesMouvements.post("/mouvements/entree", exigerSession, async (c) => {
  return c.json(await enregistrerEntree(c.var.base, c.var.maintenant, await lireCorps(c)), 201);
});

// Annulation : les droits étendus du gestionnaire sont décidés ici, côté serveur,
// d'après la session, jamais d'après ce qu'envoie l'interface.
routesMouvements.post("/mouvements/:id/annulation", exigerSession, async (c) => {
  const id = lireIdentifiant(c);
  const estGestionnaire = c.var.session!.gestionnaire;
  return c.json(await annulerMouvement(c.var.base, c.var.maintenant, id, await lireCorps(c), estGestionnaire), 201);
});

routesMouvements.post("/administration/corrections", exigerGestionnaire, async (c) => {
  return c.json(await enregistrerCorrection(c.var.base, c.var.maintenant, await lireCorps(c)), 201);
});
