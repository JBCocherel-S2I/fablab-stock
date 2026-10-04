// Copie la police Atkinson Hyperlegible (licence SIL OFL) depuis node_modules vers
// public/polices, pour qu'elle soit hébergée avec l'application, sans service externe.
// À relancer uniquement si la police est mise à jour : les fichiers copiés sont versionnés.

import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const racine = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(racine, "node_modules", "@fontsource", "atkinson-hyperlegible");
const cible = join(racine, "public", "polices");

mkdirSync(cible, { recursive: true });
for (const graisse of ["400", "700"]) {
  const fichier = `atkinson-hyperlegible-latin-${graisse}-normal.woff2`;
  copyFileSync(join(source, "files", fichier), join(cible, fichier));
  console.log(`Copié : ${fichier}`);
}
copyFileSync(join(source, "LICENSE"), join(cible, "LICENCE-OFL.txt"));
console.log("Copié : LICENCE-OFL.txt");
