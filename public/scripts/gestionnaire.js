// Fenêtre de saisie du code gestionnaire.

import { appeler } from "./api.js";
import { brancherFormulaire, champCode, h, zoneMessage } from "./dom.js";

/** Ouvre la fenêtre. `apresSucces` est appelée une fois le mode gestionnaire ouvert. */
export function ouvrirFenetreGestionnaire(app, apresSucces = () => {}) {
  const message = zoneMessage();
  const code = champCode("Code gestionnaire", { name: "code" });
  const fenetre = h("dialog", { "aria-labelledby": "titre-gestionnaire" });
  const formulaire = h(
    "form",
    {},
    message.zone,
    code.bloc,
    h(
      "div",
      { class: "actions" },
      h("button", { type: "submit", class: "bouton bouton--plein" }, "Valider"),
      h("button", { type: "button", class: "bouton bouton--simple", onclick: () => fenetre.close() }, "Annuler"),
    ),
  );
  fenetre.append(
    h("h2", { class: "etiquette", id: "titre-gestionnaire" }, "Mode gestionnaire"),
    h(
      "p",
      { class: "champ-aide" },
      "Réservé au gestionnaire du fablab. Le mode se referme après 15 minutes sans action.",
    ),
    formulaire,
  );

  brancherFormulaire(formulaire, message, async () => {
    try {
      app.majSession(await appeler("POST", "/acces/gestionnaire", { code: code.saisie.value }));
    } catch (erreur) {
      code.saisie.value = "";
      code.saisie.focus();
      throw erreur;
    }
    fenetre.close();
    apresSucces();
  });

  fenetre.addEventListener("close", () => fenetre.remove());
  document.body.append(fenetre);
  fenetre.showModal();
  code.saisie.focus();
}
