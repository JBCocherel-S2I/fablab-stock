// Bloc 5 : historique filtré, export CSV, compteur « à commander » (5.2, 5.5, règle 6).

import { beforeEach, describe, expect, it } from "vitest";
import { versCsv } from "../src/commun/csv";
import { debutDuJourDeParis, estJourValide, jourDeParis, jourSuivant } from "../src/commun/heure";
import { JOURS, MINUTES, creerBanc, viderAcces, type Client } from "./client";

beforeEach(viderAcces);

let compteur = 0;
const unique = (prefixe: string) => `${prefixe}-${++compteur}`;
const HEURES = (n: number) => MINUTES(60 * n);

/** Atelier minimal. La base de test est partagée : chaque test filtre sur ses propres références. */
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
  const martin = await creer("enseignants", { nom: unique("Martin") }, "enseignant");
  const imprimante = await creer("machines", { nom: unique("Imprimante"), type: "filament" }, "machine");
  const imprimante2 = await creer("machines", { nom: unique("Imprimante"), type: "filament" }, "machine");
  const laser = await creer("machines", { nom: unique("Laser"), type: "plaque" }, "machine");
  const filament = await creer(
    "references",
    { type: "filament", materiau: unique("PLA"), couleur: "Noir", teinte: "#2A2D34", diametre_mm: 1.75, seuil: 2, cible: 8 },
    "reference",
  );
  const plaque = await creer(
    "references",
    { type: "plaque", materiau: unique("PMMA"), couleur: "Clair", teinte: "#CFE6EE", epaisseur_mm: 2.5, longueur_mm: 600, largeur_mm: 400, seuil: 3, cible: 10 },
    "reference",
  );

  const poster = async (client: Client, chemin: string, corps: Record<string, unknown>) => {
    const r = await client("POST", chemin, corps);
    expect(r.statut, JSON.stringify(r.corps)).toBe(201);
    return r.corps.mouvement.id as number;
  };
  return {
    banc, e, g, dupont, martin, imprimante, imprimante2, laser, filament, plaque,
    entree: (quantite: number, ref = filament.id, surcharge: Record<string, unknown> = {}) =>
      poster(e, "/api/mouvements/entree", { material_id: ref, teacher_id: dupont.id, quantite, ...surcharge }),
    prelever: (quantite: number, surcharge: Record<string, unknown> = {}) =>
      poster(e, "/api/mouvements/prelevement", {
        material_id: filament.id, teacher_id: dupont.id, quantite, machine_id: imprimante.id, projet: "Terminale STI2D", ...surcharge,
      }),
    annuler: (client: Client, id: number) => poster(client, `/api/mouvements/${id}/annulation`, { teacher_id: martin.id, commentaire: "Erreur de saisie" }),
    corriger: (stock_constate: number) =>
      poster(g, "/api/administration/corrections", { material_id: filament.id, teacher_id: dupont.id, stock_constate, commentaire: "Inventaire" }),
    /** Historique limité aux deux références de ce test. */
    historique: async (client: Client, requete = "") => {
      const lire = async (ref: number) => (await client("GET", `/api/historique?reference=${ref}${requete ? `&${requete}` : ""}`)).corps;
      return lire(filament.id);
    },
  };
}

describe("heure de Paris (règle 6)", () => {
  it("un jour à Paris commence à 22 h UTC la veille en été, 23 h UTC en hiver", () => {
    expect(debutDuJourDeParis("2026-07-14").toISOString()).toBe("2026-07-13T22:00:00.000Z");
    expect(debutDuJourDeParis("2026-01-15").toISOString()).toBe("2026-01-14T23:00:00.000Z");
  });

  it("reste juste les jours de changement d'heure", () => {
    // Passage à l'heure d'été le 29 mars 2026, à l'heure d'hiver le 25 octobre 2026.
    expect(debutDuJourDeParis("2026-03-29").toISOString()).toBe("2026-03-28T23:00:00.000Z");
    expect(debutDuJourDeParis("2026-03-30").toISOString()).toBe("2026-03-29T22:00:00.000Z");
    expect(debutDuJourDeParis("2026-10-25").toISOString()).toBe("2026-10-24T22:00:00.000Z");
    expect(debutDuJourDeParis("2026-10-26").toISOString()).toBe("2026-10-25T23:00:00.000Z");
  });

  it("donne le jour calendaire de Paris, pas celui d'UTC", () => {
    expect(jourDeParis(new Date("2026-10-04T22:30:00.000Z"))).toBe("2026-10-05");
    expect(jourDeParis(new Date("2026-12-31T23:30:00.000Z"))).toBe("2027-01-01");
    expect(jourSuivant("2026-12-31")).toBe("2027-01-01");
    expect(jourSuivant("2028-02-28")).toBe("2028-02-29");
  });

  it("reconnaît une date valide", () => {
    expect(estJourValide("2026-10-05")).toBe(true);
    for (const invalide of ["2026-02-30", "2026-13-01", "05/10/2026", "", "2026-1-5"]) {
      expect(estJourValide(invalide)).toBe(false);
    }
  });
});

