// Bloc 4 : mouvements et règles de gestion (sections 5.3, 5.4, 5.10 et 6).

import { beforeEach, describe, expect, it } from "vitest";
import { stockDeReference } from "../src/donnees/stock";
import { JOURS, MINUTES, creerBanc, viderAcces, type Client } from "./client";
import { baseDeTest } from "./outils";

beforeEach(viderAcces);

let compteur = 0;
const unique = (prefixe: string) => `${prefixe}-${++compteur}`;

const HEURES = (n: number) => MINUTES(60 * n);

/** Un atelier minimal : un enseignant connecté, un gestionnaire, et de quoi saisir. */
async function atelier(stockInitial = 0) {
  const banc = creerBanc();
  // L'enseignant d'abord : définir le code commun déconnecte les autres appareils.
  const e = await banc.enseignant();
  const g = await banc.gestionnaire();
  const creer = async (chemin: string, corps: unknown, cle: string) => {
    const r = await g("POST", `/api/administration/${chemin}`, corps);
    expect(r.statut, JSON.stringify(r.corps)).toBe(201);
    return r.corps[cle].id as number;
  };
  const dupont = await creer("enseignants", { nom: unique("Dupont") }, "enseignant");
  const martin = await creer("enseignants", { nom: unique("Martin") }, "enseignant");
  const imprimante = await creer("machines", { nom: unique("Imprimante"), type: "filament" }, "machine");
  const laser = await creer("machines", { nom: unique("Laser"), type: "plaque" }, "machine");
  const filament = await creer(
    "references",
    { type: "filament", materiau: unique("PLA"), couleur: "Noir", teinte: "#2A2D34", diametre_mm: 1.75, seuil: 2, cible: 8 },
    "reference",
  );
  const plaque = await creer(
    "references",
    { type: "plaque", materiau: unique("MDF"), teinte: "#A98A6A", epaisseur_mm: 3, longueur_mm: 600, largeur_mm: 400, seuil: 3, cible: 10 },
    "reference",
  );

  const a = {
    banc,
    e,
    g,
    dupont,
    martin,
    imprimante,
    laser,
    filament,
    plaque,
    stock: (ref = filament) => stockDeReference(baseDeTest(), ref),
    entree: (client: Client, quantite: number, ref = filament, surcharge: Record<string, unknown> = {}) =>
      client("POST", "/api/mouvements/entree", { material_id: ref, teacher_id: dupont, quantite, ...surcharge }),
    prelever: (client: Client, quantite: number, surcharge: Record<string, unknown> = {}) =>
      client("POST", "/api/mouvements/prelevement", {
        material_id: filament,
        teacher_id: dupont,
        quantite,
        machine_id: imprimante,
        projet: "Terminale STI2D",
        ...surcharge,
      }),
    annuler: (client: Client, id: number, surcharge: Record<string, unknown> = {}) =>
      client("POST", `/api/mouvements/${id}/annulation`, { teacher_id: dupont, ...surcharge }),
    corriger: (client: Client, stock_constate: number, surcharge: Record<string, unknown> = {}) =>
      client("POST", "/api/administration/corrections", {
        material_id: filament,
        teacher_id: dupont,
        stock_constate,
        commentaire: "Inventaire",
        ...surcharge,
      }),
  };
  if (stockInitial > 0) expect((await a.entree(e, stockInitial)).statut).toBe(201);
  return a;
}

const ligne = (id: number) => baseDeTest().premier<Record<string, any>>("SELECT * FROM movement WHERE id = ?", [id]);

