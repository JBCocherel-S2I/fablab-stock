// Table teacher : liste des enseignants.

import type { Base } from "./base";

export interface Enseignant {
  id: number;
  nom: string;
  actif: boolean;
}

interface LigneEnseignant {
  id: number;
  nom: string;
  actif: number;
}

function versEnseignant(l: LigneEnseignant): Enseignant {
  return { id: l.id, nom: l.nom, actif: l.actif === 1 };
}

/** Tous les enseignants, triés par nom selon l'ordre alphabétique français. */
export async function listerEnseignants(base: Base, inclureInactifs: boolean): Promise<Enseignant[]> {
  const lignes = await base.tous<LigneEnseignant>(
    inclureInactifs
      ? "SELECT id, nom, actif FROM teacher"
      : "SELECT id, nom, actif FROM teacher WHERE actif = 1",
  );
  return lignes.map(versEnseignant).sort((a, b) => a.nom.localeCompare(b.nom, "fr", { sensitivity: "base" }));
}

export async function lireEnseignant(base: Base, id: number): Promise<Enseignant | null> {
  const ligne = await base.premier<LigneEnseignant>("SELECT id, nom, actif FROM teacher WHERE id = ?", [id]);
  return ligne ? versEnseignant(ligne) : null;
}

export async function creerEnseignant(base: Base, nom: string): Promise<Enseignant> {
  const { dernierId } = await base.executer("INSERT INTO teacher (nom) VALUES (?)", [nom]);
  if (dernierId === null) throw new Error("Enseignant non créé");
  return { id: dernierId, nom, actif: true };
}

export async function modifierEnseignant(base: Base, e: Enseignant): Promise<void> {
  await base.executer("UPDATE teacher SET nom = ?, actif = ? WHERE id = ?", [e.nom, e.actif ? 1 : 0, e.id]);
}
