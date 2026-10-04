// Bloc 3 : catalogue des références et des machines (4.1, 4.3, 5.7, règles 4 et 5).

import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { creerBanc, viderAcces, type Client } from "./client";
import { baseDeTest, creerEnseignant, insererMouvement } from "./outils";

beforeEach(viderAcces);

// Rien ne se supprime dans le catalogue : chaque test utilise des noms qui lui sont propres.
let compteur = 0;
const unique = (prefixe: string) => `${prefixe}-${++compteur}`;

let enseignantId: number;
beforeAll(async () => {
  enseignantId = await creerEnseignant(baseDeTest(), "Dupont (catalogue)");
});

const filament = (surcharge: Record<string, unknown> = {}) => ({
  type: "filament",
  materiau: unique("PLA"),
  couleur: "Rouge",
  teinte: "#c9402d",
  diametre_mm: 1.75,
  seuil: 2,
  cible: 6,
  ...surcharge,
});

const plaque = (surcharge: Record<string, unknown> = {}) => ({
  type: "plaque",
  materiau: unique("Contreplaqué"),
  couleur: "",
  teinte: "#C9A36B",
  epaisseur_mm: 3,
  longueur_mm: 600,
  largeur_mm: 400,
  seuil: 5,
  cible: 20,
  ...surcharge,
});

async function creer(g: Client, donnees: Record<string, unknown>) {
  const r = await g("POST", "/api/administration/references", donnees);
  expect(r.statut, JSON.stringify(r.corps)).toBe(201);
  return r.corps.reference as Record<string, any>;
}

describe("contrôle d'accès côté serveur", () => {
  it("les listes de saisie exigent une session", async () => {
    const banc = creerBanc();
    const anonyme = banc.client();
    expect((await anonyme("GET", "/api/references")).statut).toBe(401);
    expect((await anonyme("GET", "/api/machines")).statut).toBe(401);
    const enseignant = await banc.enseignant();
    expect((await enseignant("GET", "/api/references")).statut).toBe(200);
    expect((await enseignant("GET", "/api/machines")).statut).toBe(200);
  });

  it("la gestion du catalogue est refusée sans le code gestionnaire", async () => {
    const banc = creerBanc();
    const enseignant = await banc.enseignant();
    const g = await banc.gestionnaire();
    const reference = await creer(g, filament());
    const machine = (await g("POST", "/api/administration/machines", { nom: unique("Imprimante"), type: "filament" }))
      .corps.machine;
    const anonyme = banc.client("192.0.2.9");

    const actions: [string, string, unknown?][] = [
      ["GET", "/api/administration/references"],
      ["POST", "/api/administration/references", filament()],
      ["PATCH", `/api/administration/references/${reference.id}`, { seuil: 0 }],
      ["PATCH", `/api/administration/references/${reference.id}`, { actif: false }],
      ["GET", "/api/administration/machines"],
      ["POST", "/api/administration/machines", { nom: unique("Intruse"), type: "filament" }],
      ["PATCH", `/api/administration/machines/${machine.id}`, { actif: false }],
    ];
    for (const [methode, chemin, corps] of actions) {
      expect((await anonyme(methode, chemin, corps)).statut, `${methode} ${chemin} anonyme`).toBe(401);
      const r = await enseignant(methode, chemin, corps);
      expect(r.statut, `${methode} ${chemin} enseignant`).toBe(403);
      expect(r.corps.code).toBe("GESTIONNAIRE_REQUIS");
    }

    // Rien n'a changé.
    const apres = (await g("GET", "/api/administration/references")).corps.references as any[];
    expect(apres.find((r) => r.id === reference.id)).toEqual(reference);
    const machines = (await g("GET", "/api/administration/machines")).corps.machines as any[];
    expect(machines.find((m) => m.id === machine.id)).toEqual(machine);
    expect(machines.some((m) => m.nom.startsWith("Intruse"))).toBe(false);
  });
});