describe("format CSV", () => {
  it("produit un fichier lisible par Excel en français : BOM, point-virgule, CRLF", () => {
    const csv = versCsv(["A", "B"], [["x", 1], [null, -2]]);
    expect(csv).toBe("﻿A;B\r\nx;1\r\n;-2\r\n");
  });

  it("protège les points-virgules, guillemets et retours à la ligne", () => {
    expect(versCsv(["A"], [['dit "oui"; puis non'], ["ligne 1\nligne 2"]])).toBe(
      '﻿A\r\n"dit ""oui""; puis non"\r\n"ligne 1\nligne 2"\r\n',
    );
  });

  it("neutralise un texte qui serait pris pour une formule, sans toucher aux nombres", () => {
    expect(versCsv(["A", "B"], [["=SOMME(A1)", -3], ["+33", 4], ["@x", 0], ["-test", 1]])).toBe(
      "﻿A;B\r\n'=SOMME(A1);-3\r\n'+33;4\r\n'@x;0\r\n'-test;1\r\n",
    );
  });
});

describe("historique : consultation", () => {
  it("exige une session", async () => {
    const anonyme = creerBanc().client();
    for (const chemin of ["/api/historique", "/api/historique/filtres", "/api/historique.csv"]) {
      expect((await anonyme("GET", chemin)).statut).toBe(401);
    }
  });

  it("liste les mouvements du plus récent au plus ancien, avec tout le détail", async () => {
    const a = await atelier();
    const entree = await a.entree(6, a.filament.id, { commentaire: "Livraison fournisseur" });
    a.banc.avancer(HEURES(6) + MINUTES(42));
    const prelevement = await a.prelever(2);

    const h = await a.historique(a.e);
    expect(h.total).toBe(2);
    expect(h.mouvements.map((m: any) => m.id)).toEqual([prelevement, entree]);
    expect(h.mouvements[0]).toMatchObject({
      nature: "prelevement",
      quantite: 2,
      delta: -2,
      enseignant: a.dupont.nom,
      machine: a.imprimante.nom,
      projet: "Terminale STI2D",
      type: "filament",
      materiau: a.filament.materiau,
      couleur: "Noir",
      diametre_mm: 1.75,
      teinte: "#2A2D34",
      // 05/10/2026 14:42 UTC, soit 16:42 à Paris (heure d'été).
      cree_le: "2026-10-05T14:42:00.000Z",
      date: "05/10/2026 16:42",
      annule: false,
    });
    expect(h.mouvements[1]).toMatchObject({
      nature: "entree",
      delta: 6,
      machine: null,
      projet: null,
      commentaire: "Livraison fournisseur",
      date: "05/10/2026 10:00",
    });
  });

  it("un mouvement annulé est signalé, et l'annulation apparaît comme un mouvement", async () => {
    const a = await atelier();
    await a.entree(6);
    const p = await a.prelever(1);
    const annulation = await a.annuler(a.e, p);
    const h = await a.historique(a.e);
    expect(h.mouvements.map((m: any) => [m.id, m.nature, m.delta, m.annule])).toEqual([
      [annulation, "annulation", 1, false],
      [p, "prelevement", -1, true],
      [expect.any(Number), "entree", 6, false],
    ]);
    expect(h.mouvements[0]).toMatchObject({
      enseignant: a.martin.nom,
      machine: a.imprimante.nom,
      projet: "Terminale STI2D",
      commentaire: "Erreur de saisie",
      mouvement_annule_id: p,
    });
  });

  it("garde le nom d'un enseignant désactivé puis renommé", async () => {
    const a = await atelier();
    await a.entree(3, a.filament.id, { teacher_id: a.martin.id });
    const nouveau = unique("Martin-Durand");
    await a.g("PATCH", `/api/administration/enseignants/${a.martin.id}`, { nom: nouveau, actif: false });
    expect((await a.historique(a.e)).mouvements[0].enseignant).toBe(nouveau);
  });

  it("limite le nombre de lignes et donne le total", async () => {
    const a = await atelier();
    for (let i = 0; i < 5; i++) await a.entree(1);
    const h = await a.historique(a.e, "limite=2");
    expect(h.total).toBe(5);
    expect(h.mouvements).toHaveLength(2);
  });
});

