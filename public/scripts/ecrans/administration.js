// Administration (gestionnaire) : catalogue et machines (5.7), enseignants (5.8),
// codes d'accès (5.9), correction d'inventaire (5.10).

import { appeler } from "../api.js";
import { brancherFormulaire, champ, champCode, h, remplacer, zoneMessage } from "../dom.js";
import { afficherCatalogue } from "./catalogue.js";
import { afficherInventaire } from "./inventaire.js";
import { afficherMachines } from "./machines.js";

const ONGLETS = [
  { cle: "catalogue", libelle: "Catalogue", afficher: afficherCatalogue },
  { cle: "machines", libelle: "Machines", afficher: afficherMachines },
  { cle: "enseignants", libelle: "Enseignants", afficher: afficherEnseignants },
  { cle: "codes", libelle: "Codes d'accès", afficher: afficherCodes },
  { cle: "inventaire", libelle: "Inventaire", afficher: afficherInventaire },
];

export function afficherAdministration(conteneur, app, cle) {
  const onglet = ONGLETS.find((o) => o.cle === cle) ?? ONGLETS[0];
  document.title = `${onglet.libelle} · Administration · Fablab Stock`;
  const zone = h("div", {});
  remplacer(
    conteneur,
    h("h1", { class: "etiquette titre-ecran" }, "Administration"),
    app.annonce(),
    h(
      "nav",
      { "aria-label": "Sections de l'administration" },
      h(
        "ul",
        { class: "onglets" },
        ONGLETS.map((o) =>
          h(
            "li",
            {},
            h(
              "a",
              { class: "onglet", href: `#/administration/${o.cle}`, "aria-current": o === onglet ? "page" : null },
              o.libelle,
            ),
          ),
        ),
      ),
    ),
    zone,
  );
  onglet.afficher(zone, app);
}

// ---------- Enseignants ----------

