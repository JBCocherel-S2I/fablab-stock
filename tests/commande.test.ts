// Bloc 6 : liste à commander et export CSV (5.6).

import { beforeEach, describe, expect, it } from "vitest";
import { creerBanc, viderAcces, type Client } from "./client";

beforeEach(viderAcces);

let compteur = 0;
const unique = (prefixe: string) => `${prefixe}-${++compteur}`;

/** La base de test est partagée : chaque test ne regarde que les références qu'il a créées. */
async function atelier() {
  const banc = creerBanc();
  const e = await banc.enseignant();
  const g = await banc.gestionnaire();
  const creer = async (chemin: string, corps: unknown, cle: string) => {
    const r = await g("POST", `/api/administration/${chemin}`, corps);
    expect(r.statut, JSON.stringify(r.corps)).toBe(201);
    return r.corps[cle];
  };
  const dupont = await creer("enseignants", { nom: unique("Dupont") }, "enseignant");
  const imprimante = await creer("machines", { nom: unique("Imprimante"), type: "filament" }, "machine");
  const prefixe = unique("Cmd");
  const mes: number[] = [];

  const reference = async (corps: Record<string, unknown>, stock: number) => {
    const r = await creer("references", corps, "reference");
    mes.push(r.id);
    if (stock > 0) {
      const entree = await e("POST", "/api/mouvements/entree", { material_id: r.id, teacher_id: dupont.id, quantite: stock });
      expect(entree.statut).toBe(201);
    }
    return r;
  };
  const filament = (couleur: string, seuil: number, cible: number, stock: number, surcharge: Record<string, unknown> = {}) =>
    reference(
      { type: "filament", materiau: `${prefixe} PLA`, couleur, teinte: "#C9402D", diametre_mm: 1.75, seuil, cible, ...surcharge },
      stock,
    );
  const plaque = (couleur: string, seuil: number, cible: number, stock: number, surcharge: Record<string, unknown> = {}) =>
    reference(
      { type: "plaque", materiau: `${prefixe} PMMA`, couleur, teinte: "#CFE6EE", epaisseur_mm: 2.5, longueur_mm: 600, largeur_mm: 400, seuil, cible, ...surcharge },
      stock,
    );

  return {
    banc, e, g, dupont, imprimante, prefixe, filament, plaque,
    commande: async (client: Client = e) => {
      const r = await client("GET", "/api/commande");
      return {
        etabliLe: r.corps.etabliLe as string,
        lignes: (r.corps.lignes as any[]).filter((l) => mes.includes(l.id)),
      };
    },
    /** Lignes du CSV qui concernent ce test, sans l'en-tête. */
    csv: async (requete = "") => {
      const r = await e("GET", `/api/commande.csv${requete}`);
      return { reponse: r, lignes: r.texte.slice(1).split("\r\n").filter((l) => l.includes(prefixe)) };
    },
  };
}

describe("liste à commander", () => {
  it("exige une session", async () => {
    const anonyme = creerBanc().client();
    expect((await anonyme("GET", "/api/commande")).statut).toBe(401);
    expect((await anonyme("GET", "/api/commande.csv")).statut).toBe(401);
  });

  it("contient les références actives dont le stock est inférieur ou égal au seuil", async () => {
    const a = await atelier();
    const sous = await a.filament("Sous le seuil", 2, 6, 1);
    const egal = await a.filament("Au seuil", 2, 6, 2);
    await a.filament("Au-dessus", 2, 6, 3);
    const vide = await a.plaque("Vide", 3, 10, 0);
    const inactive = await a.filament("Désactivée", 2, 6, 0);
    await a.g("PATCH", `/api/administration/references/${inactive.id}`, { actif: false });

    const { lignes, etabliLe } = await a.commande();
    expect(etabliLe).toBe("05/10/2026");
    expect(lignes.map((l: any) => l.id).sort()).toEqual([sous.id, egal.id, vide.id].sort());
  });

  it("suggère le niveau cible moins le stock actuel", async () => {
    const a = await atelier();
    const rouge = await a.filament("Rouge", 2, 6, 2);
    const clair = await a.plaque("Clair", 3, 10, 2);
    const plein = await a.filament("Cible égale au seuil", 4, 4, 4);
    const { lignes } = await a.commande();
    const suggestion = (id: number) => lignes.find((l: any) => l.id === id);
    expect(suggestion(rouge.id)).toMatchObject({ stock: 2, seuil: 2, cible: 6, suggestion: 4 });
    expect(suggestion(clair.id)).toMatchObject({ stock: 2, seuil: 3, cible: 10, suggestion: 8 });
    expect(suggestion(plein.id)).toMatchObject({ stock: 4, seuil: 4, cible: 4, suggestion: 0 });
  });

  it("suit les mouvements : une référence entre dans la liste puis en sort", async () => {
    const a = await atelier();
    const r = await a.filament("Suivi", 2, 6, 3);
    const presente = async () => (await a.commande()).lignes.some((l: any) => l.id === r.id);
    expect(await presente()).toBe(false);
    await a.e("POST", "/api/mouvements/prelevement", {
      material_id: r.id, teacher_id: a.dupont.id, quantite: 1, machine_id: a.imprimante.id, projet: "Terminale STI2D",
    });
    expect(await presente()).toBe(true);
    await a.e("POST", "/api/mouvements/entree", { material_id: r.id, teacher_id: a.dupont.id, quantite: 4 });
    expect(await presente()).toBe(false);
  });

  it("est la même pour un enseignant et pour le gestionnaire", async () => {
    const a = await atelier();
    await a.filament("Commun", 2, 6, 1);
    expect((await a.commande(a.g)).lignes).toEqual((await a.commande(a.e)).lignes);
  });
});

