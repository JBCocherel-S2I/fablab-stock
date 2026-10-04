// Administration : correction d'inventaire (5.10). Après un comptage réel, le
// gestionnaire saisit le stock constaté ; l'outil enregistre l'écart.

import { appeler } from "../api.js";
import { brancherFormulaire, champ, h, remplacer, zoneMessage } from "../dom.js";
import { libelleReference, lireNombre, pastilleTeinte, specification } from "../matiere.js";
import { champEnseignant } from "../memoire.js";
import { unites } from "./saisie.js";

export async function afficherInventaire(zone) {
  const message = zoneMessage();
  const liste = h("div", {});
  const panneau = h("section", { class: "panneau" });
  remplacer(zone, message.zone, h("div", { class: "grille-panneaux grille-liste" }, liste, panneau));

  let donnees = { references: [], enseignants: [] };
  let selection = null;

  async function recharger() {
    try {
      donnees = await appeler("GET", "/saisie");
    } catch (erreur) {
      message.erreur(erreur.message);
      return;
    }
    if (selection) selection = donnees.references.find((r) => r.id === selection.id) ?? null;
    dessiner();
  }

  function choisir(reference) {
    selection = reference;
    message.vider();
    dessiner();
    panneau.scrollIntoView({ block: "nearest" });
    panneau.querySelector("input")?.focus();
  }

  function dessiner() {
    remplacer(
      liste,
      h(
        "p",
        { class: "secondaire" },
        "Comptez le stock réel d'une référence, puis saisissez-le : l'écart est enregistré comme une correction.",
      ),
      donnees.references.length === 0
        ? h("p", {}, "Le catalogue ne contient aucune référence active.")
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
                  h("th", { scope: "col" }, "Teinte"),
                  h("th", { scope: "col" }, "Matière"),
                  h("th", { scope: "col" }, "Spécification"),
                  h("th", { scope: "col" }, "Stock enregistré"),
                  h("th", { scope: "col" }, h("span", { class: "visuellement-cache" }, "Action")),
                ),
              ),
              h(
                "tbody",
                {},
                donnees.references.map((r) =>
                  h(
                    "tr",
                    { "aria-selected": selection?.id === r.id ? "true" : null },
                    h("td", {}, pastilleTeinte(r.type, r.teinte)),
                    h("td", { class: "nom" }, libelleReference(r)),
                    h("td", {}, specification(r)),
                    h("td", { class: "nom" }, `${r.stock} ${unites(r.type, r.stock)}`),
                    h(
                      "td",
                      { class: "cellule-action" },
                      h(
                        "button",
                        { type: "button", class: "bouton bouton--simple", onclick: () => choisir(r) },
                        "Corriger",
                        h("span", { class: "visuellement-cache" }, ` ${libelleReference(r)}, ${specification(r)}`),
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
    if (!selection) {
      remplacer(
        panneau,
        h("h2", { class: "etiquette" }, "Correction d'inventaire"),
        h("p", {}, "Choisissez une référence dans la liste avec le bouton « Corriger »."),
      );
      return;
    }
    const r = selection;
    const messagePanneau = zoneMessage();
    const constate = champ("Stock constaté", {
      name: "stock_constate",
      type: "text",
      inputmode: "numeric",
      required: true,
      autocomplete: "off",
    });
    const ecart = h("p", { class: "champ-aide champ-aide--bloc", "aria-live": "polite" });
    const enseignant = champEnseignant(donnees.enseignants, "Votre nom");
    const commentaire = champ(
      "Commentaire (obligatoire)",
      { name: "commentaire", type: "text", required: true, maxlength: 200, autocomplete: "off" },
      "Par exemple « Inventaire de rentrée ».",
    );

    function majEcart() {
      const n = lireNombre(constate.saisie.value);
      if (n === null || !Number.isInteger(n)) {
        ecart.textContent = "";
      } else if (n === r.stock) {
        ecart.textContent = "Aucun écart : rien à corriger.";
      } else {
        const d = n - r.stock;
        ecart.textContent = `Écart : ${d > 0 ? "+" : "−"}${Math.abs(d)} ${unites(r.type, Math.abs(d))}`;
      }
    }
    constate.saisie.addEventListener("input", majEcart);

    const formulaire = h(
      "form",
      { novalidate: true },
      messagePanneau.zone,
      h("p", {}, "Stock enregistré : ", h("strong", {}, `${r.stock} ${unites(r.type, r.stock)}`)),
      constate.bloc,
      ecart,
      enseignant.bloc,
      commentaire.bloc,
      h(
        "div",
        { class: "actions" },
        h("button", { type: "submit", class: "bouton bouton--plein" }, "Enregistrer la correction"),
        h("button", { type: "button", class: "bouton bouton--simple", onclick: () => choisir(null) }, "Abandonner"),
      ),
    );
    brancherFormulaire(formulaire, messagePanneau, async () => {
      if (!enseignant.lire()) throw new Error("Choisissez votre nom dans la liste.");
      const resultat = await appeler("POST", "/administration/corrections", {
        material_id: r.id,
        teacher_id: enseignant.lire(),
        stock_constate: lireNombre(constate.saisie.value),
        commentaire: commentaire.saisie.value,
      });
      enseignant.retenir();
      window.dispatchEvent(new Event("fablab:stock-modifie"));
      const d = resultat.mouvement.delta;
      selection = null;
      message.succes(
        `Correction enregistrée pour « ${libelleReference(r)} » : ${d > 0 ? "+" : "−"}${Math.abs(d)}. Nouveau stock : ${resultat.stock} ${unites(r.type, resultat.stock)}.`,
      );
      await recharger();
    });
    remplacer(panneau, h("h2", { class: "etiquette" }, `Inventaire : ${libelleReference(r)}`), formulaire);
  }

  await recharger();
}