describe("prélèvement (5.3)", () => {
  it("enregistre le mouvement et renvoie le nouveau stock", async () => {
    const a = await atelier(6);
    const r = await a.prelever(a.e, 2, { commentaire: "  Maquettes   boîtiers " });
    expect(r.statut).toBe(201);
    expect(r.corps.stock).toBe(4);
    expect(r.corps.mouvement).toMatchObject({
      material_id: a.filament,
      nature: "prelevement",
      quantite: 2,
      delta: -2,
      teacher_id: a.dupont,
      machine_id: a.imprimante,
      projet: "Terminale STI2D",
      commentaire: "Maquettes boîtiers",
      mouvement_annule_id: null,
    });
    expect(await a.stock()).toBe(4);
  });

  it("exige une session", async () => {
    const a = await atelier(6);
    const r = await a.prelever(a.banc.client("192.0.2.77"), 1);
    expect(r.statut).toBe(401);
    expect(await a.stock()).toBe(6);
  });

  it.each([
    ["sans machine", { machine_id: undefined }, "machine_id"],
    ["sans projet ni classe", { projet: "   " }, "projet"],
    ["projet trop long", { projet: "x".repeat(61) }, "projet"],
    ["sans enseignant", { teacher_id: undefined }, "teacher_id"],
    ["sans référence", { material_id: undefined }, "material_id"],
    ["quantité nulle", { quantite: 0 }, "quantite"],
    ["quantité négative", { quantite: -1 }, "quantite"],
    ["quantité non entière", { quantite: 1.5 }, "quantite"],
    ["quantité en texte", { quantite: "1" }, "quantite"],
    ["commentaire trop long", { commentaire: "x".repeat(201) }, "commentaire"],
  ])("refuse un prélèvement %s", async (_cas, surcharge, champ) => {
    const a = await atelier(6);
    const { quantite = 1, ...reste } = surcharge as Record<string, unknown>;
    const r = await a.prelever(a.e, quantite as number, reste);
    expect(r.statut).toBe(400);
    expect(r.corps).toMatchObject({ code: "CHAMP_INVALIDE", champ });
    expect(await a.stock()).toBe(6);
  });

  it("refuse une machine d'un autre type de matière, inconnue ou désactivée", async () => {
    const a = await atelier(6);
    const incompatible = await a.prelever(a.e, 1, { machine_id: a.laser });
    expect(incompatible.statut).toBe(409);
    expect(incompatible.corps.code).toBe("MACHINE_INCOMPATIBLE");
    expect((await a.prelever(a.e, 1, { machine_id: 999_999 })).corps.code).toBe("MACHINE_INACTIVE");
    await a.g("PATCH", `/api/administration/machines/${a.imprimante}`, { actif: false });
    expect((await a.prelever(a.e, 1)).corps.code).toBe("MACHINE_INACTIVE");
    expect(await a.stock()).toBe(6);
  });
});

describe("règle 1 : un stock ne peut pas devenir négatif", () => {
  it("refuse un prélèvement supérieur au stock, avec un message explicite", async () => {
    const a = await atelier(2);
    const r = await a.prelever(a.e, 3);
    expect(r.statut).toBe(409);
    expect(r.corps).toMatchObject({
      code: "STOCK_INSUFFISANT",
      stock: 2,
      erreur: "Stock insuffisant : il reste 2 bobines.",
    });
    expect(await a.stock()).toBe(2);
  });

  it("accepte un prélèvement égal au stock, puis refuse le suivant", async () => {
    const a = await atelier(2);
    expect((await a.prelever(a.e, 2)).corps.stock).toBe(0);
    const r = await a.prelever(a.e, 1);
    expect(r.statut).toBe(409);
    expect(r.corps.erreur).toBe("Stock épuisé : il ne reste rien à prélever sur cette référence.");
    expect(await a.stock()).toBe(0);
  });

  it("deux prélèvements simultanés ne peuvent pas dépasser le stock à eux deux", async () => {
    const a = await atelier(3);
    const reponses = await Promise.all([a.prelever(a.e, 2), a.prelever(a.e, 2)]);
    expect(reponses.map((r) => r.statut).sort()).toEqual([201, 409]);
    expect(await a.stock()).toBe(1);
  });
});

describe("entrée de stock (5.4)", () => {
  it("augmente le stock, avec un commentaire facultatif", async () => {
    const a = await atelier();
    const r = await a.entree(a.e, 4, a.filament, { commentaire: "BL 2026-118" });
    expect(r.statut).toBe(201);
    expect(r.corps.stock).toBe(4);
    expect(r.corps.mouvement).toMatchObject({
      nature: "entree",
      quantite: 4,
      delta: 4,
      machine_id: null,
      projet: null,
      commentaire: "BL 2026-118",
    });
    expect((await a.entree(a.e, 1)).corps.stock).toBe(5);
  });

  it("refuse une quantité nulle, négative ou démesurée", async () => {
    const a = await atelier();
    for (const quantite of [0, -3, 10_000, 2.5]) {
      expect((await a.entree(a.e, quantite)).statut).toBe(400);
    }
    expect(await a.stock()).toBe(0);
  });
});