async function afficherEnseignants(zone) {
  const message = zoneMessage();
  const liste = h("div", {});
  const panneau = h("section", { class: "panneau", "aria-live": "polite" });
  remplacer(zone, message.zone, h("div", { class: "grille-panneaux grille-liste" }, liste, panneau));

  let enseignants = [];
  /** null : rien, "nouveau" : ajout, sinon l'enseignant en cours de modification. */
  let selection = "nouveau";

  async function recharger() {
    try {
      enseignants = (await appeler("GET", "/administration/enseignants")).enseignants;
    } catch (erreur) {
      message.erreur(erreur.message);
      return;
    }
    if (selection !== "nouveau") selection = enseignants.find((e) => e.id === selection?.id) ?? "nouveau";
    dessiner();
  }

  function choisir(nouvelleSelection) {
    selection = nouvelleSelection;
    message.vider();
    dessiner();
    panneau.scrollIntoView({ block: "nearest" });
    panneau.querySelector("input")?.focus();
  }

  function dessiner() {
    const actifs = enseignants.filter((e) => e.actif).length;
    remplacer(
      liste,
      h(
        "div",
        { class: "entete-liste" },
        h("p", { class: "secondaire" }, `${actifs} nom${actifs > 1 ? "s" : ""} actif${actifs > 1 ? "s" : ""}`),
        h("button", { type: "button", class: "bouton bouton--plein", onclick: () => choisir("nouveau") }, "+ Ajouter un nom"),
      ),
      enseignants.length === 0
        ? h("p", {}, "Aucun enseignant pour le moment. Ajoutez un premier nom.")
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
                  h("th", { scope: "col" }, "Nom"),
                  h("th", { scope: "col" }, "État"),
                  h("th", { scope: "col" }, h("span", { class: "visuellement-cache" }, "Action")),
                ),
              ),
              h(
                "tbody",
                {},
                enseignants.map((e) =>
                  h(
                    "tr",
                    { "aria-selected": selection !== "nouveau" && selection.id === e.id ? "true" : null },
                    h("td", { class: "nom" }, e.nom),
                    h(
                      "td",
                      {},
                      h(
                        "span",
                        { class: `pastille-etat${e.actif ? "" : " pastille-etat--inactif"}` },
                        e.actif ? "Actif" : "Désactivé",
                      ),
                    ),
                    h(
                      "td",
                      { class: "cellule-action" },
                      h(
                        "button",
                        { type: "button", class: "bouton bouton--simple", onclick: () => choisir(e) },
                        "Modifier",
                        h("span", { class: "visuellement-cache" }, ` ${e.nom}`),
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
    const ajout = selection === "nouveau";
    const messagePanneau = zoneMessage();
    const nom = champ("Nom", {
      name: "nom",
      type: "text",
      required: true,
      maxlength: 60,
      autocomplete: "off",
      value: ajout ? "" : selection.nom,
    });
    const formulaire = h(
      "form",
      {},
      messagePanneau.zone,
      nom.bloc,
      h(
        "div",
        { class: "actions" },
        h("button", { type: "submit", class: "bouton bouton--plein" }, "Enregistrer"),
        !ajout &&
          h(
            "button",
            {
              type: "button",
              class: "bouton bouton--simple",
              onclick: async () => {
                try {
                  const actif = !selection.actif;
                  await appeler("PATCH", `/administration/enseignants/${selection.id}`, { actif });
                  message.succes(`« ${selection.nom} » est ${actif ? "réactivé" : "désactivé"}.`);
                  await recharger();
                } catch (erreur) {
                  messagePanneau.erreur(erreur.message);
                }
              },
            },
            selection.actif ? "Désactiver" : "Réactiver",
          ),
      ),
      !ajout &&
        h(
          "p",
          { class: "champ-aide" },
          selection.actif
            ? "Un nom désactivé disparaît du sélecteur mais reste visible dans l'historique."
            : "Ce nom est désactivé : il n'est plus proposé à la saisie.",
        ),
    );
    brancherFormulaire(formulaire, messagePanneau, async () => {
      if (ajout) {
        const { enseignant } = await appeler("POST", "/administration/enseignants", { nom: nom.saisie.value });
        message.succes(`« ${enseignant.nom} » est ajouté à la liste.`);
      } else {
        const { enseignant } = await appeler("PATCH", `/administration/enseignants/${selection.id}`, {
          nom: nom.saisie.value,
        });
        message.succes(`Nom enregistré : « ${enseignant.nom} ».`);
        selection = "nouveau";
      }
      await recharger();
    });
    remplacer(
      panneau,
      h("h2", { class: "etiquette" }, ajout ? "Ajouter un nom" : `Modifier : ${selection.nom}`),
      formulaire,
    );
  }

  await recharger();
}

// ---------- Codes d'accès ----------

/** Deux saisies identiques, pour éviter d'enregistrer une faute de frappe. */
function champsNouveauCode(libelle, minimum) {
  const nouveau = champCode(libelle, { name: "nouveau", minlength: minimum, maxlength: 64 }, `${minimum} caractères au minimum.`);
  const confirmation = champCode(`${libelle} (confirmation)`, { name: "confirmation", maxlength: 64 });
  return {
    blocs: [nouveau.bloc, confirmation.bloc],
    lire() {
      if (nouveau.saisie.value !== confirmation.saisie.value) {
        throw new Error("Les deux saisies du nouveau code sont différentes.");
      }
      return nouveau.saisie.value;
    },
  };
}

function afficherCodes(zone, app) {
  const messageCommun = zoneMessage();
  const commun = champsNouveauCode("Nouveau code d'accès commun", 6);
  const formulaireCommun = h(
    "form",
    {},
    messageCommun.zone,
    commun.blocs,
    h("button", { type: "submit", class: "bouton bouton--plein" }, "Enregistrer"),
  );
  brancherFormulaire(formulaireCommun, messageCommun, async () => {
    const etaitDefini = app.session.codeCommunDefini;
    app.majSession(await appeler("PUT", "/acces/code-commun", { nouveau: commun.lire() }));
    formulaireCommun.reset();
    messageCommun.succes(
      etaitDefini
        ? "Code d'accès commun enregistré. Les autres appareils devront saisir le nouveau code. Le code gestionnaire n'a pas changé."
        : "Code d'accès commun enregistré. Vous pouvez le communiquer aux enseignants. Le code gestionnaire n'a pas changé.",
    );
  });

  const messageGestionnaire = zoneMessage();
  const actuel = champCode("Code gestionnaire actuel", { name: "actuel" });
  const gestionnaire = champsNouveauCode("Nouveau code gestionnaire", 8);
  const formulaireGestionnaire = h(
    "form",
    {},
    messageGestionnaire.zone,
    actuel.bloc,
    gestionnaire.blocs,
    h("button", { type: "submit", class: "bouton bouton--plein" }, "Enregistrer"),
  );
  brancherFormulaire(formulaireGestionnaire, messageGestionnaire, async () => {
    app.majSession(
      await appeler("PUT", "/acces/code-gestionnaire", { actuel: actuel.saisie.value, nouveau: gestionnaire.lire() }),
    );
    formulaireGestionnaire.reset();
    messageGestionnaire.succes("Code gestionnaire enregistré. Le code d'accès commun n'a pas changé.");
  });

  remplacer(
    zone,
    !app.session.codeCommunDefini &&
      h(
        "p",
        { class: "message" },
        "Première mise en service : définissez le code d'accès commun, puis communiquez-le aux enseignants.",
      ),
    h(
      "div",
      { class: "grille-panneaux" },
      h(
        "section",
        { class: "panneau" },
        h("h2", { class: "etiquette" }, "Code d'accès commun"),
        h(
          "p",
          { class: "champ-aide" },
          "Le code que tous les enseignants saisissent pour entrer dans l'application. Il n'ouvre pas l'administration. À changer en début d'année ou en cas de fuite : tous les autres appareils seront déconnectés.",
        ),
        formulaireCommun,
      ),
      h(
        "section",
        { class: "panneau" },
        h("h2", { class: "etiquette" }, "Code gestionnaire"),
        h(
          "p",
          { class: "champ-aide" },
          "Le code réservé au gestionnaire, demandé pour ouvrir l'administration. Il doit être différent du code d'accès commun.",
        ),
        formulaireGestionnaire,
      ),
    ),
  );
}
