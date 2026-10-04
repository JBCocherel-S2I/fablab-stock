// Administration : catalogue des références de matière (4.1, 5.7).

import { appeler } from "../api.js";
import { champ, h } from "../dom.js";
import { TYPES, ecrireNombre, libelleReference, lireNombre, pastilleTeinte, specification } from "../matiere.js";
import { afficherListe, champSegment } from "./liste.js";

const MATERIAUX = {
  filament: ["PLA", "PETG", "ABS", "TPU"],
  plaque: ["Contreplaqué", "MDF", "PMMA", "Carton"],
};
const TEINTE_PAR_DEFAUT = { filament: "#2A2D34", plaque: "#C9A36B" };

/** Champ de teinte : pastille cliquable (sélecteur de couleur) et code saisissable. */
function champTeinte(type, valeur) {
  const code = champ(
    "Teinte d'affichage",
    { name: "teinte", type: "text", required: true, maxlength: 7, autocomplete: "off", spellcheck: "false", value: valeur },
    "La couleur réelle de la matière, pour la pastille et le pictogramme du casier.",
  );
  const nuancier = h("input", {
    type: "color",
    class: `nuancier nuancier--${type}`,
    value: /^#[0-9a-f]{6}$/i.test(valeur) ? valeur : "#000000",
    "aria-label": "Choisir la teinte d'affichage",
  });
  nuancier.addEventListener("input", () => (code.saisie.value = nuancier.value.toUpperCase()));
  code.saisie.addEventListener("input", () => {
    if (/^#[0-9a-f]{6}$/i.test(code.saisie.value.trim())) nuancier.value = code.saisie.value.trim();
  });
  const ligne = h("div", { class: "champ-teinte" });
  code.saisie.replaceWith(ligne);
  ligne.append(nuancier, code.saisie);
  return code;
}

function champNombre(libelle, nom, valeur, attributs = {}) {
  return champ(libelle, {
    name: nom,
    type: "text",
    inputmode: "numeric",
    required: true,
    autocomplete: "off",
    value: ecrireNombre(valeur),
    ...attributs,
  });
}

function champsReference(reference) {
  const selecteurType = reference ? null : champSegment("Type", "type", TYPES, "filament");
  const zoneChamps = h("div", {});
  let lireChamps;

  function dessiner(type) {
    const r = reference ?? {};
    const idListe = `materiaux-${type}`;
    const materiau = champ("Matériau", {
      name: "materiau",
      type: "text",
      required: true,
      maxlength: 60,
      autocomplete: "off",
      list: idListe,
      value: r.materiau ?? "",
    });
    const couleur = champ(type === "filament" ? "Couleur" : "Couleur ou aspect", {
      name: "couleur",
      type: "text",
      maxlength: 60,
      autocomplete: "off",
      value: r.couleur ?? "",
    });
    const teinte = champTeinte(type, r.teinte ?? TEINTE_PAR_DEFAUT[type]);
    const marque = champ("Marque (facultatif)", { name: "marque", type: "text", maxlength: 60, value: r.marque ?? "" });
    const fournisseur = champ("Fournisseur (facultatif)", {
      name: "fournisseur",
      type: "text",
      maxlength: 60,
      value: r.fournisseur ?? "",
    });
    const seuil = champNombre("Seuil", "seuil", r.seuil);
    const cible = champNombre("Cible", "cible", r.cible);

    let dimensions;
    let lireDimensions;
    if (type === "filament") {
      const diametre = champSegment(
        "Diamètre",
        "diametre_mm",
        [
          { cle: "1.75", libelle: "1,75 mm" },
          { cle: "2.85", libelle: "2,85 mm" },
        ],
        String(r.diametre_mm ?? 1.75),
      );
      dimensions = diametre.bloc;
      lireDimensions = () => ({ diametre_mm: Number(diametre.lire()) });
    } else {
      const epaisseur = champNombre("Épaisseur (mm)", "epaisseur_mm", r.epaisseur_mm, { inputmode: "decimal" });
      const longueur = champNombre("Longueur (mm)", "longueur_mm", r.longueur_mm);
      const largeur = champNombre("Largeur (mm)", "largeur_mm", r.largeur_mm);
      dimensions = [epaisseur.bloc, h("div", { class: "deux-colonnes" }, longueur.bloc, largeur.bloc)];
      lireDimensions = () => ({
        epaisseur_mm: lireNombre(epaisseur.saisie.value),
        longueur_mm: lireNombre(longueur.saisie.value),
        largeur_mm: lireNombre(largeur.saisie.value),
      });
    }

    zoneChamps.replaceChildren(
      h("datalist", { id: idListe }, MATERIAUX[type].map((m) => h("option", { value: m }))),
      materiau.bloc,
      couleur.bloc,
      teinte.bloc,
      ...[dimensions].flat(),
      h("div", { class: "deux-colonnes" }, seuil.bloc, cible.bloc),
      h(
        "p",
        { class: "champ-aide champ-aide--bloc" },
        "Au seuil ou en dessous, la référence passe « À commander ». La cible est le stock visé après commande.",
      ),
      marque.bloc,
      fournisseur.bloc,
    );
    lireChamps = () => ({
      type,
      materiau: materiau.saisie.value,
      couleur: couleur.saisie.value,
      teinte: teinte.saisie.value.trim(),
      marque: marque.saisie.value,
      fournisseur: fournisseur.saisie.value,
      seuil: lireNombre(seuil.saisie.value),
      cible: lireNombre(cible.saisie.value),
      ...lireDimensions(),
    });
  }

  dessiner(reference?.type ?? "filament");
  selecteurType?.bloc.addEventListener("change", () => dessiner(selecteurType.lire()));

  return { blocs: [selecteurType?.bloc, zoneChamps], lire: () => lireChamps() };
}

export function afficherCatalogue(zone) {
  return afficherListe(zone, {
    charger: async () => (await appeler("GET", "/administration/references")).references,
    compte: (references) => {
      const actives = references.filter((r) => r.actif).length;
      return `${actives} référence${actives > 1 ? "s" : ""} active${actives > 1 ? "s" : ""}`;
    },
    libelleAjout: "+ Ajouter une référence",
    texteVide: "Le catalogue est vide. Ajoutez une première référence.",
    colonnes: [
      {
        titre: "Teinte",
        cellule: (r) => [pastilleTeinte(r.type, r.teinte), h("span", { class: "visuellement-cache" }, r.teinte)],
      },
      { titre: "Matière", classe: "nom", cellule: (r) => libelleReference(r) },
      { titre: "Spécification", cellule: (r) => specification(r) },
      { titre: "Seuil", cellule: (r) => String(r.seuil) },
      { titre: "Cible", cellule: (r) => String(r.cible) },
    ],
    nom: (r) => `${libelleReference(r)}, ${specification(r)}`,
    titrePanneau: (r) => (r ? `Modifier : ${libelleReference(r)}` : "Ajouter une référence"),
    champs: champsReference,
    enregistrer: async (r, valeurs) => {
      const { reference } = r
        ? await appeler("PATCH", `/administration/references/${r.id}`, valeurs)
        : await appeler("POST", "/administration/references", valeurs);
      const nom = libelleReference(reference);
      return r ? `Référence enregistrée : « ${nom} ».` : `« ${nom} » est ajoutée au catalogue.`;
    },
    basculer: async (r) => {
      await appeler("PATCH", `/administration/references/${r.id}`, { actif: !r.actif });
      return `« ${libelleReference(r)} » est ${r.actif ? "désactivée" : "réactivée"}.`;
    },
    aide: (r) =>
      r.actif
        ? `Stock actuel : ${r.stock}. Une référence désactivée disparaît des listes de saisie et de la liste à commander, mais reste dans l'historique.`
        : `Stock actuel : ${r.stock}. Cette référence est désactivée : elle n'est plus proposée à la saisie.`,
  });
}
