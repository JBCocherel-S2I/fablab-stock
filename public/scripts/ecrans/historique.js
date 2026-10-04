// Historique (5.5) : tableau sobre des mouvements, filtres, tri par colonne,
// export CSV, et annulation d'un mouvement quand les règles le permettent.

import { appeler } from "../api.js";
import { brancherFormulaire, champ, h, remplacer, zoneMessage } from "../dom.js";
import { libelleReference, specification } from "../matiere.js";
import { champEnseignant } from "../memoire.js";

const PERIODES = [
  { cle: "jour", libelle: "Aujourd'hui" },
  { cle: "7j", libelle: "7 derniers jours" },
  { cle: "30j", libelle: "30 derniers jours" },
  { cle: "90j", libelle: "90 derniers jours" },
  { cle: "365j", libelle: "12 derniers mois" },
  { cle: "tout", libelle: "Tout l'historique" },
  { cle: "dates", libelle: "Dates au choix" },
];
const NATURES = [
  { cle: "prelevement", libelle: "Prélèvement" },
  { cle: "entree", libelle: "Entrée" },
  { cle: "correction", libelle: "Correction" },
  { cle: "annulation", libelle: "Annulation" },
];
const PAS = 200;

// Filtres conservés tant que la page reste ouverte.
const filtres = { periode: "30j", du: "", au: "", enseignant: "", reference: "", machine: "", nature: "", projet: "" };
const tri = { colonne: "date", sens: -1 };
let limite = PAS;

const libelleNature = (cle) => NATURES.find((n) => n.cle === cle)?.libelle ?? cle;
const quantiteSignee = (delta) => `${delta > 0 ? "+" : "−"}${Math.abs(delta)}`;

function requete(avecLimite) {
  const p = new URLSearchParams();
  for (const [cle, valeur] of Object.entries(filtres)) {
    if (valeur === "") continue;
    if ((cle === "du" || cle === "au") && filtres.periode !== "dates") continue;
    p.set(cle, valeur);
  }
  if (avecLimite) p.set("limite", String(limite));
  return p.toString();
}

function selecteur(libelle, cle, options, vide) {
  const id = `historique-${cle}`;
  const select = h(
    "select",
    { id, name: cle },
    vide && h("option", { value: "" }, vide),
    options.map((o) =>
      o.groupe
        ? h("optgroup", { label: o.groupe }, o.options.map((x) => h("option", { value: x.cle, selected: String(x.cle) === filtres[cle] }, x.libelle)))
        : h("option", { value: o.cle, selected: String(o.cle) === filtres[cle] }, o.libelle),
    ),
  );
  return { bloc: h("div", { class: "champ" }, h("label", { for: id }, libelle), select), select };
}

const COLONNES = [
  { cle: "date", titre: "Date", valeur: (m) => m.id },
  { cle: "enseignant", titre: "Enseignant", valeur: (m) => m.enseignant },
  { cle: "matiere", titre: "Matière", valeur: (m) => `${libelleReference(m)} ${specification(m)}` },
  { cle: "nature", titre: "Nature", valeur: (m) => libelleNature(m.nature) },
  { cle: "quantite", titre: "Qté", valeur: (m) => m.delta },
  { cle: "machine", titre: "Machine", valeur: (m) => m.machine ?? "" },
  { cle: "projet", titre: "Projet ou classe", valeur: (m) => m.projet ?? "" },
];

