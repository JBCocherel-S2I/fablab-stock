// Routes du catalogue (spécifications, 5.7) : références de matière et machines.
// Aucune route de suppression : une référence ou une machine se désactive (règle 4).

import { Hono } from "hono";
import {
  booleen,
  memeReference,
  texteObligatoire,
  typeMatiere,
  validerReference,
} from "../catalogue/validation";
import { exigerGestionnaire, exigerSession, lireCorps, lireIdentifiant, type Environnement } from "../contexte";
import type { Base } from "../donnees/base";
import {
  creerMachine,
  lireMachine,
  listerMachines,
  machineUtilisee,
  modifierMachine,
} from "../donnees/machines";
import {
  creerReference,
  lireReference,
  listerReferences,
  modifierReference,
  type DonneesReference,
} from "../donnees/references";
import { ErreurApi } from "../erreurs";

export const routesCatalogue = new Hono<Environnement>();

// ---------- Références ----------

async function exigerReferenceUnique(base: Base, donnees: DonneesReference, saufId: number | null): Promise<void> {
  const doublon = (await listerReferences(base, true)).find((r) => r.id !== saufId && memeReference(r, donnees));
  if (doublon) {
    throw new ErreurApi(
      409,
      "REFERENCE_DEJA_EXISTANTE",
      doublon.actif
        ? "Cette référence existe déjà dans le catalogue."
        : "Cette référence existe déjà, désactivée. Réactivez-la plutôt que d'en créer une nouvelle.",
    );
  }
}

// Listes de saisie : références actives uniquement, avec leur stock.
routesCatalogue.get("/references", exigerSession, async (c) => {
  return c.json({ references: await listerReferences(c.var.base, false) });
});

routesCatalogue.get("/administration/references", exigerGestionnaire, async (c) => {
  return c.json({ references: await listerReferences(c.var.base, true) });
});

routesCatalogue.post("/administration/references", exigerGestionnaire, async (c) => {
  const corps = await lireCorps(c);
  const donnees = validerReference(corps, typeMatiere(corps.type), null);
  await exigerReferenceUnique(c.var.base, donnees, null);
  const id = await creerReference(c.var.base, donnees);
  return c.json({ reference: await lireReference(c.var.base, id) }, 201);
});

// Modification, désactivation ou réactivation. Seuls les champs envoyés changent.
routesCatalogue.patch("/administration/references/:id", exigerGestionnaire, async (c) => {
  const id = lireIdentifiant(c);
  const actuelle = await lireReference(c.var.base, id);
  if (!actuelle) throw new ErreurApi(404, "INTROUVABLE", "Référence introuvable.");

  const corps = await lireCorps(c);
  if (corps.type !== undefined && corps.type !== actuelle.type) {
    throw new ErreurApi(400, "CHAMP_INVALIDE", "Le type d'une référence ne peut pas être modifié.", {
      champ: "type",
    });
  }
  const donnees = validerReference(corps, actuelle.type, actuelle);
  await exigerReferenceUnique(c.var.base, donnees, id);
  await modifierReference(c.var.base, id, donnees);
  return c.json({ reference: await lireReference(c.var.base, id) });
});

// ---------- Machines ----------

async function exigerNomMachineLibre(base: Base, nom: string, saufId: number | null): Promise<void> {
  const doublon = (await listerMachines(base, true)).find(
    (m) => m.id !== saufId && m.nom.localeCompare(nom, "fr", { sensitivity: "base" }) === 0,
  );
  if (doublon) {
    throw new ErreurApi(
      409,
      "NOM_DEJA_UTILISE",
      doublon.actif
        ? `La machine « ${doublon.nom} » existe déjà.`
        : `La machine « ${doublon.nom} » existe déjà, désactivée. Réactivez-la plutôt que d'en créer une nouvelle.`,
    );
  }
}

// Liste de saisie : machines actives uniquement.
routesCatalogue.get("/machines", exigerSession, async (c) => {
  return c.json({ machines: await listerMachines(c.var.base, false) });
});

routesCatalogue.get("/administration/machines", exigerGestionnaire, async (c) => {
  return c.json({ machines: await listerMachines(c.var.base, true) });
});

routesCatalogue.post("/administration/machines", exigerGestionnaire, async (c) => {
  const corps = await lireCorps(c);
  const nom = texteObligatoire(corps.nom, "nom", "Le nom");
  const type = typeMatiere(corps.type);
  await exigerNomMachineLibre(c.var.base, nom, null);
  return c.json({ machine: await creerMachine(c.var.base, nom, type) }, 201);
});

routesCatalogue.patch("/administration/machines/:id", exigerGestionnaire, async (c) => {
  const id = lireIdentifiant(c);
  const machine = await lireMachine(c.var.base, id);
  if (!machine) throw new ErreurApi(404, "INTROUVABLE", "Machine introuvable.");

  const corps = await lireCorps(c);
  if (corps.nom !== undefined) {
    const nom = texteObligatoire(corps.nom, "nom", "Le nom");
    await exigerNomMachineLibre(c.var.base, nom, id);
    machine.nom = nom;
  }
  if (corps.type !== undefined) {
    const type = typeMatiere(corps.type);
    // Changer le type d'une machine déjà utilisée rendrait l'historique incohérent.
    if (type !== machine.type && (await machineUtilisee(c.var.base, id))) {
      throw new ErreurApi(
        409,
        "MACHINE_UTILISEE",
        "Le type de cette machine ne peut plus changer : des prélèvements y sont rattachés.",
      );
    }
    machine.type = type;
  }
  if (corps.actif !== undefined) machine.actif = booleen(corps.actif, "actif");
  await modifierMachine(c.var.base, machine);
  return c.json({ machine });
});