describe("références : création", () => {
  it("crée un filament, avec un stock de 0 et une teinte normalisée", async () => {
    const g = await creerBanc().gestionnaire();
    const donnees = filament({ marque: "  Marque  A ", fournisseur: "Fournisseur A" });
    const r = await creer(g, donnees);
    expect(r).toMatchObject({
      type: "filament",
      materiau: donnees.materiau,
      couleur: "Rouge",
      teinte: "#C9402D",
      marque: "Marque A",
      diametre_mm: 1.75,
      epaisseur_mm: null,
      longueur_mm: null,
      largeur_mm: null,
      fournisseur: "Fournisseur A",
      seuil: 2,
      cible: 6,
      actif: true,
      stock: 0,
    });
  });

  it("crée une plaque, avec une épaisseur décimale et sans marque ni fournisseur", async () => {
    const g = await creerBanc().gestionnaire();
    const r = await creer(g, plaque({ epaisseur_mm: 2.5 }));
    expect(r).toMatchObject({
      type: "plaque",
      diametre_mm: null,
      epaisseur_mm: 2.5,
      longueur_mm: 600,
      largeur_mm: 400,
      marque: null,
      fournisseur: null,
      stock: 0,
    });
  });

  it("ignore les dimensions qui ne concernent pas le type", async () => {
    const g = await creerBanc().gestionnaire();
    const r = await creer(g, filament({ epaisseur_mm: 3, longueur_mm: 600, largeur_mm: 400 }));
    expect(r).toMatchObject({ epaisseur_mm: null, longueur_mm: null, largeur_mm: null });
  });

  it.each([
    ["type inconnu", { type: "resine" }, "type"],
    ["matériau vide", { materiau: "  " }, "materiau"],
    ["matériau trop long", { materiau: "x".repeat(61) }, "materiau"],
    ["teinte invalide", { teinte: "rouge" }, "teinte"],
    ["teinte trop courte", { teinte: "#FFF" }, "teinte"],
    ["diamètre non prévu", { diametre_mm: 2 }, "diametre_mm"],
    ["diamètre absent", { diametre_mm: undefined }, "diametre_mm"],
    ["seuil négatif", { seuil: -1 }, "seuil"],
    ["seuil non entier", { seuil: 1.5 }, "seuil"],
    ["seuil en texte", { seuil: "2" }, "seuil"],
    ["cible absente", { cible: undefined }, "cible"],
    ["cible démesurée", { cible: 10000 }, "cible"],
  ])("refuse un filament : %s", async (_cas, surcharge, champ) => {
    const g = await creerBanc().gestionnaire();
    const r = await g("POST", "/api/administration/references", filament(surcharge));
    expect(r.statut).toBe(400);
    expect(r.corps).toMatchObject({ code: "CHAMP_INVALIDE", champ });
  });

  it.each([
    ["épaisseur absente", { epaisseur_mm: undefined }, "epaisseur_mm"],
    ["épaisseur nulle", { epaisseur_mm: 0 }, "epaisseur_mm"],
    ["épaisseur démesurée", { epaisseur_mm: 101 }, "epaisseur_mm"],
    ["longueur absente", { longueur_mm: undefined }, "longueur_mm"],
    ["largeur non entière", { largeur_mm: 400.5 }, "largeur_mm"],
    ["largeur nulle", { largeur_mm: 0 }, "largeur_mm"],
  ])("refuse une plaque : %s", async (_cas, surcharge, champ) => {
    const g = await creerBanc().gestionnaire();
    const r = await g("POST", "/api/administration/references", plaque(surcharge));
    expect(r.statut).toBe(400);
    expect(r.corps).toMatchObject({ code: "CHAMP_INVALIDE", champ });
  });

  it("refuse un doublon, même avec une casse différente, mais accepte une autre épaisseur", async () => {
    const g = await creerBanc().gestionnaire();
    const donnees = plaque();
    await creer(g, donnees);
    const doublon = await g("POST", "/api/administration/references", {
      ...donnees,
      materiau: donnees.materiau.toUpperCase(),
      seuil: 1,
      cible: 2,
    });
    expect(doublon.statut).toBe(409);
    expect(doublon.corps.code).toBe("REFERENCE_DEJA_EXISTANTE");
    await creer(g, { ...donnees, epaisseur_mm: 5 });
  });
});

