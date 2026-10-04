// Tableau de bord (5.2) : le stock présenté comme un rayonnage, une étagère par
// type de matière, un casier par référence. Une vue en liste est disponible
// d'un bouton, pour trier et comparer, et comme alternative accessible.

import { appeler } from "../api.js";
import { champ, h, remplacer } from "../dom.js";
import { libelleReference, specification } from "../matiere.js";
import { pictogramme } from "../pictogrammes.js";
import { champSegment } from "./liste.js";
import { unites } from "./saisie.js";

const ETAGERES = [
  { type: "filament", titre: "Étagère · Filament" },
  { type: "plaque", titre: "Étagère · Plaques" },
];
const TYPES_FILTRE = [
  { cle: "tout", libelle: "Tout" },
  { cle: "filament", libelle: "Filament" },
  { cle: "plaque", libelle: "Plaques" },
];
const VUES = [
  { cle: "casiers", libelle: "Casiers" },
  { cle: "liste", libelle: "Liste" },
];

// Les filtres sont conservés tant que la page reste ouverte ; la vue choisie
// est mémorisée sur l'appareil.
const filtres = { type: "tout", materiau: "", couleur: "", epaisseur: "", recherche: "" };
const tri = { colonne: "matiere", sens: 1 };

function vueMemorisee() {
  try {
    return localStorage.getItem("fablab.vue") === "liste" ? "liste" : "casiers";
  } catch {
    return "casiers";
  }
}

function memoriserVue(vue) {
  try {
    localStorage.setItem("fablab.vue", vue);
  } catch {
    // Sans stockage, la vue n'est simplement pas mémorisée.
  }
}

/** Une référence est à commander quand son stock est au seuil ou en dessous. */
export const aCommander = (r) => r.stock <= r.seuil;

const normaliser = (t) => t.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
const NOMBRE = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });

function filtrer(references) {
  const termes = normaliser(filtres.recherche).split(/\s+/).filter(Boolean);
  return references.filter((r) => {
    if (filtres.type !== "tout" && r.type !== filtres.type) return false;
    if (filtres.materiau && r.materiau !== filtres.materiau) return false;
    if (filtres.couleur && r.couleur !== filtres.couleur) return false;
    if (filtres.epaisseur && String(r.epaisseur_mm) !== filtres.epaisseur) return false;
    const texte = normaliser(`${libelleReference(r)} ${specification(r)} ${r.marque ?? ""}`);
    return termes.every((t) => texte.includes(t));
  });
}

// ---------- Casier ----------

function casier(r) {
  const bas = aCommander(r);
  const etat = bas ? "à commander" : "en stock";
  return h(
    "li",
    { class: "case" },
    h(
      "a",
      {
        class: "casier casier--stock",
        href: `#/prelever/${r.id}`,
        "data-etat": bas ? "alerte" : "ok",
        "aria-label": `${libelleReference(r)}, ${specification(r)}, ${r.stock} ${unites(r.type, r.stock)}, ${etat}. Prélever.`,
      },
      h(
        "span",
        { class: "etiquette" },
        h("span", { class: "casier-nom" }, libelleReference(r)),
        h("span", { class: "casier-spec" }, specification(r)),
      ),
      h(
        "span",
        { class: "casier-corps" },
        pictogramme(r),
        h(
          "span",
          { class: "casier-quantite" },
          h("strong", {}, String(r.stock)),
          h("span", {}, unites(r.type, r.stock)),
        ),
      ),
      // L'état est écrit en toutes lettres, avec un symbole et un contour : jamais la couleur seule.
      h("span", { class: "casier-etat" }, bas ? "! À commander" : "✓ En stock"),
    ),
  );
}

function vueCasiers(references) {
  return ETAGERES.map(({ type, titre }) => {
    const casiers = references.filter((r) => r.type === type);
    if (casiers.length === 0) return null;
    const id = `etagere-${type}`;
    return h(
      "section",
      { class: "etagere", "aria-labelledby": id },
      h("h2", { class: "etagere-titre", id }, h("span", {}, titre)),
      h("ul", { class: "rayon" }, casiers.map(casier)),
    );
  });
}

// ---------- Liste ----------

