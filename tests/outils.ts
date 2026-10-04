// Aides partagées par les tests : base de test et jeux de données minimaux.

import { env } from "cloudflare:workers";
import type { Base, Parametre } from "../src/donnees/base";
import { baseD1 } from "../src/donnees/d1";

export function baseDeTest(): Base {
  return baseD1(env.DB);
}

async function inserer(base: Base, sql: string, parametres: Parametre[]): Promise<number> {
  const { dernierId } = await base.executer(sql, parametres);
  if (dernierId === null) throw new Error("Insertion sans identifiant");
  return dernierId;
}

export function creerEnseignant(base: Base, nom = "Dupont"): Promise<number> {
  return inserer(base, "INSERT INTO teacher (nom) VALUES (?)", [nom]);
}

export function creerMachine(base: Base, nom = "Imprimante 1", type = "filament"): Promise<number> {
  return inserer(base, "INSERT INTO machine (nom, type) VALUES (?, ?)", [nom, type]);
}

export function creerFilament(base: Base, seuil = 2, cible = 6): Promise<number> {
  return inserer(
    base,
    `INSERT INTO material (type, materiau, couleur, teinte, diametre_mm, seuil, cible)
     VALUES ('filament', 'PLA', 'Noir', '#2A2D34', 1.75, ?, ?)`,
    [seuil, cible],
  );
}

export function creerPlaque(base: Base, seuil = 3, cible = 10): Promise<number> {
  return inserer(
    base,
    `INSERT INTO material (type, materiau, couleur, teinte, epaisseur_mm, longueur_mm, largeur_mm, seuil, cible)
     VALUES ('plaque', 'Contreplaqué', '', '#C9A36B', 3, 600, 400, ?, ?)`,
    [seuil, cible],
  );
}

export interface MouvementDeTest {
  material_id: number;
  nature: string;
  quantite: number;
  delta: number;
  teacher_id: number;
  machine_id?: number | null;
  projet?: string | null;
  commentaire?: string | null;
  mouvement_annule_id?: number | null;
}

/** Insertion directe en SQL, pour tester les contraintes du schéma. */
export function insererMouvement(base: Base, m: MouvementDeTest): Promise<number> {
  return inserer(
    base,
    `INSERT INTO movement
       (cree_le, material_id, nature, quantite, delta, teacher_id, machine_id, projet, commentaire, mouvement_annule_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      "2026-10-03T08:00:00.000Z",
      m.material_id,
      m.nature,
      m.quantite,
      m.delta,
      m.teacher_id,
      m.machine_id ?? null,
      m.projet ?? null,
      m.commentaire ?? null,
      m.mouvement_annule_id ?? null,
    ],
  );
}
