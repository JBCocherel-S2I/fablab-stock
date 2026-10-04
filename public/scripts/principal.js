// Point d'entrée de l'interface : état de session, navigation et cadre général.
// Barre inférieure sur téléphone, barre latérale sur PC (7.2), même contenu.

import "./https.js";
import { appeler, ecouterAccesPerdu } from "./api.js";
import { h, remplacer } from "./dom.js";
import { afficherAdministration } from "./ecrans/administration.js";
import { afficherCommander } from "./ecrans/commander.js";
import { afficherEntree } from "./ecrans/entree.js";
import { afficherHistorique } from "./ecrans/historique.js";
import { afficherSaisie } from "./ecrans/saisie.js";
import { afficherStock } from "./ecrans/stock.js";
import { ouvrirFenetreGestionnaire } from "./gestionnaire.js";

const racine = document.getElementById("app");

// Écrans principaux. Ceux qui ne sont pas encore livrés affichent leur bloc d'arrivée.
const ECRANS = [
  { cle: "stock", libelle: "Stock", afficher: afficherStock },
  { cle: "prelever", libelle: "Prélever", afficher: afficherSaisie },
  { cle: "historique", libelle: "Historique", afficher: afficherHistorique },
  { cle: "commander", libelle: "À commander", afficher: afficherCommander },
];

let minuterie = null;
let texteAnnonce = null;

const app = {
  session: { connecte: false, gestionnaire: false, gestionnaireExpireLe: null, codeCommunDefini: true },

  /** Enregistre l'état de session renvoyé par le serveur. */
  majSession(session) {
    app.session = session;
    clearTimeout(minuterie);
    if (session.gestionnaire) {
      // À l'heure prévue de fermeture du mode gestionnaire, on revérifie auprès du serveur.
      const delai = Math.max(Date.parse(session.gestionnaireExpireLe) - Date.now(), 0) + 2000;
      minuterie = setTimeout(async () => {
        const etaitGestionnaire = app.session.gestionnaire;
        await app.actualiserSession();
        if (etaitGestionnaire && !app.session.gestionnaire) {
          texteAnnonce = "Le mode gestionnaire s'est refermé après 15 minutes sans action.";
          app.rendre();
        }
      }, delai);
    }
  },

  async actualiserSession() {
    app.majSession(await appeler("GET", "/session"));
  },

  /** Message d'information affiché une seule fois en haut de l'écran. */
  annonce() {
    if (!texteAnnonce) return null;
    const element = h("p", { class: "message", role: "status" }, texteAnnonce);
    texteAnnonce = null;
    return element;
  },

  rendre,
};