describe("historique : filtres", () => {
  async function jeu() {
    const a = await atelier();
    const ids = {
      entree: await a.entree(10),
      entreePlaque: await a.entree(8, a.plaque.id),
      dupont: await a.prelever(1),
      martin: await a.prelever(1, { teacher_id: a.martin.id, machine_id: a.imprimante2.id, projet: "Projet lampe 100%" }),
      correction: await a.corriger(5),
    };
    const filtrer = async (requete: string) =>
      ((await a.e("GET", `/api/historique?${requete}`)).corps.mouvements as any[])
        .map((m) => m.id)
        .filter((id) => Object.values(ids).includes(id));
    return { a, ids, filtrer };
  }

  it("par enseignant", async () => {
    const { a, ids, filtrer } = await jeu();
    expect(await filtrer(`enseignant=${a.martin.id}`)).toEqual([ids.martin]);
  });

  it("par référence", async () => {
    const { a, ids, filtrer } = await jeu();
    expect(await filtrer(`reference=${a.plaque.id}`)).toEqual([ids.entreePlaque]);
  });

  it("par machine", async () => {
    const { a, ids, filtrer } = await jeu();
    expect(await filtrer(`machine=${a.imprimante2.id}`)).toEqual([ids.martin]);
  });

  it("par nature", async () => {
    const { a, ids, filtrer } = await jeu();
    expect(await filtrer(`nature=correction&reference=${a.filament.id}`)).toEqual([ids.correction]);
    expect(await filtrer(`nature=prelevement&reference=${a.filament.id}`)).toEqual([ids.martin, ids.dupont]);
  });

  it("par projet ou classe : texte contenu, sans tenir compte de la casse", async () => {
    const { a, ids, filtrer } = await jeu();
    const ref = `reference=${a.filament.id}`;
    expect(await filtrer(`${ref}&projet=lampe`)).toEqual([ids.martin]);
    expect(await filtrer(`${ref}&projet=STI2D`)).toEqual([ids.dupont]);
    // Le signe % est cherché tel quel, il ne sert pas de joker.
    expect(await filtrer(`${ref}&projet=${encodeURIComponent("100%")}`)).toEqual([ids.martin]);
    expect(await filtrer(`${ref}&projet=${encodeURIComponent("%")}`)).toEqual([ids.martin]);
    expect(await filtrer(`${ref}&projet=${encodeURIComponent("Terminale_")}`)).toEqual([]);
  });

  it("combine plusieurs filtres", async () => {
    const { a, ids, filtrer } = await jeu();
    expect(await filtrer(`reference=${a.filament.id}&enseignant=${a.dupont.id}&nature=prelevement`)).toEqual([ids.dupont]);
    expect(await filtrer(`reference=${a.plaque.id}&nature=prelevement`)).toEqual([]);
  });

  it("refuse un filtre invalide", async () => {
    const { a } = await jeu();
    for (const requete of ["enseignant=abc", "nature=don", "periode=siecle", "periode=dates&du=2026-02-30", "periode=dates&du=2026-10-06&au=2026-10-05"]) {
      const r = await a.e("GET", `/api/historique?${requete}`);
      expect(r.statut, requete).toBe(400);
      expect(r.corps.code).toBe("FILTRE_INVALIDE");
    }
  });
});

