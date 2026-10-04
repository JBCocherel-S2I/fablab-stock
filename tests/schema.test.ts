// Bloc 1 : le schéma de base de données garantit lui-même les invariants
// des sections 4 et 6, quel que soit le code qui écrit dedans.

import { beforeAll, describe, expect, it } from "vitest";
import type { Base } from "../src/donnees/base";
import { lireEtatBase, TABLES_ATTENDUES } from "../src/donnees/etat";
import { stockDeReference, stockParReference } from "../src/donnees/stock";
import {
  baseDeTest,
  creerEnseignant,
  creerFilament,
  creerMachine,
  creerPlaque,
  insererMouvement,
} from "./outils";

let base: Base;
let enseignant: number;
let imprimante: number;

beforeAll(async () => {
  base = baseDeTest();
  enseignant = await creerEnseignant(base, "Dupont (schéma)");
  imprimante = await creerMachine(base, "Imprimante (schéma)", "filament");
});

function prelevement(material_id: number, quantite: number) {
  return insererMouvement(base, {
    material_id,
    nature: "prelevement",
    quantite,
    delta: -quantite,
    teacher_id: enseignant,
    machine_id: imprimante,
    projet: "Terminale STI2D",
  });
}

function entree(material_id: number, quantite: number) {
  return insererMouvement(base, {
    material_id,
    nature: "entree",
    quantite,
    delta: quantite,
    teacher_id: enseignant,
  });
}

describe("migrations", () => {
  it("créent toutes les tables attendues", async () => {
    const etat = await lireEtatBase(base);
    expect(etat.accessible).toBe(true);
    expect(etat.manquantes).toEqual([]);
    expect(etat.tables).toEqual([...TABLES_ATTENDUES]);
  });
});

describe("stock = somme des mouvements (4.2)", () => {
  it("vaut 0 pour une référence sans mouvement", async () => {
    const ref = await creerFilament(base);
    expect(await stockDeReference(base, ref)).toBe(0);
  });

  it("renvoie null pour une référence inexistante", async () => {
    expect(await stockDeReference(base, 999_999)).toBeNull();
  });

  it("additionne entrées, prélèvements, corrections et annulations", async () => {
    const ref = await creerFilament(base);
    await entree(ref, 10); // 10
    const p = await prelevement(ref, 3); // 7
    await insererMouvement(base, {
      material_id: ref,
      nature: "correction",
      quantite: -2,
      delta: -2,
      teacher_id: enseignant,
      commentaire: "Inventaire",
    }); // 5
    await insererMouvement(base, {
      material_id: ref,
      nature: "annulation",
      quantite: 3,
      delta: 3,
      teacher_id: enseignant,
      mouvement_annule_id: p,
    }); // 8
    expect(await stockDeReference(base, ref)).toBe(8);
  });

  it("ne mélange pas les références entre elles", async () => {
    const a = await creerFilament(base);
    const b = await creerPlaque(base);
    await entree(a, 4);
    await entree(b, 9);
    const stocks = await stockParReference(base);
    expect(stocks.find((s) => s.material_id === a)?.stock).toBe(4);
    expect(stocks.find((s) => s.material_id === b)?.stock).toBe(9);
  });
});

describe("règle 1 : un stock ne peut pas devenir négatif", () => {
  it("refuse un prélèvement supérieur au stock", async () => {
    const ref = await creerFilament(base);
    await entree(ref, 2);
    await expect(prelevement(ref, 3)).rejects.toThrow(/REGLE_1/);
    expect(await stockDeReference(base, ref)).toBe(2);
  });

  it("refuse un prélèvement sur un stock nul", async () => {
    const ref = await creerFilament(base);
    await expect(prelevement(ref, 1)).rejects.toThrow(/REGLE_1/);
  });

  it("accepte un prélèvement égal au stock", async () => {
    const ref = await creerFilament(base);
    await entree(ref, 2);
    await prelevement(ref, 2);
    expect(await stockDeReference(base, ref)).toBe(0);
  });

  it("refuse une correction qui rendrait le stock négatif", async () => {
    const ref = await creerFilament(base);
    await entree(ref, 1);
    await expect(
      insererMouvement(base, {
        material_id: ref,
        nature: "correction",
        quantite: -2,
        delta: -2,
        teacher_id: enseignant,
        commentaire: "Inventaire",
      }),
    ).rejects.toThrow(/REGLE_1/);
  });
});

