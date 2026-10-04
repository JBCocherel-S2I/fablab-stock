// Aides pour tester l'API comme le ferait un navigateur : horloge réglable et
// client qui conserve son cookie de session.

import { env } from "cloudflare:workers";
import { creerApp } from "../src/app";
import { baseDeTest } from "./outils";

export const CODE_GESTIONNAIRE_INITIAL = "atelier-initial-2026";
export const CODE_COMMUN = "fablab-2026";

const MINUTE = 60_000;
export const MINUTES = (n: number) => n * MINUTE;
export const JOURS = (n: number) => n * 24 * 60 * MINUTE;

export interface Reponse {
  statut: number;
  corps: Record<string, any>;
  cookie: string | null;
  /** Corps brut et en-têtes, pour les réponses qui ne sont pas du JSON (export CSV). */
  texte: string;
  entetes: Headers;
}

export type Client = (methode: string, chemin: string, corps?: unknown, entetes?: Record<string, string>) => Promise<Reponse>;

export function creerBanc(options: { secretInitial?: string | null } = {}) {
  let instant = Date.parse("2026-10-05T08:00:00.000Z");
  const app = creerApp(() => new Date(instant));
  const secret = options.secretInitial === undefined ? CODE_GESTIONNAIRE_INITIAL : options.secretInitial;
  // Hachage allégé pour des tests rapides ; le coût réel est mesuré à part.
  // Le secret est toujours fixé ici, pour ne pas dépendre du fichier .dev.vars local.
  const environnement = {
    ...env,
    ITERATIONS_HACHAGE: "1000",
    CODE_GESTIONNAIRE_INITIAL: secret ?? undefined,
  };

  function client(ip = "192.0.2.1", origineUrl = "http://localhost"): Client {
    let cookie = "";
    return async (methode, chemin, corps, entetes = {}) => {
      const reponse = await app.request(
        origineUrl + chemin,
        {
          method: methode,
          headers: {
            "cf-connecting-ip": ip,
            ...(methode === "GET" ? {} : { "content-type": "application/json" }),
            ...(cookie ? { cookie } : {}),
            ...entetes,
          },
          body: methode === "GET" ? undefined : JSON.stringify(corps ?? {}),
        },
        environnement,
      );
      const pose = reponse.headers.get("set-cookie");
      if (pose) {
        const paire = pose.split(";")[0]!;
        cookie = /Max-Age=0/i.test(pose) ? "" : paire;
      }
      // Décodage sans retirer le BOM, pour pouvoir vérifier sa présence dans les exports.
      const texte = new TextDecoder("utf-8", { ignoreBOM: true, fatal: false }).decode(await reponse.arrayBuffer());
      const estJson = (reponse.headers.get("content-type") ?? "").includes("application/json");
      return {
        statut: reponse.status,
        corps: estJson ? (JSON.parse(texte) as Record<string, any>) : {},
        cookie: pose,
        texte,
        entetes: reponse.headers,
      };
    };
  }

  return {
    client,
    avancer(ms: number) {
      instant += ms;
    },
    /** Client déjà en mode gestionnaire. */
    async gestionnaire(ip = "192.0.2.100"): Promise<Client> {
      const c = client(ip);
      const r = await c("POST", "/api/acces/gestionnaire", { code: CODE_GESTIONNAIRE_INITIAL });
      if (r.statut !== 200) throw new Error(`Mode gestionnaire refusé : ${JSON.stringify(r.corps)}`);
      return c;
    },
    /** Définit le code commun et renvoie un client entré avec ce code. */
    async enseignant(ip = "192.0.2.50"): Promise<Client> {
      const g = await this.gestionnaire();
      await g("PUT", "/api/acces/code-commun", { nouveau: CODE_COMMUN });
      const c = client(ip);
      const r = await c("POST", "/api/acces/entrer", { code: CODE_COMMUN });
      if (r.statut !== 200) throw new Error(`Entrée refusée : ${JSON.stringify(r.corps)}`);
      return c;
    },
  };
}

/** Remet à zéro les tables d'accès entre deux tests. */
export async function viderAcces(): Promise<void> {
  const base = baseDeTest();
  await base.lot([
    { sql: "DELETE FROM session" },
    { sql: "DELETE FROM tentative" },
    { sql: "DELETE FROM settings" },
  ]);
}
