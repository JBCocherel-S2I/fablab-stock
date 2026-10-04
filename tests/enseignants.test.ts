// Bloc 2 : liste des enseignants (4.4, 5.8).

import { beforeEach, describe, expect, it } from "vitest";
import { creerBanc, viderAcces, type Client } from "./client";
import { baseDeTest, creerFilament, insererMouvement } from "./outils";

beforeEach(viderAcces);

// Les enseignants ne se suppriment pas : chaque test utilise des noms qui lui sont propres.
let compteur = 0;
const nomUnique = (prefixe: string) => `${prefixe} ${++compteur}`;

async function ajouter(g: Client, nom: string) {
  const r = await g("POST", "/api/administration/enseignants", { nom });
  expect(r.statut).toBe(201);
  return r.corps.enseignant as { id: number; nom: string; actif: boolean };
}

describe("contrôle d'accès côté serveur", () => {
  it("la liste de saisie exige une session", async () => {
    const banc = creerBanc();
    expect((await banc.client()("GET", "/api/enseignants")).statut).toBe(401);
    const enseignant = await banc.enseignant();
    expect((await enseignant("GET", "/api/enseignants")).statut).toBe(200);
  });

  it("la gestion de la liste est refusée sans le code gestionnaire", async () => {
    const banc = creerBanc();
    // L'enseignant d'abord : définir le code commun déconnecte les autres appareils.
    const enseignant = await banc.enseignant();
    const g = await banc.gestionnaire();
    const cible = await ajouter(g, nomUnique("Protégé"));
    const anonyme = banc.client("192.0.2.9");

    const actions: [string, string, unknown?][] = [
      ["GET", "/api/administration/enseignants"],
      ["POST", "/api/administration/enseignants", { nom: nomUnique("Intrus") }],
      ["PATCH", `/api/administration/enseignants/${cible.id}`, { nom: nomUnique("Renommé") }],
      ["PATCH", `/api/administration/enseignants/${cible.id}`, { actif: false }],
    ];
    for (const [methode, chemin, corps] of actions) {
      expect((await anonyme(methode, chemin, corps)).statut).toBe(401);
      expect((await enseignant(methode, chemin, corps)).statut).toBe(403);
    }

    const liste = (await g("GET", "/api/administration/enseignants")).corps.enseignants as typeof cible[];
    expect(liste.find((e) => e.id === cible.id)).toEqual(cible);
    expect(liste.some((e) => e.nom.startsWith("Intrus"))).toBe(false);
  });
});

