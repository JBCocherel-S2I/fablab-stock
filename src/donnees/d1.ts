// Adaptateur Cloudflare D1 de la couche d'accès aux données.
// C'est le seul fichier qui connaît l'API D1.

import type { Base, Instruction, Parametre, ResultatEcriture } from "./base";

function preparer(d1: D1Database, sql: string, parametres: Parametre[] = []): D1PreparedStatement {
  return d1.prepare(sql).bind(...parametres);
}

function versResultat(meta: D1Meta): ResultatEcriture {
  return {
    lignesModifiees: meta.changes,
    dernierId: meta.last_row_id ?? null,
  };
}

export function baseD1(d1: D1Database): Base {
  return {
    async tous<T>(sql: string, parametres?: Parametre[]) {
      const { results } = await preparer(d1, sql, parametres).all<T>();
      return results;
    },
    async premier<T>(sql: string, parametres?: Parametre[]) {
      return preparer(d1, sql, parametres).first<T>();
    },
    async executer(sql: string, parametres?: Parametre[]) {
      const { meta } = await preparer(d1, sql, parametres).run();
      return versResultat(meta);
    },
    async lot(instructions: Instruction[]) {
      const resultats = await d1.batch(
        instructions.map((i) => preparer(d1, i.sql, i.parametres)),
      );
      return resultats.map((r) => versResultat(r.meta));
    },
  };
}