describe("règle 5 : niveau cible supérieur ou égal au seuil", () => {
  it("refuse une cible inférieure au seuil à la création", async () => {
    const g = await creerBanc().gestionnaire();
    const r = await g("POST", "/api/administration/references", filament({ seuil: 5, cible: 4 }));
    expect(r.statut).toBe(400);
    expect(r.corps).toMatchObject({
      champ: "cible",
      erreur: "Le niveau cible doit être supérieur ou égal au seuil d'alerte.",
    });
  });

  it("accepte une cible égale au seuil", async () => {
    const g = await creerBanc().gestionnaire();
    expect(await creer(g, filament({ seuil: 4, cible: 4 }))).toMatchObject({ seuil: 4, cible: 4 });
  });

  it("refuse de monter le seuil au-dessus de la cible, ou de descendre la cible sous le seuil", async () => {
    const g = await creerBanc().gestionnaire();
    const ref = await creer(g, filament({ seuil: 2, cible: 6 }));
    const chemin = `/api/administration/references/${ref.id}`;
    expect((await g("PATCH", chemin, { seuil: 7 })).statut).toBe(400);
    expect((await g("PATCH", chemin, { cible: 1 })).statut).toBe(400);
    // Les deux ensemble, cohérents, sont acceptés.
    expect((await g("PATCH", chemin, { seuil: 7, cible: 9 })).corps.reference).toMatchObject({ seuil: 7, cible: 9 });
  });
});

describe("références : modification et désactivation", () => {
  it("ne change que les champs envoyés", async () => {
    const g = await creerBanc().gestionnaire();
    const ref = await creer(g, filament({ fournisseur: "Fournisseur A" }));
    const r = await g("PATCH", `/api/administration/references/${ref.id}`, { couleur: "Rouge vif", teinte: "#ff0000" });
    expect(r.statut).toBe(200);
    expect(r.corps.reference).toEqual({ ...ref, couleur: "Rouge vif", teinte: "#FF0000" });
  });

  it("efface la marque ou le fournisseur quand on envoie un texte vide", async () => {
    const g = await creerBanc().gestionnaire();
    const ref = await creer(g, filament({ marque: "Marque A", fournisseur: "Fournisseur A" }));
    const r = await g("PATCH", `/api/administration/references/${ref.id}`, { marque: "", fournisseur: null });
    expect(r.corps.reference).toMatchObject({ marque: null, fournisseur: null });
  });

  it("refuse de changer le type d'une référence", async () => {
    const g = await creerBanc().gestionnaire();
    const ref = await creer(g, filament());
    const r = await g("PATCH", `/api/administration/references/${ref.id}`, { type: "plaque" });
    expect(r.statut).toBe(400);
    expect(r.corps.champ).toBe("type");
  });

  it("refuse de modifier une référence jusqu'à en faire un doublon", async () => {
    const g = await creerBanc().gestionnaire();
    const a = await creer(g, filament());
    const b = await creer(g, filament());
    const r = await g("PATCH", `/api/administration/references/${b.id}`, { materiau: a.materiau });
    expect(r.statut).toBe(409);
  });

  it("répond 404 pour une référence inconnue", async () => {
    const g = await creerBanc().gestionnaire();
    expect((await g("PATCH", "/api/administration/references/999999", { seuil: 1 })).statut).toBe(404);
  });
});

