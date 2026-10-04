// Export CSV pour Excel en version française : UTF-8 avec BOM, séparateur
// point-virgule, fins de ligne CRLF (spécifications, 5.5 et 5.6).

const BOM = "﻿";

function cellule(valeur: string | number | null): string {
  if (valeur === null) return "";
  if (typeof valeur === "number") return String(valeur);
  // Un texte commençant par = + - ou @ serait pris pour une formule par le tableur.
  const texte = /^[=+\-@\t\r]/.test(valeur) ? `'${valeur}` : valeur;
  return /[";\r\n]/.test(texte) ? `"${texte.replaceAll('"', '""')}"` : texte;
}

export function versCsv(entetes: string[], lignes: (string | number | null)[][]): string {
  return BOM + [entetes, ...lignes].map((l) => l.map(cellule).join(";")).join("\r\n") + "\r\n";
}

export function reponseCsv(nomFichier: string, contenu: string): Response {
  return new Response(contenu, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nomFichier}"`,
      "Cache-Control": "no-store",
    },
  });
}
