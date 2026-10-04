// Table machine.

import type { Base } from "./base";

export type TypeMatiere = "filament" | "plaque";

export interface Machine {
  id: number;
  nom: string;
  type: TypeMatiere;
  actif: boolean;
}

interface LigneMachine {
  id: number;
  nom: string;
  type: TypeMatiere;
  actif: number;
}

function versMachine(l: LigneMachine): Machine {
  return { id: l.id, nom: l.nom, type: l.type, actif: l.actif === 1 };
}

/** Machines triées par type (filament d'abord) puis par nom, dans l'ordre naturel (Imprimante 2 avant 10). */
export async function listerMachines(base: Base, inclureInactives: boolean): Promise<Machine[]> {
  const lignes = await base.tous<LigneMachine>(
    inclureInactives
      ? "SELECT id, nom, type, actif FROM machine"
      : "SELECT id, nom, type, actif FROM machine WHERE actif = 1",
  );
  return lignes
    .map(versMachine)
    .sort(
      (a, b) =>
        a.type.localeCompare(b.type) || a.nom.localeCompare(b.nom, "fr", { sensitivity: "base", numeric: true }),
    );
}

export async function lireMachine(base: Base, id: number): Promise<Machine | null> {
  const ligne = await base.premier<LigneMachine>("SELECT id, nom, type, actif FROM machine WHERE id = ?", [id]);
  return ligne ? versMachine(ligne) : null;
}

export async function creerMachine(base: Base, nom: string, type: TypeMatiere): Promise<Machine> {
  const { dernierId } = await base.executer("INSERT INTO machine (nom, type) VALUES (?, ?)", [nom, type]);
  if (dernierId === null) throw new Error("Machine non créée");
  return { id: dernierId, nom, type, actif: true };
}

export async function modifierMachine(base: Base, m: Machine): Promise<void> {
  await base.executer("UPDATE machine SET nom = ?, type = ?, actif = ? WHERE id = ?", [
    m.nom,
    m.type,
    m.actif ? 1 : 0,
    m.id,
  ]);
}

/** Vrai si au moins un mouvement a été enregistré avec cette machine. */
export async function machineUtilisee(base: Base, id: number): Promise<boolean> {
  const ligne = await base.premier<{ n: number }>("SELECT COUNT(*) AS n FROM movement WHERE machine_id = ?", [id]);
  return (ligne?.n ?? 0) > 0;
}