const COLONNES = [
  { cle: "matiere", titre: "Matière", valeur: (r) => `${r.type === "filament" ? 0 : 1} ${normaliser(libelleReference(r))}` },
  { cle: "specification", titre: "Spécification", valeur: (r) => r.diametre_mm ?? r.epaisseur_mm },
  { cle: "stock", titre: "Stock", valeur: (r) => r.stock },
  { cle: "etat", titre: "État", valeur: (r) => (aCommander(r) ? 0 : 1) },
];

function vueListe(references, redessiner) {
  const colonne = COLONNES.find((c) => c.cle === tri.colonne) ?? COLONNES[0];
  const triees = [...references].sort((a, b) => {
    const [x, y] = [colonne.valeur(a), colonne.valeur(b)];
    return (typeof x === "number" ? x - y : String(x).localeCompare(String(y), "fr", { numeric: true })) * tri.sens;
  });
  return h(
    "div",
    { class: "cadre-tableau" },
    h(
      "table",
      { class: "tableau tableau--stock" },
      h(
        "thead",
        {},
        h(
          "tr",
          {},
          h("th", { scope: "col" }, h("span", { class: "visuellement-cache" }, "Pictogramme")),
          COLONNES.map((c) =>
            h(
              "th",
              { scope: "col", "aria-sort": c.cle === tri.colonne ? (tri.sens > 0 ? "ascending" : "descending") : null },
              h(
                "button",
                {
                  type: "button",
                  class: "tri",
                  onclick: () => {
                    tri.sens = c.cle === tri.colonne ? -tri.sens : 1;
                    tri.colonne = c.cle;
                    redessiner();
                  },
                },
                c.titre,
                h("span", { "aria-hidden": "true" }, c.cle === tri.colonne ? (tri.sens > 0 ? " ▲" : " ▼") : ""),
              ),
            ),
          ),
          h("th", { scope: "col" }, h("span", { class: "visuellement-cache" }, "Action")),
        ),
      ),
      h(
        "tbody",
        {},
        triees.map((r) =>
          h(
            "tr",
            {},
            h("td", {}, pictogramme(r)),
            h("td", { class: "nom" }, libelleReference(r)),
            h("td", {}, specification(r)),
            h("td", { class: "nom" }, `${r.stock} ${unites(r.type, r.stock)}`),
            h(
              "td",
              {},
              h(
                "span",
                { class: `pastille-etat${aCommander(r) ? " pastille-etat--alerte" : ""}` },
                aCommander(r) ? "! À commander" : "✓ En stock",
              ),
            ),
            h(
              "td",
              { class: "cellule-action" },
              h(
                "a",
                { class: "bouton bouton--simple", href: `#/prelever/${r.id}` },
                "Prélever",
                h("span", { class: "visuellement-cache" }, ` ${libelleReference(r)}, ${specification(r)}`),
              ),
            ),
          ),
        ),
      ),
    ),
  );
}

// ---------- Filtres ----------

function selecteur(libelle, cle, valeurs, afficher = (v) => v, feminin = false) {
  const id = `filtre-${cle}`;
  const select = h(
    "select",
    { id, name: cle },
    h("option", { value: "" }, feminin ? "Toutes" : "Tous"),
    valeurs.map((v) => h("option", { value: v, selected: String(v) === filtres[cle] }, afficher(v))),
  );
  return { bloc: h("div", { class: "champ champ--ligne" }, h("label", { for: id }, libelle), select), select };
}

// ---------- Écran ----------

