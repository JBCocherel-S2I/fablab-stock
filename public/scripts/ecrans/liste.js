// Écran d'administration type : une liste en tableau et un panneau de saisie
// (ajout ou modification), côte à côte sur PC, l'un sous l'autre sur téléphone.

import { brancherFormulaire, h, remplacer, zoneMessage } from "../dom.js";

/**
 * options :
 *   charger()                  -> Promise<élément[]>
 *   compte(éléments)           -> texte au-dessus du tableau ("10 références actives")
 *   libelleAjout               -> texte du bouton d'ajout ("+ Ajouter une référence")
 *   texteVide                  -> texte affiché quand la liste est vide
 *   colonnes                   -> [{ titre, cellule(élément) -> contenu, classe? }]
 *   nom(élément)               -> nom court, pour les messages et l'accessibilité
 *   titrePanneau(élément|null) -> titre du panneau (null : ajout)
 *   champs(élément|null)       -> { blocs, lire() } : champs du formulaire et lecture des valeurs
 *   enregistrer(élément|null, valeurs) -> Promise<texte de confirmation>
 *   basculer(élément)          -> Promise<texte de confirmation> (désactiver ou réactiver)
 *   aide(élément)              -> texte d'aide sous les boutons, en modification
 */
export async function afficherListe(zone, options) {
  const message = zoneMessage();
  const liste = h("div", {});
  const panneau = h("section", { class: "panneau" });
  remplacer(zone, message.zone, h("div", { class: "grille-panneaux grille-liste" }, liste, panneau));

  let elements = [];
  /** null : ajout ; sinon l'élément en cours de modification. */
  let selection = null;

  async function recharger() {
    try {
      elements = await options.charger();
    } catch (erreur) {
      message.erreur(erreur.message);
      return;
    }
    if (selection) selection = elements.find((e) => e.id === selection.id) ?? null;
    dessiner();
  }

  function choisir(element) {
    selection = element;
    message.vider();
    dessiner();
    panneau.scrollIntoView({ block: "nearest" });
    panneau.querySelector("input:not([type=radio]), select")?.focus();
  }

  function dessiner() {
    remplacer(
      liste,
      h(
        "div",
        { class: "entete-liste" },
        h("p", { class: "secondaire" }, options.compte(elements)),
        h("button", { type: "button", class: "bouton bouton--plein", onclick: () => choisir(null) }, options.libelleAjout),
      ),
      elements.length === 0
        ? h("p", {}, options.texteVide)
        : h(
            "div",
            { class: "cadre-tableau" },
            h(
              "table",
              { class: "tableau" },
              h(
                "thead",
                {},
                h(
                  "tr",
                  {},
                  options.colonnes.map((c) => h("th", { scope: "col" }, c.titre)),
                  h("th", { scope: "col" }, "État"),
                  h("th", { scope: "col" }, h("span", { class: "visuellement-cache" }, "Action")),
                ),
              ),
              h(
                "tbody",
                {},
                elements.map((e) =>
                  h(
                    "tr",
                    { "aria-selected": selection?.id === e.id ? "true" : null },
                    options.colonnes.map((c) => h("td", { class: c.classe ?? null }, c.cellule(e))),
                    h(
                      "td",
                      {},
                      h(
                        "span",
                        { class: `pastille-etat${e.actif ? "" : " pastille-etat--inactif"}` },
                        e.actif ? "Active" : "Désactivée",
                      ),
                    ),
                    h(
                      "td",
                      { class: "cellule-action" },
                      h(
                        "button",
                        { type: "button", class: "bouton bouton--simple", onclick: () => choisir(e) },
                        "Modifier",
                        h("span", { class: "visuellement-cache" }, ` ${options.nom(e)}`),
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
    );
    dessinerPanneau();
  }

  function dessinerPanneau() {
    const messagePanneau = zoneMessage();
    const champs = options.champs(selection);
    const formulaire = h(
      "form",
      { novalidate: true },
      messagePanneau.zone,
      champs.blocs,
      h(
        "div",
        { class: "actions" },
        h("button", { type: "submit", class: "bouton bouton--plein" }, "Enregistrer"),
        selection &&
          h(
            "button",
            {
              type: "button",
              class: "bouton bouton--simple",
              onclick: async () => {
                try {
                  message.succes(await options.basculer(selection));
                  window.dispatchEvent(new Event("fablab:stock-modifie"));
                  await recharger();
                } catch (erreur) {
                  messagePanneau.erreur(erreur.message);
                }
              },
            },
            selection.actif ? "Désactiver" : "Réactiver",
          ),
      ),
      selection && h("p", { class: "champ-aide" }, options.aide(selection)),
    );
    brancherFormulaire(formulaire, messagePanneau, async () => {
      const texte = await options.enregistrer(selection, champs.lire());
      // Un seuil modifié ou une référence désactivée change le nombre de références à commander.
      window.dispatchEvent(new Event("fablab:stock-modifie"));
      selection = null;
      message.succes(texte);
      await recharger();
    });
    remplacer(panneau, h("h2", { class: "etiquette" }, options.titrePanneau(selection)), formulaire);
  }

  await recharger();
}

/** Groupe de boutons radio présenté comme des boutons accolés. */
export function champSegment(legende, nom, choix, valeur) {
  const bloc = h(
    "fieldset",
    { class: "champ champ-segment" },
    h("legend", { class: "legende" }, legende),
    h(
      "div",
      { class: "segment" },
      choix.map((c) =>
        h(
          "label",
          {},
          h("input", { type: "radio", name: nom, value: c.cle, checked: c.cle === valeur }),
          h("span", {}, c.libelle),
        ),
      ),
    ),
  );
  return { bloc, lire: () => bloc.querySelector("input:checked")?.value ?? null };
}
