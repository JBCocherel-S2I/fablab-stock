// Routes de la liste à commander (5.6). Aucun état de commande n'est suivi :
// la liste est recalculée à chaque consultation à partir des stocks.

import { Hono } from "hono";
import { reponseCsv, versCsv } from "../commun/csv";
import { enHeureDeParis, jourDeParis } from "../commun/heure";
import { libelleType, specification } from "../commun/matiere";
import { exigerSession, type Contexte, type Environnement } from "../contexte";
import type { Base } from "../donnees/base";
import { listerReferences, type Reference } from "../donnees/references";
import { ErreurApi } from "../erreurs";
import { QUANTITE_MAX } from "../mouvements/regles";

export interface LigneCommande extends Reference {
  /** Quantité suggérée : niveau cible moins stock actuel. */
  suggestion: number;
}

/** Références actives dont le stock est inférieur ou égal au seuil d'alerte. */
export async function listeACommander(base: Base): Promise<LigneCommande[]> {
  const references = await listerReferences(base, false);
  return references
    .filter((r) => r.stock <= r.seuil)
    .map((r) => ({ ...r, suggestion: Math.max(r.cible - r.stock, 0) }));
}

/**
 * Quantités modifiées à l'écran avant l'export, sous la forme "12:4,15:8"
 * (identifiant de référence : quantité). Elles ne sont enregistrées nulle part.
 */
function lireQuantites(c: Contexte, lignes: LigneCommande[]): Map<number, number> {
  const quantites = new Map<number, number>();
  const brut = c.req.query("quantites") ?? "";
  if (brut === "") return quantites;
  for (const paire of brut.split(",")) {
    const m = /^(\d+):(\d+)$/.exec(paire);
    const id = Number(m?.[1]);
    const quantite = Number(m?.[2]);
    if (!m || quantite > QUANTITE_MAX || !lignes.some((l) => l.id === id)) {
      throw new ErreurApi(400, "QUANTITE_INVALIDE", "Les quantités à commander sont invalides.");
    }
    quantites.set(id, quantite);
  }
  return quantites;
}

export const routesCommande = new Hono<Environnement>();

routesCommande.get("/commande", exigerSession, async (c) => {
  return c.json({
    etabliLe: enHeureDeParis(c.var.maintenant).split(" ")[0],
    lignes: await listeACommander(c.var.base),
  });
});

routesCommande.get("/commande.csv", exigerSession, async (c) => {
  const lignes = await listeACommander(c.var.base);
  const quantites = lireQuantites(c, lignes);
  const contenu = versCsv(
    [
      "Type",
      "Matériau",
      "Couleur",
      "Marque",
      "Diamètre ou épaisseur et format",
      "Fournisseur",
      "Stock actuel",
      "Seuil",
      "Niveau cible",
      "Quantité à commander",
    ],
    lignes.map((l) => [
      libelleType(l.type),
      l.materiau,
      l.couleur,
      l.marque,
      specification(l),
      l.fournisseur,
      l.stock,
      l.seuil,
      l.cible,
      quantites.get(l.id) ?? l.suggestion,
    ]),
  );
  return reponseCsv(`a-commander-fablab-${jourDeParis(c.var.maintenant)}.csv`, contenu);
});