/** Fenêtre de confirmation d'une annulation : nom de la personne qui annule, commentaire facultatif. */
function ouvrirAnnulation(mouvement, enseignants, apresSucces) {
  const message = zoneMessage();
  const enseignant = champEnseignant(enseignants, "Votre nom");
  const commentaire = champ("Commentaire (facultatif)", {
    name: "commentaire",
    type: "text",
    maxlength: 200,
    autocomplete: "off",
    placeholder: "Erreur de saisie, par exemple",
  });
  const fenetre = h("dialog", { "aria-labelledby": "titre-annulation" });
  const formulaire = h(
    "form",
    { novalidate: true },
    message.zone,
    enseignant.bloc,
    commentaire.bloc,
    h(
      "div",
      { class: "actions" },
      h("button", { type: "submit", class: "bouton bouton--plein" }, "Annuler ce mouvement"),
      h("button", { type: "button", class: "bouton bouton--simple", onclick: () => fenetre.close() }, "Ne rien faire"),
    ),
  );
  fenetre.append(
    h("h2", { class: "etiquette", id: "titre-annulation" }, "Annuler un mouvement"),
    h(
      "p",
      {},
      `${libelleNature(mouvement.nature)} du ${mouvement.date} : ${quantiteSignee(mouvement.delta)} · ${libelleReference(mouvement)}, ${specification(mouvement)}.`,
    ),
    h(
      "p",
      { class: "champ-aide" },
      "Le mouvement d'origine reste dans l'historique ; un mouvement inverse est ajouté et le stock est rétabli.",
    ),
    formulaire,
  );
  brancherFormulaire(formulaire, message, async () => {
    if (!enseignant.lire()) throw new Error("Choisissez votre nom dans la liste.");
    await appeler("POST", `/mouvements/${mouvement.id}/annulation`, {
      teacher_id: enseignant.lire(),
      commentaire: commentaire.saisie.value,
    });
    enseignant.retenir();
    fenetre.close();
    apresSucces();
  });
  fenetre.addEventListener("close", () => fenetre.remove());
  document.body.append(fenetre);
  fenetre.showModal();
}