describe("règle 4 : une référence désactivée n'accepte plus de saisie", () => {
  it("refuse prélèvement, entrée et correction, et la retire de la saisie", async () => {
    const a = await atelier(5);
    await a.g("PATCH", `/api/administration/references/${a.filament}`, { actif: false });
    for (const r of [await a.prelever(a.e, 1), await a.entree(a.e, 1), await a.corriger(a.g, 3)]) {
      expect(r.statut).toBe(409);
      expect(r.corps.code).toBe("REFERENCE_INACTIVE");
    }
    expect(await a.stock()).toBe(5);
    const saisie = (await a.e("GET", "/api/saisie")).corps.references as any[];
    expect(saisie.some((r) => r.id === a.filament)).toBe(false);
  });
});

describe("règle 6 : la date vient du serveur", () => {
  it("ignore une date envoyée par l'appareil", async () => {
    const a = await atelier(5);
    const r = await a.prelever(a.e, 1, { cree_le: "1999-01-01T00:00:00.000Z" });
    expect(r.corps.mouvement.cree_le).toBe("2026-10-05T08:00:00.000Z");
    a.banc.avancer(MINUTES(90));
    expect((await a.prelever(a.e, 1)).corps.mouvement.cree_le).toBe("2026-10-05T09:30:00.000Z");
  });
});

describe("règle 8 : seul un nom actif peut être associé à un nouveau mouvement", () => {
  it("refuse un nom désactivé ou inconnu, pour toutes les natures de mouvement", async () => {
    const a = await atelier(5);
    const p = (await a.prelever(a.e, 1)).corps.mouvement.id;
    await a.g("PATCH", `/api/administration/enseignants/${a.martin}`, { actif: false });
    const inactif = { teacher_id: a.martin };
    for (const r of [
      await a.prelever(a.e, 1, inactif),
      await a.entree(a.e, 1, a.filament, inactif),
      await a.corriger(a.g, 9, inactif),
      await a.annuler(a.e, p, inactif),
      await a.prelever(a.e, 1, { teacher_id: 999_999 }),
    ]) {
      expect(r.statut).toBe(409);
      expect(r.corps.code).toBe("ENSEIGNANT_INACTIF");
    }
    expect(await a.stock()).toBe(4);
  });

  it("les anciens mouvements gardent le nom d'origine, même désactivé", async () => {
    const a = await atelier(5);
    const id = (await a.prelever(a.e, 1, { teacher_id: a.martin })).corps.mouvement.id;
    await a.g("PATCH", `/api/administration/enseignants/${a.martin}`, { actif: false });
    const historique = await baseDeTest().premier<{ nom: string; actif: number }>(
      "SELECT t.nom, t.actif FROM movement v JOIN teacher t ON t.id = v.teacher_id WHERE v.id = ?",
      [id],
    );
    expect(historique!.nom).toMatch(/^Martin-/);
    expect(historique!.actif).toBe(0);
  });
});

