// Routes de l'historique (5.5) : consultation filtrée et export CSV.

import { Hono } from "hono";
import { reponseCsv, versCsv } from "../commun/csv";
import { debutDuJourDeParis, enHeureDeParis, estJourValide, horodatage, jourDeParis, jourSuivant } from "../commun/heure";
import { libelleReference, libelleType, specification } from "../commun/matiere";
import { exigerSession, type Contexte, type Environnement } from "../contexte";
import { listerEnseignants } from "../donnees/enseignants";
import { compterHistorique, listerHistorique, type FiltresHistorique, type LigneHistorique } from "../donnees/historique";
import { listerMachines } from "../donnees/machines";
import type { Nature } from "../donnees/mouvements";
import { listerReferences } from "../donnees/references";
import { ErreurApi } from "../erreurs";
import { DELAI_ANNULATION_MS } from "../mouvements/regles";

const NATURES: Nature[] = ["prelevement", "entree", "correction", "annulation"];
const LIBELLE_NATURE: Record<Nature, string> = {
  prelevement: "Prélèvement",
  entree: "Entrée",
  correction: "Correction",
  annulation: "Annulation",
};
const PERIODES_EN_JOURS: Record<string, number> = { "7j": 7, "30j": 30, "90j": 90, "365j": 365 };
const LIMITE_PAR_DEFAUT = 200;
const LIMITE_MAX = 1000;
const LIMITE_EXPORT = 20_000;
const JOUR_MS = 24 * 60 * 60 * 1000;

function refuser(champ: string, message: string): never {
  throw new ErreurApi(400, "FILTRE_INVALIDE", message, { champ });
}

function identifiant(c: Contexte, nom: string): number | undefined {
  const brut = c.req.query(nom);
  if (brut === undefined || brut === "") return undefined;
  if (!/^\d+$/.test(brut)) refuser(nom, "Filtre invalide.");
  return Number(brut);
}

/** Filtres lus dans l'adresse. La période par défaut est de 30 jours. */
function lireFiltres(c: Contexte): FiltresHistorique {
  const filtres: FiltresHistorique = {
    enseignantId: identifiant(c, "enseignant"),
    referenceId: identifiant(c, "reference"),
    machineId: identifiant(c, "machine"),
  };

  const nature = c.req.query("nature");
  if (nature) {
    if (!NATURES.includes(nature as Nature)) refuser("nature", "Nature de mouvement inconnue.");
    filtres.nature = nature as Nature;
  }

  const projet = (c.req.query("projet") ?? "").trim();
  if (projet) filtres.projet = projet.slice(0, 60);

  const maintenant = c.var.maintenant;
  const periode = c.req.query("periode") ?? "30j";
  if (periode === "tout") {
    // Aucune borne.
  } else if (periode === "jour") {
    filtres.depuis = horodatage(debutDuJourDeParis(jourDeParis(maintenant)));
  } else if (periode === "dates") {
    // Jours entiers, en heure de Paris, bornes comprises.
    const du = c.req.query("du") ?? "";
    const au = c.req.query("au") ?? "";
    if (du) {
      if (!estJourValide(du)) refuser("du", "La date de début est invalide.");
      filtres.depuis = horodatage(debutDuJourDeParis(du));
    }
    if (au) {
      if (!estJourValide(au)) refuser("au", "La date de fin est invalide.");
      filtres.jusqua = horodatage(debutDuJourDeParis(jourSuivant(au)));
    }
    if (du && au && du > au) refuser("au", "La date de fin précède la date de début.");
  } else if (PERIODES_EN_JOURS[periode] !== undefined) {
    filtres.depuis = horodatage(new Date(maintenant.getTime() - PERIODES_EN_JOURS[periode]! * JOUR_MS));
  } else {
    refuser("periode", "Période inconnue.");
  }
  return filtres;
}

/**
 * Indique si le bouton « Annuler » peut être proposé pour cette ligne (règle 3).
 * Ce n'est qu'une aide à l'affichage : l'annulation elle-même revérifie tout.
 */
function estAnnulable(l: LigneHistorique, estGestionnaire: boolean, maintenant: Date): boolean {
  if (l.nature === "annulation" || l.annule_par !== null) return false;
  if (estGestionnaire) return true;
  return (
    l.nature !== "correction" &&
    l.reference_active === 1 &&
    l.dernier_id === l.id &&
    maintenant.getTime() - Date.parse(l.cree_le) <= DELAI_ANNULATION_MS
  );
}

export const routesHistorique = new Hono<Environnement>();

routesHistorique.get("/historique", exigerSession, async (c) => {
  const filtres = lireFiltres(c);
  const brute = Number(c.req.query("limite") ?? LIMITE_PAR_DEFAUT);
  const limite = Number.isInteger(brute) && brute > 0 ? Math.min(brute, LIMITE_MAX) : LIMITE_PAR_DEFAUT;
  const estGestionnaire = c.var.session!.gestionnaire;

  const [lignes, total] = await Promise.all([
    listerHistorique(c.var.base, filtres, limite),
    compterHistorique(c.var.base, filtres),
  ]);
  return c.json({
    total,
    mouvements: lignes.map(({ reference_active, dernier_id, annule_par, ...l }) => ({
      ...l,
      // Date prête à afficher, en heure de Paris (règle 6).
      date: enHeureDeParis(l.cree_le),
      annule: annule_par !== null,
      annulable: estAnnulable({ ...l, reference_active, dernier_id, annule_par }, estGestionnaire, c.var.maintenant),
    })),
  });
});

// Listes des filtres : tous les noms, y compris désactivés, puisqu'ils figurent dans l'historique.
routesHistorique.get("/historique/filtres", exigerSession, async (c) => {
  const [enseignants, references, machines] = await Promise.all([
    listerEnseignants(c.var.base, true),
    listerReferences(c.var.base, true),
    listerMachines(c.var.base, true),
  ]);
  return c.json({ enseignants, references, machines });
});

// Export CSV de la sélection filtrée.
routesHistorique.get("/historique.csv", exigerSession, async (c) => {
  const lignes = await listerHistorique(c.var.base, lireFiltres(c), LIMITE_EXPORT);
  const contenu = versCsv(
    [
      "Date",
      "Heure",
      "Enseignant",
      "Type",
      "Matière",
      "Spécification",
      "Nature",
      "Quantité",
      "Machine",
      "Projet ou classe",
      "Commentaire",
      "Annulé",
    ],
    lignes.map((l) => {
      const [date, heure] = enHeureDeParis(l.cree_le).split(" ") as [string, string];
      return [
        date,
        heure,
        l.enseignant,
        libelleType(l.type),
        libelleReference(l),
        specification(l),
        LIBELLE_NATURE[l.nature],
        l.delta,
        l.machine,
        l.projet,
        l.commentaire,
        l.annule_par !== null ? "oui" : "non",
      ];
    }),
  );
  return reponseCsv(`historique-fablab-${jourDeParis(c.var.maintenant)}.csv`, contenu);
});