describe("historique : période", () => {
  it("30 derniers jours par défaut, 7 jours, ou tout", async () => {
    const a = await atelier();
    const ancien = await a.entree(5);
    a.banc.avancer(JOURS(20));
    const moyen = await a.entree(1);
    a.banc.avancer(JOURS(20));
    const recent = await a.entree(1);
    // La session de 90 jours est toujours valable après 40 jours.
    const ids = async (requete = "") => (await a.historique(a.e, requete)).mouvements.map((m: any) => m.id);
    expect(await ids()).toEqual([recent, moyen]);
    expect(await ids("periode=30j")).toEqual([recent, moyen]);
    expect(await ids("periode=7j")).toEqual([recent]);
    expect(await ids("periode=90j")).toEqual([recent, moyen, ancien]);
    expect(await ids("periode=tout")).toEqual([recent, moyen, ancien]);
  });

  it("« aujourd'hui » suit le jour de Paris, pas celui d'UTC", async () => {
    const a = await atelier();
    // 05/10 à 10:00 Paris.
    const matin = await a.entree(1);
    a.banc.avancer(HEURES(13) + MINUTES(30)); // 05/10 à 23:30 Paris (21:30 UTC)
    const soir = await a.entree(1);
    a.banc.avancer(MINUTES(45)); // 06/10 à 00:15 Paris (22:15 UTC le 05/10)
    const nuit = await a.entree(1);
    const ids = async (requete: string) => (await a.historique(a.e, requete)).mouvements.map((m: any) => m.id);
    expect(await ids("periode=jour")).toEqual([nuit]);
    expect(await ids("periode=dates&du=2026-10-05&au=2026-10-05")).toEqual([soir, matin]);
    expect(await ids("periode=dates&du=2026-10-06")).toEqual([nuit]);
    expect(await ids("periode=dates&au=2026-10-05")).toEqual([soir, matin]);
    expect(await ids("periode=dates&du=2026-10-05&au=2026-10-06")).toEqual([nuit, soir, matin]);
  });
});

describe("historique : mouvements annulables (règle 3)", () => {
  const annulables = (h: any) => Object.fromEntries(h.mouvements.map((m: any) => [m.id, m.annulable]));

  it("pour un enseignant : seulement le dernier mouvement de la référence, dans les 24 heures", async () => {
    const a = await atelier();
    const entree = await a.entree(6);
    const p = await a.prelever(1);
    expect(annulables(await a.historique(a.e))).toEqual({ [entree]: false, [p]: true });
    a.banc.avancer(HEURES(25));
    expect(annulables(await a.historique(a.e, "periode=tout"))).toEqual({ [entree]: false, [p]: false });
  });

  it("pour un enseignant : jamais une correction, une annulation ou un mouvement déjà annulé", async () => {
    const a = await atelier();
    const entree = await a.entree(6);
    const correction = await a.corriger(4);
    expect(annulables(await a.historique(a.e))).toEqual({ [entree]: false, [correction]: false });
    const p = await a.prelever(1);
    const annulation = await a.annuler(a.e, p);
    expect(annulables(await a.historique(a.e))).toEqual({
      [entree]: false, [correction]: false, [p]: false, [annulation]: false,
    });
  });

  it("pour le gestionnaire : tout mouvement non annulé, sauf une annulation", async () => {
    const a = await atelier();
    const entree = await a.entree(6);
    const correction = await a.corriger(4);
    const p = await a.prelever(1);
    const annulation = await a.annuler(a.e, p);
    a.banc.avancer(JOURS(3));
    const g = await a.banc.gestionnaire("192.0.2.120");
    expect(annulables(await a.historique(g, "periode=tout"))).toEqual({
      [entree]: true, [correction]: true, [p]: false, [annulation]: false,
    });
  });

  it("ce qui est affiché comme annulable s'annule réellement, et inversement", async () => {
    const a = await atelier();
    const entree = await a.entree(6);
    const p = await a.prelever(1);
    const h = await a.historique(a.e);
    for (const m of h.mouvements) {
      const r = await a.e("POST", `/api/mouvements/${m.id}/annulation`, { teacher_id: a.dupont.id });
      expect(r.statut === 201, `mouvement ${m.id}`).toBe(m.annulable);
    }
    expect([entree, p]).toHaveLength(2);
  });
});