describe("règle 4 : une référence se désactive, elle ne se supprime pas", () => {
  it("il n'existe aucune route de suppression", async () => {
    const g = await creerBanc().gestionnaire();
    const ref = await creer(g, filament());
    expect((await g("DELETE", `/api/administration/references/${ref.id}`)).statut).toBe(404);
    const liste = (await g("GET", "/api/administration/references")).corps.references as any[];
    expect(liste.some((r) => r.id === ref.id)).toBe(true);
  });

  it("une référence désactivée disparaît des listes de saisie, garde son stock et son historique, puis se réactive", async () => {
    const banc = creerBanc();
    const enseignant = await banc.enseignant();
    const g = await banc.gestionnaire();
    const ref = await creer(g, filament());
    const base = baseDeTest();
    await insererMouvement(base, { material_id: ref.id, nature: "entree", quantite: 4, delta: 4, teacher_id: enseignantId });

    const enSaisie = async () =>
      ((await enseignant("GET", "/api/references")).corps.references as any[]).find((r) => r.id === ref.id);
    expect(await enSaisie()).toMatchObject({ stock: 4, actif: true });

    const r = await g("PATCH", `/api/administration/references/${ref.id}`, { actif: false });
    expect(r.corps.reference).toMatchObject({ actif: false, stock: 4 });
    expect(await enSaisie()).toBeUndefined();
    const admin = (await g("GET", "/api/administration/references")).corps.references as any[];
    expect(admin.find((x) => x.id === ref.id)).toMatchObject({ actif: false, stock: 4 });
    const historique = await base.premier<{ n: number }>("SELECT COUNT(*) AS n FROM movement WHERE material_id = ?", [
      ref.id,
    ]);
    expect(historique!.n).toBe(1);

    await g("PATCH", `/api/administration/references/${ref.id}`, { actif: true });
    expect(await enSaisie()).toMatchObject({ stock: 4, actif: true });
  });
});

describe("références : stock et ordre d'affichage", () => {
  it("le stock affiché est la somme des mouvements", async () => {
    const g = await creerBanc().gestionnaire();
    const ref = await creer(g, plaque());
    const base = baseDeTest();
    await insererMouvement(base, { material_id: ref.id, nature: "entree", quantite: 14, delta: 14, teacher_id: enseignantId });
    await insererMouvement(base, {
      material_id: ref.id,
      nature: "correction",
      quantite: -3,
      delta: -3,
      teacher_id: enseignantId,
      commentaire: "Inventaire",
    });
    const liste = (await g("GET", "/api/administration/references")).corps.references as any[];
    expect(liste.find((r) => r.id === ref.id).stock).toBe(11);
  });

  it("classe le filament avant les plaques, puis par matériau, couleur et épaisseur", async () => {
    const g = await creerBanc().gestionnaire();
    const n = ++compteur;
    const ids = [
      (await creer(g, plaque({ materiau: `Tri${n} MDF`, epaisseur_mm: 5 }))).id,
      (await creer(g, plaque({ materiau: `Tri${n} MDF`, epaisseur_mm: 3 }))).id,
      (await creer(g, filament({ materiau: `Tri${n} PLA`, couleur: "Noir" }))).id,
      (await creer(g, filament({ materiau: `Tri${n} PLA`, couleur: "Blanc" }))).id,
      (await creer(g, filament({ materiau: `Tri${n} ABS`, couleur: "Vert" }))).id,
    ];
    const ordre = ((await g("GET", "/api/administration/references")).corps.references as any[])
      .filter((r) => ids.includes(r.id))
      .map((r) => `${r.materiau.split(" ")[1]} ${r.couleur}${r.epaisseur_mm ?? ""}`);
    expect(ordre).toEqual(["ABS Vert", "PLA Blanc", "PLA Noir", "MDF 3", "MDF 5"]);
  });
});

