import type { D1Migration } from "cloudflare:test";

declare global {
  namespace Cloudflare {
    interface Env {
      MIGRATIONS_TEST: D1Migration[];
      FEUILLE_DE_STYLE: string;
      INTERFACE: {
        fichiers: string[];
        pages: { index: string; etat: string };
        application: string;
        manifeste: string;
        entetes: string;
        icones: Record<string, { signature: boolean; largeur: number; hauteur: number }>;
      };
    }
  }
}