export async function afficherStock(conteneur, app) {
  document.title = "Stock · Fablab Stock";
  remplacer(conteneur, h("h1", { class: "etiquette titre-ecran" }, "Stock"), h("p", { class: "secondaire" }, "Chargement…"));

  let references;
  try {
    references = (await appeler("GET", "/references")).references;
  } catch (erreur) {
    remplacer(conteneur, h("h1", { class: "etiquette titre-ecran" }, "Stock"), h("p", { class: "message message--erreur" }, erreur.message));
    return;
  }

  let vue = vueMemorisee();
  const compte = h("p", { class: "compte-stock", "aria-live": "polite" });
  const resultat = h("div", {});
  const zoneSelecteurs = h("div", { class: "filtres-selecteurs" });

  function dessinerSelecteurs() {
    // Les listes ne proposent que les valeurs présentes pour le type choisi.
    const duType = references.filter((r) => filtres.type === "tout" || r.type === filtres.type);
    const distinctes = (lire) => [...new Set(duType.map(lire).filter((v) => v !== null && v !== ""))];
    const trier = (liste) => liste.sort((a, b) => String(a).localeCompare(String(b), "fr", { numeric: true }));
    const materiaux = trier(distinctes((r) => r.materiau));
    const couleurs = trier(distinctes((r) => r.couleur));
    const epaisseurs = distinctes((r) => r.epaisseur_mm).sort((a, b) => a - b);
    // Un filtre devenu sans objet est remis à zéro.
    if (!materiaux.includes(filtres.materiau)) filtres.materiau = "";
    if (!couleurs.includes(filtres.couleur)) filtres.couleur = "";
    if (!epaisseurs.map(String).includes(filtres.epaisseur)) filtres.epaisseur = "";

    const champs = [
      selecteur("Matériau", "materiau", materiaux),
      selecteur("Couleur", "couleur", couleurs, undefined, true),
      epaisseurs.length > 0 && selecteur("Épaisseur", "epaisseur", epaisseurs, (v) => `${NOMBRE.format(v)} mm`, true),
    ].filter(Boolean);
    for (const { select } of champs) {
      select.addEventListener("change", () => {
        filtres[select.name] = select.value;
        dessiner();
      });
    }
    remplacer(zoneSelecteurs, champs.map((c) => c.bloc));
  }

  function dessiner() {
    const visibles = filtrer(references);
    const bas = visibles.filter(aCommander).length;
    remplacer(
      compte,
      `${visibles.length} référence${visibles.length > 1 ? "s" : ""}`,
      bas > 0 && [" · ", h("strong", { class: "alerte-texte" }, `${bas} à commander`)],
    );
    remplacer(
      resultat,
      references.length === 0
        ? h("p", { class: "message" }, "Le catalogue est vide. Le gestionnaire doit d'abord y ajouter des références.")
        : visibles.length === 0
          ? h("p", { class: "message" }, "Aucune référence ne correspond à ces filtres.")
          : vue === "liste"
            ? vueListe(visibles, dessiner)
            : vueCasiers(visibles),
    );
  }

  const type = champSegment("Type de matière", "type", TYPES_FILTRE, filtres.type);
  type.bloc.classList.add("champ-segment--discret");
  type.bloc.addEventListener("change", () => {
    filtres.type = type.lire();
    dessinerSelecteurs();
    dessiner();
  });

  const bascule = champSegment("Présentation", "vue", VUES, vue);
  bascule.bloc.classList.add("champ-segment--discret", "bascule-vue");
  bascule.bloc.addEventListener("change", () => {
    vue = bascule.lire();
    memoriserVue(vue);
    dessiner();
  });

  const recherche = champ("Recherche", {
    type: "search",
    name: "recherche",
    placeholder: "Matériau, couleur…",
    autocomplete: "off",
    value: filtres.recherche,
  });
  recherche.bloc.classList.add("champ--ligne");
  recherche.saisie.addEventListener("input", () => {
    filtres.recherche = recherche.saisie.value;
    dessiner();
  });

  // Sur téléphone, la recherche et les listes se replient pour laisser la place aux casiers.
  const actifs = [filtres.materiau, filtres.couleur, filtres.epaisseur, filtres.recherche].some(Boolean);
  const volet = h(
    "details",
    { class: "filtres-volet", open: actifs || matchMedia("(min-width: 900px)").matches },
    h("summary", {}, "Recherche et filtres"),
    h("div", { class: "filtres-contenu" }, recherche.bloc, zoneSelecteurs),
  );

  dessinerSelecteurs();
  dessiner();
  remplacer(
    conteneur,
    h("div", { class: "entete-stock" }, h("h1", { class: "etiquette titre-ecran" }, "Stock"), bascule.bloc),
    app.annonce(),
    h("div", { class: "filtres-stock" }, type.bloc, volet),
    compte,
    resultat,
  );
}