describe("gestion de la liste", () => {
  it("ajoute un nom, nettoyé de ses espaces superflus", async () => {
    const g = await creerBanc().gestionnaire();
    const nom = nomUnique("Lefèvre");
    const cree = await ajouter(g, `  ${nom.replace(" ", "   ")}  `);
    expect(cree).toMatchObject({ nom, actif: true });
  });

  it("refuse un nom vide ou trop long", async () => {
    const g = await creerBanc().gestionnaire();
    for (const nom of ["", "   ", "x".repeat(61), 42, null]) {
      const r = await g("POST", "/api/administration/enseignants", { nom });
      expect(r.statut).toBe(400);
      expect(r.corps.code).toBe("NOM_INVALIDE");
    }
  });

  it("refuse un doublon, même avec une casse ou des accents différents", async () => {
    const g = await creerBanc().gestionnaire();
    const n = ++compteur;
    await ajouter(g, `Bérénice ${n}`);
    for (const nom of [`Bérénice ${n}`, `bérénice ${n}`, `BERENICE ${n}`]) {
      const r = await g("POST", "/api/administration/enseignants", { nom });
      expect(r.statut).toBe(409);
      expect(r.corps.code).toBe("NOM_DEJA_UTILISE");
    }
  });

  it("renomme, et refuse de prendre le nom d'un autre", async () => {
    const g = await creerBanc().gestionnaire();
    const a = await ajouter(g, nomUnique("Martin"));
    const b = await ajouter(g, nomUnique("Bernard"));
    const nouveau = nomUnique("Martin-Durand");
    const r = await g("PATCH", `/api/administration/enseignants/${a.id}`, { nom: nouveau });
    expect(r.corps.enseignant).toEqual({ id: a.id, nom: nouveau, actif: true });
    expect((await g("PATCH", `/api/administration/enseignants/${b.id}`, { nom: nouveau })).statut).toBe(409);
    // Changer seulement la casse de son propre nom est permis.
    expect(
      (await g("PATCH", `/api/administration/enseignants/${a.id}`, { nom: nouveau.toUpperCase() })).statut,
    ).toBe(200);
  });

  it("un nom désactivé disparaît du sélecteur mais reste dans l'administration, puis se réactive", async () => {
    const banc = creerBanc();
    const enseignant = await banc.enseignant();
    const g = await banc.gestionnaire();
    const e = await ajouter(g, nomUnique("Petit"));
    const selecteur = async () =>
      ((await enseignant("GET", "/api/enseignants")).corps.enseignants as { id: number }[]).some((x) => x.id === e.id);

    expect(await selecteur()).toBe(true);
    await g("PATCH", `/api/administration/enseignants/${e.id}`, { actif: false });
    expect(await selecteur()).toBe(false);
    const admin = (await g("GET", "/api/administration/enseignants")).corps.enseignants as (typeof e)[];
    expect(admin.find((x) => x.id === e.id)).toMatchObject({ actif: false });

    await g("PATCH", `/api/administration/enseignants/${e.id}`, { actif: true });
    expect(await selecteur()).toBe(true);
  });

  it("trie la liste par ordre alphabétique français", async () => {
    const g = await creerBanc().gestionnaire();
    const n = ++compteur;
    for (const nom of [`Zola ${n}`, `Émond ${n}`, `Dupont ${n}`, `Fabre ${n}`]) await ajouter(g, nom);
    const noms = ((await g("GET", "/api/administration/enseignants")).corps.enseignants as { nom: string }[])
      .map((e) => e.nom)
      .filter((nom) => nom.endsWith(` ${n}`));
    expect(noms).toEqual([`Dupont ${n}`, `Émond ${n}`, `Fabre ${n}`, `Zola ${n}`]);
  });

  it("répond 404 pour un enseignant inconnu ou un identifiant invalide", async () => {
    const g = await creerBanc().gestionnaire();
    expect((await g("PATCH", "/api/administration/enseignants/999999", { actif: false })).statut).toBe(404);
    expect((await g("PATCH", "/api/administration/enseignants/abc", { actif: false })).statut).toBe(404);
  });

  it("refuse une valeur « actif » qui n'est pas un booléen", async () => {
    const g = await creerBanc().gestionnaire();
    const e = await ajouter(g, nomUnique("Roux"));
    expect((await g("PATCH", `/api/administration/enseignants/${e.id}`, { actif: "non" })).statut).toBe(400);
  });
});

describe("le renommage s'applique à l'historique (5.8)", () => {
  it("un mouvement déjà enregistré affiche le nouveau nom, même après désactivation", async () => {
    const g = await creerBanc().gestionnaire();
    const e = await ajouter(g, nomUnique("Ancien nom"));
    const base = baseDeTest();
    const ref = await creerFilament(base);
    const mouvement = await insererMouvement(base, {
      material_id: ref,
      nature: "entree",
      quantite: 2,
      delta: 2,
      teacher_id: e.id,
    });

    const nouveau = nomUnique("Nouveau nom");
    await g("PATCH", `/api/administration/enseignants/${e.id}`, { nom: nouveau, actif: false });

    const ligne = await base.premier<{ nom: string }>(
      "SELECT t.nom FROM movement v JOIN teacher t ON t.id = v.teacher_id WHERE v.id = ?",
      [mouvement],
    );
    expect(ligne!.nom).toBe(nouveau);
  });
});
