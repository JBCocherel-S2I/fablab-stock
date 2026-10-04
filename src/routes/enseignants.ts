// Routes de la liste des enseignants (spécifications, 5.8).

import { Hono } from "hono";
import { LONGUEUR_MAX_NOM } from "../acces/reglages";
import { exigerGestionnaire, exigerSession, lireCorps, lireIdentifiant, type Environnement } from "../contexte";
import type { Base } from "../donnees/base";
import { creerEnseignant, lireEnseignant, listerEnseignants, modifierEnseignant } from "../donnees/enseignants";
import { ErreurApi } from "../erreurs";

/** Nom nettoyé : espaces superflus retirés. */
function validerNom(valeur: unknown): string {
  const nom = typeof valeur === "string" ? valeur.normalize("NFC").replace(/\s+/g, " ").trim() : "";
  if (nom === "" || [...nom].length > LONGUEUR_MAX_NOM) {
    throw new ErreurApi(
      400,
      "NOM_INVALIDE",
      `Le nom est obligatoire et ne doit pas dépasser ${LONGUEUR_MAX_NOM} caractères.`,
    );
  }
  return nom;
}

/** Deux noms ne peuvent pas différer seulement par la casse ou les accents. */
async function exigerNomLibre(base: Base, nom: string, saufId: number | null): Promise<void> {
  const tous = await listerEnseignants(base, true);
  const doublon = tous.find(
    (e) => e.id !== saufId && e.nom.localeCompare(nom, "fr", { sensitivity: "base" }) === 0,
  );
  if (doublon) {
    throw new ErreurApi(
      409,
      "NOM_DEJA_UTILISE",
      doublon.actif
        ? `Le nom « ${doublon.nom} » existe déjà dans la liste.`
        : `Le nom « ${doublon.nom} » existe déjà, désactivé. Réactivez-le plutôt que d'en créer un nouveau.`,
    );
  }
}

export const routesEnseignants = new Hono<Environnement>();

// Liste pour les sélecteurs de saisie : noms actifs uniquement.
routesEnseignants.get("/enseignants", exigerSession, async (c) => {
  return c.json({ enseignants: await listerEnseignants(c.var.base, false) });
});

// Liste complète pour l'administration, noms désactivés compris.
routesEnseignants.get("/administration/enseignants", exigerGestionnaire, async (c) => {
  return c.json({ enseignants: await listerEnseignants(c.var.base, true) });
});

routesEnseignants.post("/administration/enseignants", exigerGestionnaire, async (c) => {
  const corps = await lireCorps(c);
  const nom = validerNom(corps.nom);
  await exigerNomLibre(c.var.base, nom, null);
  return c.json({ enseignant: await creerEnseignant(c.var.base, nom) }, 201);
});

// Renommage, désactivation ou réactivation.
routesEnseignants.patch("/administration/enseignants/:id", exigerGestionnaire, async (c) => {
  const id = lireIdentifiant(c);
  const enseignant = await lireEnseignant(c.var.base, id);
  if (!enseignant) throw new ErreurApi(404, "INTROUVABLE", "Enseignant introuvable.");

  const corps = await lireCorps(c);
  if (corps.nom !== undefined) {
    const nom = validerNom(corps.nom);
    await exigerNomLibre(c.var.base, nom, id);
    enseignant.nom = nom;
  }
  if (corps.actif !== undefined) {
    if (typeof corps.actif !== "boolean") {
      throw new ErreurApi(400, "REQUETE_INVALIDE", "La requête est mal formée.");
    }
    enseignant.actif = corps.actif;
  }
  await modifierEnseignant(c.var.base, enseignant);
  return c.json({ enseignant });
});
