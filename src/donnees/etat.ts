// Vérification de l'état de la base : les tables attendues sont-elles présentes ?

import type { Base } from "./base";

export const TABLES_ATTENDUES = [
  "machine",
  "material",
  "movement",
  "session",
  "settings",
  "teacher",
  "tentative",
] as const;

export interface EtatBase {
  accessible: boolean;
  tables: string[];
  manquantes: string[];
}

export async function lireEtatBase(base: Base): Promise<EtatBase> {
  try {
    const lignes = await base.tous<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
    );
    const presentes = new Set(lignes.map((l) => l.name));
    return {
      accessible: true,
      tables: TABLES_ATTENDUES.filter((t) => presentes.has(t)),
      manquantes: TABLES_ATTENDUES.filter((t) => !presentes.has(t)),
    };
  } catch {
    return { accessible: false, tables: [], manquantes: [...TABLES_ATTENDUES] };
  }
}
