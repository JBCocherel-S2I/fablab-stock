// Lecture de l'historique des mouvements, avec filtres (5.5).

import type { Base, Parametre } from "./base";
import type { TypeMatiere } from "./machines";
import type { Nature } from "./mouvements";

export interface FiltresHistorique {
  /** Bornes en UTC, ISO 8601 : depuis inclus, jusqu'à exclu. */
  depuis?: string;
  jusqua?: string;
  enseignantId?: number;
  referenceId?: number;
  machineId?: number;
  nature?: Nature;
  /** Texte contenu dans le projet ou la classe. */
  projet?: string;
}

export interface LigneHistorique {
  id: number;
  cree_le: string;
  nature: Nature;
  quantite: number;
  delta: number;
  projet: string | null;
  commentaire: string | null;
  mouvement_annule_id: number | null;
  material_id: number;
  teacher_id: number;
  machine_id: number | null;
  enseignant: string;
  machine: string | null;
  type: TypeMatiere;
  materiau: string;
  couleur: string;
  teinte: string;
  diametre_mm: number | null;
  epaisseur_mm: number | null;
  longueur_mm: number | null;
  largeur_mm: number | null;
  reference_active: number;
  /** Identifiant de l'annulation de ce mouvement, s'il a été annulé. */
  annule_par: number | null;
  /** Dernier mouvement enregistré sur la même référence. */
  dernier_id: number;
}

function conditions(f: FiltresHistorique): { sql: string; parametres: Parametre[] } {
  const clauses: string[] = [];
  const parametres: Parametre[] = [];
  const ajouter = (clause: string, valeur: Parametre | undefined) => {
    if (valeur === undefined) return;
    clauses.push(clause);
    parametres.push(valeur);
  };
  ajouter("v.cree_le >= ?", f.depuis);
  ajouter("v.cree_le < ?", f.jusqua);
  ajouter("v.teacher_id = ?", f.enseignantId);
  ajouter("v.material_id = ?", f.referenceId);
  ajouter("v.machine_id = ?", f.machineId);
  ajouter("v.nature = ?", f.nature);
  if (f.projet) {
    // Les caractères spéciaux de LIKE sont neutralisés : la recherche porte sur le texte tel quel.
    const motif = f.projet.replace(/[\\%_]/g, (c) => `\\${c}`);
    ajouter("v.projet LIKE ? ESCAPE '\\'", `%${motif}%`);
  }
  return { sql: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "", parametres };
}

/** Mouvements du plus récent au plus ancien. */
export async function listerHistorique(base: Base, filtres: FiltresHistorique, limite: number): Promise<LigneHistorique[]> {
  const { sql, parametres } = conditions(filtres);
  return base.tous<LigneHistorique>(
    `SELECT v.id, v.cree_le, v.nature, v.quantite, v.delta, v.projet, v.commentaire, v.mouvement_annule_id,
            v.material_id, v.teacher_id, v.machine_id,
            t.nom AS enseignant, k.nom AS machine,
            m.type, m.materiau, m.couleur, m.teinte, m.diametre_mm, m.epaisseur_mm, m.longueur_mm, m.largeur_mm,
            m.actif AS reference_active,
            (SELECT a.id FROM movement a WHERE a.mouvement_annule_id = v.id) AS annule_par,
            (SELECT MAX(d.id) FROM movement d WHERE d.material_id = v.material_id) AS dernier_id
       FROM movement v
       JOIN teacher t ON t.id = v.teacher_id
       JOIN material m ON m.id = v.material_id
       LEFT JOIN machine k ON k.id = v.machine_id
       ${sql}
      ORDER BY v.id DESC
      LIMIT ?`,
    [...parametres, limite],
  );
}

export async function compterHistorique(base: Base, filtres: FiltresHistorique): Promise<number> {
  const { sql, parametres } = conditions(filtres);
  const ligne = await base.premier<{ n: number }>(`SELECT COUNT(*) AS n FROM movement v ${sql}`, parametres);
  return ligne?.n ?? 0;
}
