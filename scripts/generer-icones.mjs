// Génère les icônes de l'application (PNG) dans public/icones, sans aucune
// dépendance : le dessin est calculé point par point, puis encodé en PNG.
// Motif : une bobine vue de face, aux couleurs de la charte.
// À relancer uniquement si l'icône change : les fichiers produits sont versionnés.

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const ACIER = [0x4a, 0x53, 0x5a];
const ENCRE = [0x1f, 0x1b, 0x16];
const PAPIER = [0xff, 0xfd, 0xf6];
const PLANCHE = [0xa9, 0x82, 0x4c];

// Disques concentriques, du plus grand au plus petit, en fraction de la largeur.
// Tout tient dans le cercle central de 80 % : l'icône peut être rognée (« maskable »).
const DISQUES = [
  [0.37, ENCRE],
  [0.335, PAPIER],
  [0.25, ENCRE],
  [0.215, PLANCHE],
  [0.085, ENCRE],
  [0.05, PAPIER],
];

function couleur(x, y) {
  const distance = Math.hypot(x - 0.5, y - 0.5);
  let resultat = ACIER;
  for (const [rayon, teinte] of DISQUES) if (distance <= rayon) resultat = teinte;
  return resultat;
}

const TABLE_CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(octets) {
  let c = 0xffffffff;
  for (const o of octets) c = TABLE_CRC[(c ^ o) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function bloc(type, donnees) {
  const longueur = Buffer.alloc(4);
  longueur.writeUInt32BE(donnees.length);
  const corps = Buffer.concat([Buffer.from(type, "ascii"), donnees]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(corps));
  return Buffer.concat([longueur, corps, crc]);
}

function png(taille) {
  const SUR = 4; // suréchantillonnage 4 × 4 pour des bords lisses
  const lignes = Buffer.alloc(taille * (1 + taille * 3));
  for (let y = 0; y < taille; y++) {
    const debut = y * (1 + taille * 3);
    lignes[debut] = 0; // filtre PNG : aucun
    for (let x = 0; x < taille; x++) {
      const somme = [0, 0, 0];
      for (let sy = 0; sy < SUR; sy++) {
        for (let sx = 0; sx < SUR; sx++) {
          const c = couleur((x + (sx + 0.5) / SUR) / taille, (y + (sy + 0.5) / SUR) / taille);
          somme[0] += c[0];
          somme[1] += c[1];
          somme[2] += c[2];
        }
      }
      for (let i = 0; i < 3; i++) lignes[debut + 1 + x * 3 + i] = Math.round(somme[i] / (SUR * SUR));
    }
  }
  const entete = Buffer.alloc(13);
  entete.writeUInt32BE(taille, 0);
  entete.writeUInt32BE(taille, 4);
  entete[8] = 8; // 8 bits par canal
  entete[9] = 2; // couleurs RVB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    bloc("IHDR", entete),
    bloc("IDAT", deflateSync(lignes, { level: 9 })),
    bloc("IEND", Buffer.alloc(0)),
  ]);
}

const hex = (c) => `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" fill="${hex(ACIER)}"/>
${DISQUES.map(([rayon, teinte]) => `  <circle cx="50" cy="50" r="${rayon * 100}" fill="${hex(teinte)}"/>`).join("\n")}
</svg>
`;

const dossier = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "icones");
mkdirSync(dossier, { recursive: true });
for (const taille of [180, 192, 512]) {
  const fichier = `icone-${taille}.png`;
  writeFileSync(join(dossier, fichier), png(taille));
  console.log(`Écrit : ${fichier}`);
}
writeFileSync(join(dossier, "icone.svg"), svg);
console.log("Écrit : icone.svg");