describe("correction d'inventaire (5.10)", () => {
  it("est réservée au gestionnaire, côté serveur", async () => {
    const a = await atelier(5);
    expect((await a.corriger(a.banc.client("192.0.2.77"), 3)).statut).toBe(401);
    const r = await a.corriger(a.e, 3);
    expect(r.statut).toBe(403);
    expect(r.corps.code).toBe("GESTIONNAIRE_REQUIS");
    expect(await a.stock()).toBe(5);
  });

  it("crée un mouvement égal à l'écart, à la baisse comme à la hausse", async () => {
    const a = await atelier(5);
    const baisse = await a.corriger(a.g, 3, { commentaire: "Inventaire de rentrée" });
    expect(baisse.statut).toBe(201);
    expect(baisse.corps.stock).toBe(3);
    expect(baisse.corps.mouvement).toMatchObject({
      nature: "correction",
      quantite: -2,
      delta: -2,
      commentaire: "Inventaire de rentrée",
      machine_id: null,
    });
    const hausse = await a.corriger(a.g, 10);
    expect(hausse.corps.mouvement).toMatchObject({ quantite: 7, delta: 7 });
    expect(await a.stock()).toBe(10);
  });

  it("peut ramener le stock à zéro, jamais en dessous", async () => {
    const a = await atelier(5);
    expect((await a.corriger(a.g, 0)).corps.stock).toBe(0);
    const r = await a.corriger(a.g, -1);
    expect(r.statut).toBe(400);
    expect(r.corps.champ).toBe("stock_constate");
  });

  it("exige un commentaire", async () => {
    const a = await atelier(5);
    for (const commentaire of [undefined, "", "   "]) {
      const r = await a.corriger(a.g, 3, { commentaire });
      expect(r.statut).toBe(400);
      expect(r.corps.champ).toBe("commentaire");
    }
    expect(await a.stock()).toBe(5);
  });

  it("ne crée aucun mouvement quand il n'y a pas d'écart", async () => {
    const a = await atelier(5);
    const r = await a.corriger(a.g, 5);
    expect(r.statut).toBe(409);
    expect(r.corps.code).toBe("AUCUN_ECART");
    const n = await baseDeTest().premier<{ n: number }>(
      "SELECT COUNT(*) AS n FROM movement WHERE material_id = ? AND nature = 'correction'",
      [a.filament],
    );
    expect(n!.n).toBe(0);
  });
});

describe("règle 2 : aucun mouvement n'est modifié ni supprimé", () => {
  it("il n'existe aucune route pour modifier ou supprimer un mouvement", async () => {
    const a = await atelier(5);
    const id = (await a.prelever(a.e, 1)).corps.mouvement.id;
    for (const methode of ["PUT", "PATCH", "DELETE"]) {
      expect((await a.g(methode, `/api/mouvements/${id}`, { quantite: 3 })).statut).toBe(404);
    }
    expect(await a.stock()).toBe(4);
  });

  it("une annulation ajoute un mouvement inverse et laisse l'original intact", async () => {
    const a = await atelier(6);
    const id = (await a.prelever(a.e, 2, { commentaire: "Essai" })).corps.mouvement.id;
    const avant = await ligne(id);
    a.banc.avancer(MINUTES(5));

    const r = await a.annuler(a.e, id, { teacher_id: a.martin, commentaire: "Erreur de saisie" });
    expect(r.statut).toBe(201);
    expect(r.corps.stock).toBe(6);
    expect(r.corps.mouvement).toMatchObject({
      nature: "annulation",
      quantite: 2,
      delta: 2,
      material_id: a.filament,
      // Tracée avec le nom choisi par la personne qui annule.
      teacher_id: a.martin,
      // Machine et projet repris du mouvement d'origine, pour l'historique.
      machine_id: a.imprimante,
      projet: "Terminale STI2D",
      commentaire: "Erreur de saisie",
      mouvement_annule_id: id,
      cree_le: "2026-10-05T08:05:00.000Z",
    });
    expect(await ligne(id)).toEqual(avant);
    expect(await a.stock()).toBe(6);
  });

  it("un mouvement ne s'annule qu'une fois, et une annulation ne s'annule pas", async () => {
    const a = await atelier(6);
    const id = (await a.prelever(a.e, 2)).corps.mouvement.id;
    const annulation = (await a.annuler(a.e, id)).corps.mouvement.id;

    for (const client of [a.e, a.g]) {
      const deuxieme = await a.annuler(client, id);
      expect(deuxieme.statut).toBe(409);
      expect(deuxieme.corps.code).toBe("DEJA_ANNULE");
      const surAnnulation = await a.annuler(client, annulation);
      expect(surAnnulation.statut).toBe(409);
      expect(surAnnulation.corps.code).toBe("ANNULATION_NON_ANNULABLE");
    }
    expect(await a.stock()).toBe(6);
  });

  it("répond 404 pour un mouvement inconnu", async () => {
    const a = await atelier(6);
    expect((await a.annuler(a.e, 999_999)).statut).toBe(404);
  });
});