describe("historique : export CSV", () => {
  it("exporte la sélection filtrée, au format attendu par Excel", async () => {
    const a = await atelier();
    await a.entree(6, a.filament.id, { commentaire: "BL 118; reçu complet" });
    await a.entree(4, a.plaque.id);
    a.banc.avancer(MINUTES(5));
    const p = await a.prelever(2, { projet: "=1+1", commentaire: 'Pièce "test"' });
    await a.annuler(a.e, p);

    const r = await a.e("GET", `/api/historique.csv?reference=${a.filament.id}`);
    expect(r.statut).toBe(200);
    expect(r.entetes.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(r.entetes.get("content-disposition")).toBe('attachment; filename="historique-fablab-2026-10-05.csv"');
    expect(r.entetes.get("cache-control")).toBe("no-store");
    expect(r.texte.charCodeAt(0)).toBe(0xfeff);

    const lignes = r.texte.slice(1).split("\r\n");
    expect(lignes[0]).toBe("Date;Heure;Enseignant;Type;Matière;Spécification;Nature;Quantité;Machine;Projet ou classe;Commentaire;Annulé");
    const matiere = `${a.filament.materiau} · Noir`;
    expect(lignes.slice(1, -1)).toEqual([
      `05/10/2026;10:05;${a.martin.nom};Filament;${matiere};1,75 mm;Annulation;2;${a.imprimante.nom};'=1+1;Erreur de saisie;non`,
      `05/10/2026;10:05;${a.dupont.nom};Filament;${matiere};1,75 mm;Prélèvement;-2;${a.imprimante.nom};'=1+1;"Pièce ""test""";oui`,
      `05/10/2026;10:00;${a.dupont.nom};Filament;${matiere};1,75 mm;Entrée;6;;;"BL 118; reçu complet";non`,
    ]);
    expect(lignes.at(-1)).toBe("");
  });

  it("décrit une plaque avec son épaisseur à virgule et son format", async () => {
    const a = await atelier();
    await a.entree(4, a.plaque.id);
    const r = await a.e("GET", `/api/historique.csv?reference=${a.plaque.id}`);
    expect(r.texte).toContain(`;Plaque;${a.plaque.materiau} Clair;2,5 mm · 600 × 400;Entrée;4;`);
  });

  it("refuse un filtre invalide", async () => {
    const a = await atelier();
    expect((await a.e("GET", "/api/historique.csv?nature=don")).statut).toBe(400);
  });
});

describe("listes des filtres", () => {
  it("contient aussi les noms désactivés, puisqu'ils figurent dans l'historique", async () => {
    const a = await atelier();
    await a.g("PATCH", `/api/administration/enseignants/${a.martin.id}`, { actif: false });
    await a.g("PATCH", `/api/administration/machines/${a.laser.id}`, { actif: false });
    await a.g("PATCH", `/api/administration/references/${a.plaque.id}`, { actif: false });
    const f = (await a.e("GET", "/api/historique/filtres")).corps;
    expect(f.enseignants.find((x: any) => x.id === a.martin.id)).toMatchObject({ actif: false });
    expect(f.machines.find((x: any) => x.id === a.laser.id)).toMatchObject({ actif: false });
    expect(f.references.find((x: any) => x.id === a.plaque.id)).toMatchObject({ actif: false });
  });
});

describe("compteur « à commander » de la navigation", () => {
  it("compte les références actives dont le stock est inférieur ou égal au seuil", async () => {
    const a = await atelier();
    const compte = async () => (await a.e("GET", "/api/session")).corps.aCommander as number;
    // Les deux références du test sont à zéro, donc à commander.
    const depart = await compte();
    await a.entree(3); // filament : seuil 2, stock 3 -> en stock
    expect(await compte()).toBe(depart - 1);
    await a.prelever(1); // stock 2 = seuil -> à commander
    expect(await compte()).toBe(depart);
    await a.entree(4, a.plaque.id); // plaque : seuil 3, stock 4 -> en stock
    expect(await compte()).toBe(depart - 1);
    // Une référence désactivée ne compte plus.
    await a.g("PATCH", `/api/administration/references/${a.filament.id}`, { actif: false });
    expect(await compte()).toBe(depart - 2);
  });

  it("n'est pas communiqué sans session", async () => {
    expect((await creerBanc().client()("GET", "/api/session")).corps.aCommander).toBeNull();
  });
});
