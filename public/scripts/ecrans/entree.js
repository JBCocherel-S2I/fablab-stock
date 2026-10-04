// Écran d'entrée : saisie du code commun (5.1), ou première mise en service.

import { appeler } from "../api.js";
import { brancherFormulaire, champCode, h, remplacer, zoneMessage } from "../dom.js";
import { ouvrirFenetreGestionnaire } from "../gestionnaire.js";

function formulaireCodeCommun(app) {
  const message = zoneMessage();
  const code = champCode("Code d'accès", { name: "code" });
  const formulaire = h(
    "form",
    {},
    message.zone,
    code.bloc,
    h("button", { type: "submit", class: "bouton bouton--plein bouton--large" }, "Entrer"),
  );
  brancherFormulaire(formulaire, message, async () => {
    try {
      app.majSession(await appeler("POST", "/acces/entrer", { code: code.saisie.value }));
    } catch (erreur) {
      code.saisie.value = "";
      code.saisie.focus();
      throw erreur;
    }
    app.rendre();
  });
  return [
    h("h1", { class: "etiquette" }, "Accès"),
    h("p", {}, "Saisissez le code d'accès du fablab. Il ne sera pas redemandé sur cet appareil."),
    formulaire,
    h(
      "p",
      {},
      h(
        "button",
        { type: "button", class: "lien-discret", onclick: () => ouvrirFenetreGestionnaire(app, () => app.rendre()) },
        "Mode gestionnaire",
      ),
    ),
  ];
}

function premiereMiseEnService(app) {
  return [
    h("h1", { class: "etiquette" }, "Mise en service"),
    h(
      "p",
      {},
      "Le code d'accès commun n'est pas encore défini. Le gestionnaire doit le créer avec le code gestionnaire.",
    ),
    h(
      "button",
      {
        type: "button",
        class: "bouton bouton--plein bouton--large",
        onclick: () =>
          ouvrirFenetreGestionnaire(app, () => {
            location.hash = "#/administration/codes";
            app.rendre();
          }),
      },
      "Saisir le code gestionnaire",
    ),
  ];
}

export function afficherEntree(racine, app) {
  document.title = "Accès · Fablab Stock";
  remplacer(
    racine,
    h("header", { class: "bandeau" }, h("p", { class: "etiquette" }, "Fablab Stock")),
    h(
      "main",
      { class: "contenu" },
      app.annonce(),
      h(
        "section",
        { class: "panneau panneau-etroit" },
        app.session.codeCommunDefini ? formulaireCodeCommun(app) : premiereMiseEnService(app),
      ),
    ),
  );
  racine.querySelector("input")?.focus();
}