describe("règle 2 : aucun mouvement n'est modifié ni supprimé", () => {
  it("refuse la modification d'un mouvement", async () => {
    const ref = await creerFilament(base);
    const id = await entree(ref, 5);
    await expect(
      base.executer("UPDATE movement SET quantite = 50, delta = 50 WHERE id = ?", [id]),
    ).rejects.toThrow(/REGLE_2/);
    expect(await stockDeReference(base, ref)).toBe(5);
  });

  it("refuse la suppression d'un mouvement", async () => {
    const ref = await creerFilament(base);
    const id = await entree(ref, 5);
    await expect(base.executer("DELETE FROM movement WHERE id = ?", [id])).rejects.toThrow(/REGLE_2/);
    expect(await stockDeReference(base, ref)).toBe(5);
  });

  it("refuse d'annuler deux fois le même mouvement", async () => {
    const ref = await creerFilament(base);
    await entree(ref, 5);
    const p = await prelevement(ref, 1);
    const annulation = {
      material_id: ref,
      nature: "annulation",
      quantite: 1,
      delta: 1,
      teacher_id: enseignant,
      mouvement_annule_id: p,
    };
    await insererMouvement(base, annulation);
    await expect(insererMouvement(base, annulation)).rejects.toThrow(/UNIQUE/);
    expect(await stockDeReference(base, ref)).toBe(5);
  });
});

describe("règle 4 : une référence se désactive, elle ne se supprime pas", () => {
  it("refuse la suppression d'une référence", async () => {
    const ref = await creerFilament(base);
    await expect(base.executer("DELETE FROM material WHERE id = ?", [ref])).rejects.toThrow(/REGLE_4/);
  });

  it("accepte la désactivation et conserve l'historique", async () => {
    const ref = await creerFilament(base);
    await entree(ref, 3);
    await base.executer("UPDATE material SET actif = 0 WHERE id = ?", [ref]);
    expect(await stockDeReference(base, ref)).toBe(3);
  });

  it("refuse la suppression d'un enseignant ou d'une machine", async () => {
    await expect(base.executer("DELETE FROM teacher WHERE id = ?", [enseignant])).rejects.toThrow();
    await expect(base.executer("DELETE FROM machine WHERE id = ?", [imprimante])).rejects.toThrow();
  });
});

describe("règle 5 : niveau cible supérieur ou égal au seuil", () => {
  it("refuse une cible inférieure au seuil à la création", async () => {
    await expect(creerFilament(base, 5, 4)).rejects.toThrow(/CHECK/);
  });

  it("accepte une cible égale au seuil", async () => {
    await expect(creerFilament(base, 4, 4)).resolves.toBeGreaterThan(0);
  });

  it("refuse une cible inférieure au seuil à la modification", async () => {
    const ref = await creerFilament(base, 2, 6);
    await expect(base.executer("UPDATE material SET seuil = 7 WHERE id = ?", [ref])).rejects.toThrow(
      /CHECK/,
    );
  });
});