export async function afficherHistorique(conteneur, app) {
  document.title = "Historique · Fablab Stock";
  const titre = () => h("h1", { class: "etiquette titre-ecran" }, "Historique");
  remplacer(conteneur, titre(), h("p", { class: "secondaire" }, "Chargement…"));

  let listes;
  try {
    listes = await appeler("GET", "/historique/filtres");
  } catch (erreur) {
    remplacer(conteneur, titre(), h("p", { class: "message message--erreur" }, erreur.message));
    return;
  }
  const actifs = listes.enseignants.filter((e) => e.actif);
  const suffixe = (x, feminin) => (x.actif ? "" : feminin ? " (désactivée)" : " (désactivé)");

  const message = zoneMessage();
  const resultat = h("div", {});
  const pied = h("div", { class: "pied-historique" });
  const exporter = h("a", { class: "bouton", download: "" }, "Exporter en CSV");
  let mouvements = [];
  let total = 0;

  // ----- Filtres -----
  const periode = selecteur("Période", "periode", PERIODES);
  const du = champ("Du", { type: "date", name: "du", value: filtres.du });
  const au = champ("Au", { type: "date", name: "au", value: filtres.au });
  const dates = h("div", { class: "filtres-dates" }, du.bloc, au.bloc);
  const enseignant = selecteur(
    "Enseignant",
    "enseignant",
    listes.enseignants.map((e) => ({ cle: e.id, libelle: e.nom + suffixe(e) })),
    "Tous",
  );
  const groupes = [
    ["filament", "Filament"],
    ["plaque", "Plaques"],
  ]
    .map(([type, groupe]) => ({
      groupe,
      options: listes.references
        .filter((r) => r.type === type)
        .map((r) => ({ cle: r.id, libelle: `${libelleReference(r)}, ${specification(r)}${suffixe(r, true)}` })),
    }))
    .filter((g) => g.options.length > 0);
  const reference = selecteur("Matière", "reference", groupes, "Toutes");
  const machine = selecteur(
    "Machine",
    "machine",
    listes.machines.map((m) => ({ cle: m.id, libelle: m.nom + suffixe(m, true) })),
    "Toutes",
  );
  const nature = selecteur("Nature", "nature", NATURES, "Toutes");
  const projet = champ("Projet ou classe", {
    type: "search",
    name: "projet",
    placeholder: "Tous",
    autocomplete: "off",
    value: filtres.projet,
  });

  function appliquer(cle, valeur) {
    filtres[cle] = valeur;
    limite = PAS;
    dates.hidden = filtres.periode !== "dates";
    charger();
  }
  for (const { select } of [periode, enseignant, reference, machine, nature]) {
    select.addEventListener("change", () => appliquer(select.name, select.value));
  }
  for (const { saisie } of [du, au]) saisie.addEventListener("change", () => appliquer(saisie.name, saisie.value));
  let attente;
  projet.saisie.addEventListener("input", () => {
    clearTimeout(attente);
    attente = setTimeout(() => appliquer("projet", projet.saisie.value.trim()), 300);
  });
  dates.hidden = filtres.periode !== "dates";

  const filtresActifs = Object.entries(filtres).some(([cle, v]) => cle !== "periode" && v !== "");
  const volet = h(
    "details",
    { class: "filtres-volet filtres-historique", open: filtresActifs || matchMedia("(min-width: 900px)").matches },
    h("summary", {}, "Filtres"),
    h("div", { class: "filtres-contenu" }, periode.bloc, dates, enseignant.bloc, reference.bloc, machine.bloc, nature.bloc, projet.bloc),
  );

  // ----- Tableau -----
  function dessiner() {
    exporter.href = `/api/historique.csv?${requete(false)}`;
    if (mouvements.length === 0) {
      remplacer(resultat, h("p", { class: "message" }, "Aucun mouvement ne correspond à ces filtres."));
      remplacer(pied);
      return;
    }
    const colonne = COLONNES.find((c) => c.cle === tri.colonne) ?? COLONNES[0];
    const tries = [...mouvements].sort((a, b) => {
      const [x, y] = [colonne.valeur(a), colonne.valeur(b)];
      const ordre = typeof x === "number" ? x - y : String(x).localeCompare(String(y), "fr", { numeric: true, sensitivity: "base" });
      // À égalité, le plus récent d'abord.
      return ordre * tri.sens || b.id - a.id;
    });

    // Le contenu est regroupé dans un seul élément : sur téléphone, la cellule devient
    // une ligne « libellé : valeur » à deux colonnes.
    const cellule = (libelle, contenu, classe = null) =>
      h("td", { "data-libelle": libelle, class: classe }, h("span", { class: "valeur" }, contenu));
    remplacer(
      resultat,
      h(
        "div",
        { class: "cadre-tableau" },
        h(
          "table",
          { class: "tableau tableau--historique tableau--fiches" },
          h(
            "thead",
            {},
            h(
              "tr",
              {},
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
                        tri.sens = c.cle === tri.colonne ? -tri.sens : c.cle === "date" ? -1 : 1;
                        tri.colonne = c.cle;
                        dessiner();
                      },
                    },
                    c.titre,
                    h("span", { "aria-hidden": "true" }, c.cle === tri.colonne ? (tri.sens > 0 ? " ▲" : " ▼") : ""),
                  ),
                ),
              ),
              h("th", { scope: "col" }, "Commentaire"),
              h("th", { scope: "col" }, h("span", { class: "visuellement-cache" }, "Action")),
            ),
          ),
          h(
            "tbody",
            {},
            tries.map((m) =>
              h(
                "tr",
                {},
                cellule("Date", m.date),
                cellule("Enseignant", m.enseignant),
                cellule("Matière", [h("strong", {}, libelleReference(m)), h("span", { class: "secondaire detail" }, specification(m))]),
                cellule("Nature", [
                  h("span", { class: `pastille-nature pastille-nature--${m.nature}` }, libelleNature(m.nature)),
                  m.annule && h("span", { class: "mention-annule" }, "Annulé"),
                ]),
                cellule("Quantité", quantiteSignee(m.delta), "nom"),
                cellule("Machine", m.machine ?? "–"),
                cellule("Projet ou classe", m.projet ?? "–"),
                cellule("Commentaire", m.commentaire ?? "–", "secondaire"),
                h(
                  "td",
                  { class: "cellule-action" },
                  m.annulable &&
                    h(
                      "button",
                      {
                        type: "button",
                        class: "bouton bouton--simple",
                        onclick: () =>
                          ouvrirAnnulation(m, actifs, () => {
                            message.succes("Mouvement annulé : le stock est rétabli.");
                            window.dispatchEvent(new Event("fablab:stock-modifie"));
                            charger();
                          }),
                      },
                      "Annuler",
                      h("span", { class: "visuellement-cache" }, ` le mouvement du ${m.date}, ${libelleReference(m)}`),
                    ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
    remplacer(
      pied,
      h("p", { class: "secondaire" }, `Mouvements affichés : ${mouvements.length} sur ${total}`),
      mouvements.length < total &&
        h(
          "button",
          {
            type: "button",
            class: "bouton bouton--simple",
            onclick: () => {
              limite += PAS;
              charger();
            },
          },
          "Afficher plus",
        ),
    );
  }

  async function charger() {
    try {
      const reponse = await appeler("GET", `/historique?${requete(true)}`);
      mouvements = reponse.mouvements;
      total = reponse.total;
      dessiner();
    } catch (erreur) {
      message.erreur(erreur.message);
    }
  }

  remplacer(
    conteneur,
    h("div", { class: "entete-liste" }, titre(), exporter),
    app.annonce(),
    volet,
    message.zone,
    resultat,
    pied,
  );
  await charger();
}