describe("export CSV", () => {
  const ENTETE = "Type;Matériau;Couleur;Marque;Diamètre ou épaisseur et format;Fournisseur;Stock actuel;Seuil;Niveau cible;Quantité à commander";

  it("a le format attendu par Excel en français et les colonnes de la spécification", async () => {
    const a = await atelier();
    await a.filament("Rouge", 2, 6, 2, { marque: "Marque A", fournisseur: "Fournisseur A" });
    await a.plaque("Clair", 3, 10, 2, { fournisseur: "Fournisseur B; dépôt" });

    const { reponse, lignes } = await a.csv();
    expect(reponse.statut).toBe(200);
    expect(reponse.entetes.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(reponse.entetes.get("content-disposition")).toBe('attachment; filename="a-commander-fablab-2026-10-05.csv"');
    expect(reponse.texte.charCodeAt(0)).toBe(0xfeff);
    expect(reponse.texte.slice(1).split("\r\n")[0]).toBe(ENTETE);
    expect(reponse.texte.endsWith("\r\n")).toBe(true);
    expect(lignes).toEqual([
      `Filament;${a.prefixe} PLA;Rouge;Marque A;1,75 mm;Fournisseur A;2;2;6;4`,
      `Plaque;${a.prefixe} PMMA;Clair;;2,5 mm · 600 × 400;"Fournisseur B; dépôt";2;3;10;8`,
    ]);
  });

  it("reprend les quantités modifiées à l'écran, sans rien enregistrer", async () => {
    const a = await atelier();
    const rouge = await a.filament("Rouge", 2, 6, 2);
    const clair = await a.plaque("Clair", 3, 10, 2);

    const { lignes } = await a.csv(`?quantites=${rouge.id}:10,${clair.id}:0`);
    expect(lignes.map((l) => l.split(";").at(-1))).toEqual(["10", "0"]);

    // Les données n'ont pas bougé : même suggestion, même stock.
    const apres = (await a.commande()).lignes;
    expect(apres.find((l: any) => l.id === rouge.id)).toMatchObject({ stock: 2, cible: 6, suggestion: 4 });
    expect((await a.csv()).lignes.map((l) => l.split(";").at(-1))).toEqual(["4", "8"]);
  });

  it("ne modifie que les lignes indiquées", async () => {
    const a = await atelier();
    const rouge = await a.filament("Rouge", 2, 6, 2);
    await a.plaque("Clair", 3, 10, 2);
    const { lignes } = await a.csv(`?quantites=${rouge.id}:1`);
    expect(lignes.map((l) => l.split(";").at(-1))).toEqual(["1", "8"]);
  });

  it("refuse des quantités invalides ou une référence hors liste", async () => {
    const a = await atelier();
    const rouge = await a.filament("Rouge", 2, 6, 2);
    const auDessus = await a.filament("Au-dessus", 2, 6, 5);
    for (const quantites of [`${rouge.id}:-1`, `${rouge.id}:abc`, `${rouge.id}:1.5`, `${rouge.id}:10000`, `${rouge.id}`, `${auDessus.id}:3`, "999999:3"]) {
      const r = await a.e("GET", `/api/commande.csv?quantites=${encodeURIComponent(quantites)}`);
      expect(r.statut, quantites).toBe(400);
      expect(r.corps.code).toBe("QUANTITE_INVALIDE");
    }
  });
});
