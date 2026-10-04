// Couche d'accès aux données : contrat commun à toutes les bases.
//
// Le reste de l'application ne connaît que cette interface. Pour migrer vers un
// Raspberry avec SQLite, il suffira d'écrire un second adaptateur (comme d1.ts)
// sans toucher aux requêtes ni aux règles de gestion.

export type Parametre = string | number | null;

export interface Instruction {
  sql: string;
  parametres?: Parametre[];
}

export interface ResultatEcriture {
  lignesModifiees: number;
  dernierId: number | null;
}

export interface Base {
  /** Toutes les lignes d'une requête de lecture. */
  tous<T>(sql: string, parametres?: Parametre[]): Promise<T[]>;
  /** Première ligne, ou null si la requête ne renvoie rien. */
  premier<T>(sql: string, parametres?: Parametre[]): Promise<T | null>;
  /** Requête d'écriture (INSERT, UPDATE). */
  executer(sql: string, parametres?: Parametre[]): Promise<ResultatEcriture>;
  /** Plusieurs écritures dans une même transaction : tout passe ou rien ne passe. */
  lot(instructions: Instruction[]): Promise<ResultatEcriture[]>;
}