describe("cohérence d'un mouvement (4.2)", () => {
  it("refuse un prélèvement sans machine", async () => {
    const ref = await creerFilament(base);
    await entree(ref, 5);
    await expect(
      insererMouvement(base, {
        material_id: ref,
        nature: "prelevement",
        quantite: 1,
        delta: -1,
        teacher_id: enseignant,
        projet: "Terminale STI2D",
      }),
    ).rejects.toThrow(/CHECK/);
  });

  it("refuse un prélèvement sans projet ou classe", async () => {
    const ref = await creerFilament(base);
    await entree(ref, 5);
    await expect(
      insererMouvement(base, {
        material_id: ref,
        nature: "prelevement",
        quantite: 1,
        delta: -1,
        teacher_id: enseignant,
        machine_id: imprimante,
        projet: "   ",
      }),
    ).rejects.toThrow(/CHECK/);
  });

  it("refuse une quantité nulle ou négative pour une entrée", async () => {
    const ref = await creerFilament(base);
    // Stock préalable : le refus doit venir de la quantité, pas de la règle 1.
    await entree(ref, 5);
    for (const quantite of [0, -1]) {
      await expect(
        insererMouvement(base, {
          material_id: ref,
          nature: "entree",
          quantite,
          delta: quantite,
          teacher_id: enseignant,
        }),
      ).rejects.toThrow(/CHECK/);
    }
  });

  it("refuse un prélèvement dont l'effet sur le stock serait positif", async () => {
    const ref = await creerFilament(base);
    await expect(
      insererMouvement(base, {
        material_id: ref,
        nature: "prelevement",
        quantite: 1,
        delta: 1,
        teacher_id: enseignant,
        machine_id: imprimante,
        projet: "Terminale STI2D",
      }),
    ).rejects.toThrow(/CHECK/);
  });

  it("refuse une correction sans commentaire", async () => {
    const ref = await creerFilament(base);
    await expect(
      insererMouvement(base, {
        material_id: ref,
        nature: "correction",
        quantite: 2,
        delta: 2,
        teacher_id: enseignant,
      }),
    ).rejects.toThrow(/CHECK/);
  });

  it("refuse une nature inconnue", async () => {
    const ref = await creerFilament(base);
    await expect(
      insererMouvement(base, {
        material_id: ref,
        nature: "don",
        quantite: 1,
        delta: 1,
        teacher_id: enseignant,
      }),
    ).rejects.toThrow(/CHECK/);
  });

  it("refuse un mouvement sur une référence ou un enseignant inexistant", async () => {
    const ref = await creerFilament(base);
    await expect(
      insererMouvement(base, {
        material_id: 999_999,
        nature: "entree",
        quantite: 1,
        delta: 1,
        teacher_id: enseignant,
      }),
    ).rejects.toThrow(/FOREIGN KEY/);
    await expect(
      insererMouvement(base, {
        material_id: ref,
        nature: "entree",
        quantite: 1,
        delta: 1,
        teacher_id: 999_999,
      }),
    ).rejects.toThrow(/FOREIGN KEY/);
  });
});

describe("cohérence d'une référence (4.1)", () => {
  it("refuse un filament sans diamètre", async () => {
    await expect(
      base.executer(
        `INSERT INTO material (type, materiau, teinte, seuil, cible)
         VALUES ('filament', 'PLA', '#000000', 1, 2)`,
      ),
    ).rejects.toThrow(/CHECK/);
  });

  it("refuse une plaque sans épaisseur ni format", async () => {
    await expect(
      base.executer(
        `INSERT INTO material (type, materiau, teinte, seuil, cible)
         VALUES ('plaque', 'MDF', '#000000', 1, 2)`,
      ),
    ).rejects.toThrow(/CHECK/);
  });

  it("refuse un type inconnu", async () => {
    await expect(
      base.executer(
        `INSERT INTO material (type, materiau, teinte, diametre_mm, seuil, cible)
         VALUES ('resine', 'PLA', '#000000', 1.75, 1, 2)`,
      ),
    ).rejects.toThrow(/CHECK/);
  });
});

describe("écritures groupées", () => {
  it("n'enregistrent rien si l'une d'elles échoue", async () => {
    const ref = await creerFilament(base);
    const sql = `INSERT INTO movement (cree_le, material_id, nature, quantite, delta, teacher_id)
                 VALUES ('2026-10-03T08:00:00.000Z', ?, 'entree', ?, ?, ?)`;
    await expect(
      base.lot([
        { sql, parametres: [ref, 5, 5, enseignant] },
        { sql, parametres: [ref, 0, 0, enseignant] },
      ]),
    ).rejects.toThrow();
    expect(await stockDeReference(base, ref)).toBe(0);
  });
});