describe("règle 3 : annulation par un enseignant", () => {
  it("annule une entrée de stock qui est le dernier mouvement", async () => {
    const a = await atelier(2);
    const id = (await a.entree(a.e, 3)).corps.mouvement.id;
    const r = await a.annuler(a.e, id);
    expect(r.statut).toBe(201);
    expect(r.corps.mouvement).toMatchObject({ quantite: 3, delta: -3 });
    expect(r.corps.stock).toBe(2);
  });

  it("refuse si un autre mouvement a été enregistré depuis sur la même référence", async () => {
    const a = await atelier(6);
    const premier = (await a.prelever(a.e, 1)).corps.mouvement.id;
    await a.prelever(a.e, 1);
    const r = await a.annuler(a.e, premier);
    expect(r.statut).toBe(409);
    expect(r.corps.code).toBe("PAS_LE_DERNIER_MOUVEMENT");
    expect(await a.stock()).toBe(4);
  });

  it("un mouvement sur une autre référence n'empêche pas l'annulation", async () => {
    const a = await atelier(6);
    const id = (await a.prelever(a.e, 1)).corps.mouvement.id;
    expect((await a.entree(a.e, 5, a.plaque)).statut).toBe(201);
    expect((await a.annuler(a.e, id)).statut).toBe(201);
    expect(await a.stock()).toBe(6);
  });

  it("après une annulation, le mouvement précédent n'est plus annulable par un enseignant", async () => {
    const a = await atelier();
    const entree = (await a.entree(a.e, 6)).corps.mouvement.id;
    const prelevement = (await a.prelever(a.e, 1)).corps.mouvement.id;
    expect((await a.annuler(a.e, prelevement)).statut).toBe(201);
    const r = await a.annuler(a.e, entree);
    expect(r.corps.code).toBe("PAS_LE_DERNIER_MOUVEMENT");
    expect(await a.stock()).toBe(6);
  });

  it("accepte jusqu'à 24 heures, refuse au-delà", async () => {
    const a = await atelier(6);
    const id = (await a.prelever(a.e, 1)).corps.mouvement.id;
    a.banc.avancer(HEURES(24) + 1000);
    const tard = await a.annuler(a.e, id);
    expect(tard.statut).toBe(409);
    expect(tard.corps.code).toBe("DELAI_DEPASSE");
    expect(await a.stock()).toBe(5);

    const b = await atelier(6);
    const id2 = (await b.prelever(b.e, 1)).corps.mouvement.id;
    b.banc.avancer(HEURES(24));
    expect((await b.annuler(b.e, id2)).statut).toBe(201);
    expect(await b.stock()).toBe(6);
  });

  it("refuse d'annuler une correction d'inventaire", async () => {
    const a = await atelier(6);
    const id = (await a.corriger(a.g, 4)).corps.mouvement.id;
    const r = await a.annuler(a.e, id);
    expect(r.statut).toBe(409);
    expect(r.corps.code).toBe("GESTIONNAIRE_REQUIS_ANNULATION");
    expect(await a.stock()).toBe(4);
  });

  it("les droits du gestionnaire viennent de la session, pas de ce qu'envoie l'appareil", async () => {
    const a = await atelier(6);
    const premier = (await a.prelever(a.e, 1)).corps.mouvement.id;
    await a.prelever(a.e, 1);
    const r = await a.annuler(a.e, premier, { gestionnaire: true, estGestionnaire: true });
    expect(r.statut).toBe(409);
    expect(r.corps.code).toBe("PAS_LE_DERNIER_MOUVEMENT");
  });

  it("exige une session", async () => {
    const a = await atelier(6);
    const id = (await a.prelever(a.e, 1)).corps.mouvement.id;
    expect((await a.annuler(a.banc.client("192.0.2.77"), id)).statut).toBe(401);
    expect(await a.stock()).toBe(5);
  });
});

