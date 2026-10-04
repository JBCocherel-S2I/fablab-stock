// Les tests s'exécutent dans le moteur Workers, avec une vraie base SQLite locale
// (la même que D1), sur laquelle les migrations du dossier migrations/ sont appliquées.

import { readFileSync, readdirSync } from "node:fs";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

/** Chemins de tous les fichiers de l'interface, par exemple "/styles/base.css". */
function fichiersPublics(dossier = "./public", prefixe = ""): string[] {
  return readdirSync(dossier, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? fichiersPublics(`${dossier}/${e.name}`, `${prefixe}/${e.name}`) : [`${prefixe}/${e.name}`],
  );
}

/** Largeur et hauteur d'un PNG, lues dans son en-tête. */
function dimensionsPng(chemin: string): { signature: boolean; largeur: number; hauteur: number } {
  const octets = readFileSync(chemin);
  return {
    signature: octets.subarray(0, 8).toString("hex") === "89504e470d0a1a0a",
    largeur: octets.readUInt32BE(16),
    hauteur: octets.readUInt32BE(20),
  };
}

export default defineConfig(async () => {
  const migrations = await readD1Migrations("./migrations");
  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: "./wrangler.jsonc" },
        miniflare: {
          bindings: {
            MIGRATIONS_TEST: migrations,
            // Feuille de style réelle, pour vérifier les contrastes de la palette.
            FEUILLE_DE_STYLE: readFileSync("./public/styles/base.css", "utf8"),
            // Fichiers de l'interface, pour vérifier la PWA et les finitions.
            INTERFACE: {
              fichiers: fichiersPublics(),
              pages: {
                index: readFileSync("./public/index.html", "utf8"),
                etat: readFileSync("./public/etat.html", "utf8"),
              },
              application: readFileSync("./public/styles/application.css", "utf8"),
              manifeste: readFileSync("./public/manifest.webmanifest", "utf8"),
              entetes: readFileSync("./public/_headers", "utf8"),
              icones: Object.fromEntries(
                [180, 192, 512].map((t) => [`/icones/icone-${t}.png`, dimensionsPng(`./public/icones/icone-${t}.png`)]),
              ),
            },
          },
        },
      }),
    ],
    test: {
      include: ["tests/**/*.test.ts"],
      setupFiles: ["./tests/preparation.ts"],
    },
  };
});
