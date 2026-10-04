// Bloc 1 : route d'état, heure de Paris et contrastes de la palette.

import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { contraste } from "../src/commun/contraste";
import { enHeureDeParis, horodatage } from "../src/commun/heure";
import app from "../src/index";

describe("GET /api/etat", () => {
  it("répond 200 avec une base complète", async () => {
    const reponse = await app.request("/api/etat", {}, env);
    expect(reponse.status).toBe(200);
    const corps = (await reponse.json()) as {
      ok: boolean;
      base: { accessible: boolean; manquantes: string[] };
      heureServeur: string;
    };
    expect(corps.ok).toBe(true);
    expect(corps.base.accessible).toBe(true);
    expect(corps.base.manquantes).toEqual([]);
    expect(Number.isNaN(Date.parse(corps.heureServeur))).toBe(false);
  });

  it("répond 404 en JSON pour une route inconnue", async () => {
    const reponse = await app.request("/api/inconnue", {}, env);
    expect(reponse.status).toBe(404);
  });
});

describe("règle 6 : heure serveur en UTC, affichée en heure de Paris", () => {
  it("enregistre en UTC au format ISO 8601", () => {
    expect(horodatage(new Date(Date.UTC(2026, 9, 3, 16, 42, 0)))).toBe("2026-10-03T16:42:00.000Z");
  });

  it("affiche l'heure d'été (UTC+2)", () => {
    expect(enHeureDeParis("2026-07-14T10:00:00.000Z")).toBe("14/07/2026 12:00");
  });

  it("affiche l'heure d'hiver (UTC+1)", () => {
    expect(enHeureDeParis("2026-01-15T10:00:00.000Z")).toBe("15/01/2026 11:00");
  });

  it("change de jour autour de minuit", () => {
    expect(enHeureDeParis("2026-12-31T23:30:00.000Z")).toBe("01/01/2027 00:30");
  });
});

describe("contrastes WCAG AA de la palette (7.1)", () => {
  const couleurs = Object.fromEntries(
    [...env.FEUILLE_DE_STYLE.matchAll(/--([a-z-]+):\s*(#[0-9A-Fa-f]{6})\s*;/g)].map((m) => [m[1], m[2]]),
  ) as Record<string, string>;

  it("la feuille de style reprend les valeurs de la maquette", () => {
    expect(couleurs).toMatchObject({
      bois: "#E8D6B1",
      acier: "#4A535A",
      encre: "#1F1B16",
      "texte-secondaire": "#5A5148",
      papier: "#FFFDF6",
      casier: "#F6EBD3",
      planche: "#A9824C",
      brique: "#B3361F",
    });
  });

  it("le calcul de contraste est correct sur les valeurs de référence", () => {
    expect(contraste("#000000", "#FFFFFF")).toBeCloseTo(21, 5);
    expect(contraste("#777777", "#FFFFFF")).toBeCloseTo(4.48, 2);
  });

  // Texte courant : rapport d'au moins 4,5.
  const pairesTexte: [string, string][] = [
    ["encre", "bois"],
    ["encre", "casier"],
    ["encre", "papier"],
    ["texte-secondaire", "bois"],
    ["texte-secondaire", "casier"],
    ["texte-secondaire", "papier"],
    ["papier", "acier"],
    ["papier", "brique"],
    ["brique", "papier"],
    ["brique", "casier"],
  ];
  it.each(pairesTexte)("texte %s sur fond %s : au moins 4,5", (texte, fond) => {
    expect(contraste(couleurs[texte]!, couleurs[fond]!)).toBeGreaterThanOrEqual(4.5);
  });

  // Brique sur bois : 4,24, insuffisant pour du texte courant. Cette combinaison
  // n'est autorisée que pour du grand texte gras (au moins 18,66 px gras, seuil 3).
  it("brique sur bois : réservé au grand texte gras", () => {
    const rapport = contraste(couleurs.brique!, couleurs.bois!);
    expect(rapport).toBeGreaterThanOrEqual(3);
    expect(rapport).toBeLessThan(4.5);
  });

  // Contours et éléments graphiques porteurs d'information : au moins 3.
  const pairesGraphiques: [string, string][] = [
    ["encre", "bois"],
    ["brique", "bois"],
    ["brique", "casier"],
    ["acier", "bois"],
  ];
  it.each(pairesGraphiques)("élément graphique %s sur fond %s : au moins 3", (trait, fond) => {
    expect(contraste(couleurs[trait]!, couleurs[fond]!)).toBeGreaterThanOrEqual(3);
  });
});