describe("règle 3 : le gestionnaire peut annuler n'importe quel mouvement", () => {
  it("annule un mouvement ancien qui n'est plus le dernier", async () => {
    const a = await atelier(6);
    const premier = (await a.prelever(a.e, 2)).corps.mouvement.id;
    await a.prelever(a.e, 1);
    a.banc.avancer(JOURS(10));
    // La session du gestionnaire a expiré entre-temps : il rouvre le mode gestionnaire.
    const g = await a.banc.gestionnaire("192.0.2.110");
    const r = await a.annuler(g, premier);
    expect(r.statut).toBe(201);
    expect(r.corps.stock).toBe(5);
  });

  it("annule une correction d'inventaire", async () => {
    const a = await atelier(6);
    const id = (await a.corriger(a.g, 4)).corps.mouvement.id;
    const r = await a.annuler(a.g, id);
    expect(r.statut).toBe(201);
    expect(r.corps.mouvement).toMatchObject({ quantite: 2, delta: 2 });
    expect(r.corps.stock).toBe(6);
  });

  it("annule un mouvement d'une référence désactivée", async () => {
    const a = await atelier(6);
    const id = (await a.prelever(a.e, 1)).corps.mouvement.id;
    await a.g("PATCH", `/api/administration/references/${a.filament}`, { actif: false });
    expect((await a.annuler(a.e, id)).corps.code).toBe("REFERENCE_INACTIVE");
    expect((await a.annuler(a.g, id)).statut).toBe(201);
    expect(await a.stock()).toBe(6);
  });

  it("refuse d'annuler une entrée déjà consommée : le stock deviendrait négatif", async () => {
    const a = await atelier();
    const entree = (await a.entree(a.e, 5)).corps.mouvement.id;
    await a.prelever(a.e, 3);
    const r = await a.annuler(a.g, entree);
    expect(r.statut).toBe(409);
    expect(r.corps).toMatchObject({
      code: "STOCK_INSUFFISANT",
      erreur: "Annulation impossible : le stock deviendrait négatif. Faites plutôt une correction d'inventaire.",
    });
    expect(await a.stock()).toBe(2);
  });
});

describe("stock : cohérence sur une suite de mouvements", () => {
  it("le stock est toujours la somme des mouvements", async () => {
    const a = await atelier();
    await a.entree(a.e, 10); // 10
    await a.prelever(a.e, 3); // 7
    const p = (await a.prelever(a.e, 2)).corps.mouvement.id; // 5
    await a.annuler(a.e, p); // 7
    await a.corriger(a.g, 6); // 6
    await a.entree(a.e, 4); // 10
    await a.prelever(a.e, 10); // 0
    expect((await a.prelever(a.e, 1)).statut).toBe(409);
    expect(await a.stock()).toBe(0);

    const somme = await baseDeTest().premier<{ s: number; n: number }>(
      "SELECT SUM(delta) AS s, COUNT(*) AS n FROM movement WHERE material_id = ?",
      [a.filament],
    );
    expect(somme).toEqual({ s: 0, n: 7 });
    const reference = ((await a.e("GET", "/api/references")).corps.references as any[]).find((r) => r.id === a.filament);
    expect(reference.stock).toBe(0);
  });
});

describe("données de saisie", () => {
  it("exige une session", async () => {
    expect((await creerBanc().client()("GET", "/api/saisie")).statut).toBe(401);
  });

  it("ne propose que les éléments actifs, avec le stock et le nombre de prélèvements", async () => {
    const a = await atelier(6);
    await a.prelever(a.e, 1);
    await a.prelever(a.e, 1);
    await a.g("PATCH", `/api/administration/enseignants/${a.martin}`, { actif: false });
    await a.g("PATCH", `/api/administration/machines/${a.laser}`, { actif: false });
    await a.g("PATCH", `/api/administration/references/${a.plaque}`, { actif: false });

    const s = (await a.e("GET", "/api/saisie")).corps;
    expect(s.references.find((r: any) => r.id === a.filament)).toMatchObject({ stock: 4, utilisations: 2 });
    expect(s.references.some((r: any) => r.id === a.plaque)).toBe(false);
    expect(s.machines.some((m: any) => m.id === a.imprimante)).toBe(true);
    expect(s.machines.some((m: any) => m.id === a.laser)).toBe(false);
    expect(s.enseignants.some((x: any) => x.id === a.dupont)).toBe(true);
    expect(s.enseignants.some((x: any) => x.id === a.martin)).toBe(false);
  });

  it("propose les projets ou classes déjà saisis, les plus récents d'abord, sans doublon", async () => {
    const a = await atelier(9);
    const [p1, p2] = [unique("Projet lampe"), unique("Première STI2D")];
    await a.prelever(a.e, 1, { projet: p1 });
    await a.prelever(a.e, 1, { projet: p2 });
    await a.prelever(a.e, 1, { projet: p1 });
    const projets = ((await a.e("GET", "/api/saisie")).corps.projets as string[]).filter((p) => p === p1 || p === p2);
    expect(projets).toEqual([p1, p2]);
  });
});