function route() {
  const [cle = "", sousCle = ""] = location.hash.replace(/^#\/?/, "").split("/");
  return { cle: cle || "stock", sousCle };
}

// ---------- Actions secondaires (barre latérale sur PC, menu sur téléphone) ----------

async function quitterGestionnaire() {
  app.majSession(await appeler("POST", "/acces/quitter-gestionnaire"));
  if (route().cle === "administration") location.hash = "#/stock";
  rendre();
}

async function seDeconnecter() {
  app.majSession(await appeler("POST", "/acces/deconnexion"));
  location.hash = "";
  rendre();
}

function actionsSecondaires(apresAction = () => {}) {
  const faire = (action) => async () => {
    apresAction();
    await action();
  };
  return [
    app.session.gestionnaire
      ? [
          h("p", { class: "plaque-gestionnaire" }, "Mode gestionnaire actif"),
          h("button", { type: "button", class: "bouton bouton--acier", onclick: faire(quitterGestionnaire) }, "Quitter le mode gestionnaire"),
        ]
      : h(
          "button",
          {
            type: "button",
            class: "bouton bouton--acier",
            onclick: faire(() =>
              ouvrirFenetreGestionnaire(app, () => {
                location.hash = "#/administration";
                rendre();
              }),
            ),
          },
          "Mode gestionnaire",
        ),
    h("button", { type: "button", class: "bouton bouton--acier", onclick: faire(seDeconnecter) }, "Se déconnecter"),
  ];
}

/** Pastille du nombre de références à commander, affichée dans la navigation. */
function pastilleCommande() {
  const n = app.session.aCommander ?? 0;
  return h(
    "span",
    { class: "pastille-commande", "data-pastille": "", hidden: n === 0 },
    h("span", { class: "visuellement-cache" }, " : "),
    h("span", { "data-nombre": "" }, String(n)),
    h("span", { class: "visuellement-cache" }, n > 1 ? " références" : " référence"),
  );
}

function majPastilles() {
  const n = app.session.aCommander ?? 0;
  for (const pastille of document.querySelectorAll("[data-pastille]")) {
    pastille.hidden = n === 0;
    pastille.querySelector("[data-nombre]").textContent = String(n);
  }
}

function lienNavigation(cle, libelle, courante) {
  return h(
    "a",
    { class: "nav-lien", href: `#/${cle}`, "aria-current": courante === cle ? "page" : null },
    libelle,
    cle === "commander" && pastilleCommande(),
  );
}

function ouvrirMenu() {
  const fenetre = h("dialog", { "aria-labelledby": "titre-menu" });
  fenetre.append(
    h("h2", { class: "etiquette", id: "titre-menu" }, "Menu"),
    h(
      "div",
      { class: "menu-actions" },
      app.session.gestionnaire &&
        h("a", { class: "bouton", href: "#/administration", onclick: () => fenetre.close() }, "Administration"),
      menuSurFondClair(actionsSecondaires(() => fenetre.close())),
      h("button", { type: "button", class: "bouton bouton--simple", onclick: () => fenetre.close() }, "Fermer"),
    ),
  );
  fenetre.addEventListener("close", () => fenetre.remove());
  document.body.append(fenetre);
  fenetre.showModal();
}

/** Dans le menu (fond clair), les boutons prévus pour le fond acier reprennent le style simple. */
function menuSurFondClair(elements) {
  for (const element of elements.flat(Infinity)) {
    if (element.classList.contains("bouton--acier")) element.classList.replace("bouton--acier", "bouton--simple");
    if (element.classList.contains("plaque-gestionnaire")) element.className = "message";
  }
  return elements;
}

// ---------- Rendu ----------

function ecranAVenir(conteneur, ecran) {
  document.title = `${ecran.libelle} · Fablab Stock`;
  remplacer(
    conteneur,
    h("h1", { class: "etiquette titre-ecran" }, ecran.libelle),
    app.annonce(),
    h("p", { class: "secondaire" }, `Cet écran arrive avec le bloc ${ecran.bloc}.`),
  );
}

function administrationFermee(conteneur) {
  document.title = "Administration · Fablab Stock";
  remplacer(
    conteneur,
    h("h1", { class: "etiquette titre-ecran" }, "Administration"),
    app.annonce(),
    h(
      "section",
      { class: "panneau panneau-etroit" },
      h("p", {}, "L'administration est réservée au gestionnaire du fablab."),
      h(
        "button",
        { type: "button", class: "bouton bouton--plein bouton--large", onclick: () => ouvrirFenetreGestionnaire(app, rendre) },
        "Saisir le code gestionnaire",
      ),
    ),
  );
}

function rendre() {
  if (!app.session.connecte) {
    afficherEntree(racine, app);
    return;
  }

  const { cle, sousCle } = route();
  const contenu = h("main", { class: "contenu", id: "contenu", tabindex: "-1" });
  // Écran de saisie d'un mouvement : sur téléphone, il occupe tout l'écran,
  // avec son propre bandeau et sa barre de validation à la place de la navigation.
  const saisie = (cle === "prelever" || cle === "entree") && sousCle !== "";
  // L'entrée de stock se range sous « Prélever » dans la navigation.
  const cleNavigation = cle === "entree" ? "prelever" : cle;
  remplacer(
    racine,
    h(
      "div",
      { class: saisie ? "cadre cadre--saisie" : "cadre" },
      // Premier élément atteint au clavier : il évite de parcourir toute la navigation.
      h(
        "button",
        { type: "button", class: "lien-evitement", onclick: () => contenu.focus() },
        "Aller au contenu",
      ),
      h(
        "header",
        { class: "bandeau" },
        h("a", { class: "etiquette marque", href: "#/stock" }, "Fablab Stock"),
        h("button", { type: "button", class: "bouton bouton--acier", onclick: ouvrirMenu }, "Menu"),
      ),
      h(
        "aside",
        { class: "lateral" },
        h("a", { class: "etiquette marque", href: "#/stock" }, "Fablab Stock"),
        h(
          "nav",
          { "aria-label": "Navigation principale" },
          h("ul", { class: "nav-liens" }, ECRANS.map((e) => h("li", {}, lienNavigation(e.cle, e.libelle, cleNavigation)))),
        ),
        h(
          "div",
          { class: "lateral-secondaire" },
          app.session.gestionnaire && [
            h("hr", { class: "separateur" }),
            lienNavigation("administration", "Administration", cle),
          ],
          h("div", { class: "pousse-en-bas menu-actions" }, actionsSecondaires()),
        ),
      ),
      contenu,
    ),
  );

  const ecran = ECRANS.find((e) => e.cle === cle);
  if (cle === "administration") {
    if (app.session.gestionnaire) afficherAdministration(contenu, app, sousCle);
    else administrationFermee(contenu);
  } else if (cle === "prelever" || cle === "entree") {
    afficherSaisie(contenu, app, cle, sousCle);
  } else {
    const choisi = ecran ?? ECRANS[0];
    if (choisi.bloc) ecranAVenir(contenu, choisi);
    else choisi.afficher(contenu, app);
  }
}

// Le serveur a refusé une action : session expirée ou mode gestionnaire refermé.
ecouterAccesPerdu(async (erreur) => {
  texteAnnonce =
    erreur.code === "GESTIONNAIRE_REQUIS"
      ? "Le mode gestionnaire s'est refermé. Saisissez à nouveau le code gestionnaire."
      : "Votre session a pris fin. Saisissez à nouveau le code d'accès.";
  try {
    app.majSession(await appeler("GET", "/session"));
  } catch {
    return;
  }
  rendre();
});

// Un mouvement vient d'être enregistré : la pastille « à commander » est remise à jour.
window.addEventListener("fablab:stock-modifie", async () => {
  try {
    await app.actualiserSession();
    majPastilles();
  } catch {
    // Sans réponse du serveur, la pastille sera mise à jour au prochain écran.
  }
});

window.addEventListener("hashchange", () => {
  rendre();
  scrollTo(0, 0);
  document.getElementById("contenu")?.focus({ preventScroll: true });
});

try {
  await app.actualiserSession();
  rendre();
} catch (erreur) {
  remplacer(document.getElementById("chargement"), erreur.message);
}