describe("machines", () => {
  async function ajouter(g: Client, nom: string, type = "filament") {
    const r = await g("POST", "/api/administration/machines", { nom, type });
    expect(r.statut, JSON.stringify(r.corps)).toBe(201);
    return r.corps.machine as { id: number; nom: string; type: string; actif: boolean };
  }

  it("crée une machine pour chaque type de matière", async () => {
    const g = await creerBanc().gestionnaire();
    const nom = unique("Découpeuse laser");
    expect(await ajouter(g, `  ${nom} `, "plaque")).toMatchObject({ nom, type: "plaque", actif: true });
  });

  it("refuse un nom vide, un type inconnu ou un doublon", async () => {
    const g = await creerBanc().gestionnaire();
    expect((await g("POST", "/api/administration/machines", { nom: "", type: "filament" })).statut).toBe(400);
    expect((await g("POST", "/api/administration/machines", { nom: unique("Fraiseuse"), type: "bois" })).statut).toBe(400);
    const nom = unique("Imprimante");
    await ajouter(g, nom);
    const r = await g("POST", "/api/administration/machines", { nom: nom.toUpperCase(), type: "plaque" });
    expect(r.statut).toBe(409);
    expect(r.corps.code).toBe("NOM_DEJA_UTILISE");
  });

  it("renomme, désactive et réactive ; une machine désactivée disparaît de la liste de saisie", async () => {
    const banc = creerBanc();
    const enseignant = await banc.enseignant();
    const g = await banc.gestionnaire();
    const m = await ajouter(g, unique("Imprimante"));
    const enSaisie = async () =>
      ((await enseignant("GET", "/api/machines")).corps.machines as any[]).some((x) => x.id === m.id);

    const nouveau = unique("Imprimante renommée");
    expect((await g("PATCH", `/api/administration/machines/${m.id}`, { nom: nouveau })).corps.machine.nom).toBe(nouveau);
    expect(await enSaisie()).toBe(true);
    await g("PATCH", `/api/administration/machines/${m.id}`, { actif: false });
    expect(await enSaisie()).toBe(false);
    const admin = (await g("GET", "/api/administration/machines")).corps.machines as any[];
    expect(admin.find((x) => x.id === m.id)).toMatchObject({ nom: nouveau, actif: false });
    await g("PATCH", `/api/administration/machines/${m.id}`, { actif: true });
    expect(await enSaisie()).toBe(true);
  });

  it("le type peut changer tant que la machine n'a servi à aucun prélèvement, plus ensuite", async () => {
    const g = await creerBanc().gestionnaire();
    const m = await ajouter(g, unique("Machine"), "plaque");
    expect((await g("PATCH", `/api/administration/machines/${m.id}`, { type: "filament" })).corps.machine.type).toBe(
      "filament",
    );

    const ref = await creer(g, filament());
    const base = baseDeTest();
    await insererMouvement(base, { material_id: ref.id, nature: "entree", quantite: 2, delta: 2, teacher_id: enseignantId });
    await insererMouvement(base, {
      material_id: ref.id,
      nature: "prelevement",
      quantite: 1,
      delta: -1,
      teacher_id: enseignantId,
      machine_id: m.id,
      projet: "Terminale STI2D",
    });
    const r = await g("PATCH", `/api/administration/machines/${m.id}`, { type: "plaque" });
    expect(r.statut).toBe(409);
    expect(r.corps.code).toBe("MACHINE_UTILISEE");
    // Le renommage reste possible.
    expect((await g("PATCH", `/api/administration/machines/${m.id}`, { nom: unique("Machine renommée") })).statut).toBe(200);
  });

  it("il n'existe aucune route de suppression, et 404 pour une machine inconnue", async () => {
    const g = await creerBanc().gestionnaire();
    const m = await ajouter(g, unique("Imprimante"));
    expect((await g("DELETE", `/api/administration/machines/${m.id}`)).statut).toBe(404);
    expect((await g("PATCH", "/api/administration/machines/999999", { actif: false })).statut).toBe(404);
  });

  it("classe les machines dans l'ordre naturel (2 avant 10)", async () => {
    const g = await creerBanc().gestionnaire();
    const n = ++compteur;
    for (const nom of [`Tri${n} imprimante 10`, `Tri${n} imprimante 2`, `Tri${n} imprimante 1`]) await ajouter(g, nom);
    const noms = ((await g("GET", "/api/administration/machines")).corps.machines as any[])
      .map((m) => m.nom)
      .filter((nom: string) => nom.startsWith(`Tri${n} `));
    expect(noms).toEqual([`Tri${n} imprimante 1`, `Tri${n} imprimante 2`, `Tri${n} imprimante 10`]);
  });
});
