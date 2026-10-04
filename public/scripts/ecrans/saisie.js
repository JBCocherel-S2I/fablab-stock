// Écrans de saisie : prélèvement (5.3) et entrée de stock (5.4).
// Même structure pour un filament et pour une plaque : seuls changent le
// pictogramme, l'unité et la liste des machines (7.1).

import { appeler } from "../api.js";
import { champ, h, remplacer, zoneMessage } from "../dom.js";
import { TYPES, libelleReference, specification } from "../matiere.js";
import { champEnseignant, machineRetenue, retenirMachine } from "../memoire.js";
import { pictogramme } from "../pictogrammes.js";

const MODES = {
  prelever: {
    titre: "Prélèvement",
    titreChoix: "Prélever",
    consigne: "Choisissez la matière à prélever.",
    route: "/mouvements/prelevement",
    valider: "Valider le prélèvement",
    apres: "Stock après prélèvement",
    fait: "Prélèvement enregistré",
    annuler: "Annuler ce prélèvement",
    annule: "Prélèvement annulé.",
    encore: "Autre prélèvement",
    sens: -1,
  },
  entree: {
    titre: "Entrée de stock",
    titreChoix: "Entrée de stock",
    consigne: "Choisissez la matière reçue.",
    route: "/mouvements/entree",
    valider: "Valider l'entrée",
    apres: "Stock après entrée",
    fait: "Entrée de stock enregistrée",
    annuler: "Annuler cette entrée",
    annule: "Entrée de stock annulée.",
    encore: "Autre entrée",
    sens: 1,
  },
};

const QUANTITE_MAX = 9999;

export function unites(type, nombre) {
  const t = TYPES.find((x) => x.cle === type);
  return nombre > 1 ? t.unites : t.unite;
}

/** Carte de la référence : pictogramme, étiquette et stock en grands chiffres. */
function carteReference(reference) {
  return h(
    "div",
    { class: "carte-reference" },
    pictogramme(reference),
    h(
      "div",
      { class: "carte-reference-texte" },
      h("p", { class: "carte-reference-nom" }, libelleReference(reference)),
      h("p", { class: "secondaire" }, specification(reference)),
    ),
    h(
      "p",
      { class: "carte-reference-stock" },
      h("strong", {}, String(reference.stock)),
      h("span", { class: "secondaire" }, unites(reference.type, reference.stock)),
    ),
  );
}

function entete(titre, retour) {
  return h(
    "div",
    { class: "entete-saisie" },
    h("a", { class: "bouton bouton--acier", href: retour }, "Retour"),
    h("h1", { class: "etiquette" }, titre),
  );
}

// ---------- Choix de la référence ----------

function afficherChoix(conteneur, mode, cle, donnees) {
  document.title = `${mode.titreChoix} · Fablab Stock`;
  // Pour un prélèvement, les références les plus utilisées viennent en tête.
  const references =
    cle === "prelever" ? [...donnees.references].sort((a, b) => b.utilisations - a.utilisations) : donnees.references;

  const recherche = champ("Recherche", {
    type: "search",
    name: "recherche",
    placeholder: "Matériau, couleur…",
    autocomplete: "off",
  });
  const liste = h("ul", { class: "liste-references" });
  const vide = h("p", { hidden: true }, "Aucune référence ne correspond à cette recherche.");

  const normaliser = (t) => t.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  function dessiner() {
    const termes = normaliser(recherche.saisie.value).split(/\s+/).filter(Boolean);
    const visibles = references.filter((r) => {
      const texte = normaliser(`${libelleReference(r)} ${specification(r)} ${r.marque ?? ""}`);
      return termes.every((t) => texte.includes(t));
    });
    vide.hidden = visibles.length > 0;
    remplacer(
      liste,
      visibles.map((r) => {
        const epuise = cle === "prelever" && r.stock === 0;
        const contenu = [carteReference(r), epuise && h("p", { class: "mention-epuise" }, "! Stock épuisé")];
        return h(
          "li",
          {},
          epuise
            ? h("div", { class: "choix-reference choix-reference--epuise" }, contenu)
            : h("a", { class: "choix-reference", href: `#/${cle}/${r.id}` }, contenu),
        );
      }),
    );
  }
  recherche.saisie.addEventListener("input", dessiner);
  dessiner();

  remplacer(
    conteneur,
    h(
      "div",
      { class: "entete-liste" },
      h("h1", { class: "etiquette titre-ecran" }, mode.titreChoix),
      cle === "prelever"
        ? h("a", { class: "bouton", href: "#/entree" }, "Entrée de stock")
        : h("a", { class: "bouton", href: "#/prelever" }, "Prélever"),
    ),
    h(
      "div",
      { class: "colonne-saisie" },
      h("p", {}, mode.consigne),
      references.length === 0
        ? h("p", { class: "message" }, "Le catalogue est vide. Le gestionnaire doit d'abord y ajouter des références.")
        : [recherche.bloc, vide, liste],
    ),
  );
}

// ---------- Formulaire ----------

function champQuantite(reference, mode, surChangement) {
  const maximum = mode.sens < 0 ? Math.max(reference.stock, 1) : QUANTITE_MAX;
  const saisie = h("input", {
    id: "quantite",
    name: "quantite",
    type: "text",
    inputmode: "numeric",
    autocomplete: "off",
    class: "quantite-valeur",
    value: "1",
    "aria-describedby": "quantite-unite",
  });
  const unite = h("span", { class: "secondaire", id: "quantite-unite" });
  const lire = () => (/^\d+$/.test(saisie.value.trim()) ? Number(saisie.value.trim()) : null);
  const moins = h("button", { type: "button", class: "quantite-bouton", "aria-label": "Diminuer la quantité" }, "−");
  const plus = h("button", { type: "button", class: "quantite-bouton", "aria-label": "Augmenter la quantité" }, "+");

  function actualiser() {
    const n = lire();
    unite.textContent = unites(reference.type, n ?? 1);
    moins.disabled = n === null || n <= 1;
    plus.disabled = n !== null && n >= maximum;
    surChangement();
  }
  function changer(pas) {
    saisie.value = String(Math.min(Math.max((lire() ?? 1) + pas, 1), maximum));
    actualiser();
  }
  moins.addEventListener("click", () => changer(-1));
  plus.addEventListener("click", () => changer(1));
  saisie.addEventListener("input", actualiser);
  saisie.addEventListener("focus", () => saisie.select());

  return {
    bloc: h(
      "div",
      { class: "champ" },
      h("label", { for: "quantite" }, mode.sens < 0 ? "Quantité" : "Quantité reçue"),
      h("div", { class: "quantite" }, moins, saisie, plus, unite),
    ),
    lire,
    actualiser,
  };
}

function champMachine(reference, machines) {
  const compatibles = machines.filter((m) => m.type === reference.type);
  if (compatibles.length === 0) {
    return {
      bloc: h(
        "div",
        { class: "champ" },
        h("p", { class: "legende" }, "Machine"),
        h("p", { class: "message message--erreur" }, "Aucune machine n'est prévue pour cette matière. Le gestionnaire doit en ajouter une."),
      ),
      lire: () => null,
    };
  }
  const retenue = machineRetenue(reference.type);
  // Une seule machine possible : elle est choisie d'office.
  const choisie = compatibles.length === 1 ? compatibles[0].id : compatibles.find((m) => m.id === retenue)?.id;
  const bloc = h(
    "fieldset",
    { class: "champ champ-segment" },
    h("legend", { class: "legende" }, "Machine"),
    h(
      "div",
      { class: "segment" },
      compatibles.map((m) =>
        h(
          "label",
          {},
          h("input", { type: "radio", name: "machine_id", value: m.id, checked: m.id === choisie }),
          h("span", {}, m.nom),
        ),
      ),
    ),
  );
  return { bloc, lire: () => Number(bloc.querySelector("input:checked")?.value) || null };
}

function afficherFormulaire(conteneur, mode, cle, reference, donnees) {
  document.title = `${mode.titre} · ${libelleReference(reference)} · Fablab Stock`;
  const message = zoneMessage();
  const enseignant = champEnseignant(donnees.enseignants);
  const resume = h("p", { class: "barre-validation-resume", "aria-live": "polite" });
  const bouton = h("button", { type: "submit", class: "bouton bouton--large" }, mode.valider);

  const quantite = champQuantite(reference, mode, () => {
    const n = quantite?.lire();
    const apres = n === null || n === undefined ? null : reference.stock + mode.sens * n;
    const insuffisant = apres !== null && apres < 0;
    // Blocage explicite quand la quantité demandée dépasse le stock (5.3).
    resume.classList.toggle("barre-validation-resume--alerte", insuffisant);
    resume.textContent =
      apres === null
        ? "Indiquez une quantité en chiffres."
        : insuffisant
          ? `! Stock insuffisant : il reste ${reference.stock} ${unites(reference.type, reference.stock)}.`
          : `${mode.apres} : ${apres} ${unites(reference.type, apres)}`;
    bouton.disabled = apres === null || insuffisant || n < 1;
  });

  const prelevement = mode.sens < 0;
  const machine = prelevement ? champMachine(reference, donnees.machines) : null;
  const projet = prelevement
    ? champ("Projet ou classe", {
        name: "projet",
        type: "text",
        required: true,
        maxlength: 60,
        autocomplete: "off",
        list: "projets-connus",
      })
    : null;
  const commentaire = champ("Commentaire (facultatif)", {
    name: "commentaire",
    type: "text",
    maxlength: 200,
    autocomplete: "off",
    placeholder: prelevement ? "Ajouter une précision" : "Numéro de bon de livraison, par exemple",
  });

  const formulaire = h(
    "form",
    { class: "formulaire-saisie", novalidate: true },
    h(
      "div",
      { class: "colonne-saisie" },
      carteReference(reference),
      message.zone,
      enseignant.bloc,
      quantite.bloc,
      machine?.bloc,
      projet && [projet.bloc, h("datalist", { id: "projets-connus" }, donnees.projets.map((p) => h("option", { value: p })))],
      commentaire.bloc,
    ),
    h("div", { class: "barre-validation" }, h("div", { class: "colonne-saisie" }, resume, bouton)),
  );
  quantite.actualiser();

  formulaire.addEventListener("submit", async (evenement) => {
    evenement.preventDefault();
    message.vider();
    // Contrôle avant envoi : un message précis plutôt qu'un refus du serveur.
    const manque =
      (!enseignant.lire() && "Choisissez votre nom dans la liste.") ||
      (prelevement && !machine.lire() && "Choisissez la machine utilisée.") ||
      (prelevement && projet.saisie.value.trim() === "" && "Indiquez le projet ou la classe.");
    if (manque) {
      message.erreur(manque);
      message.zone.scrollIntoView({ block: "center" });
      return;
    }
    bouton.disabled = true;
    try {
      const resultat = await appeler("POST", mode.route, {
        material_id: reference.id,
        teacher_id: enseignant.lire(),
        quantite: quantite.lire(),
        commentaire: commentaire.saisie.value,
        ...(prelevement ? { machine_id: machine.lire(), projet: projet.saisie.value } : {}),
      });
      enseignant.retenir();
      if (prelevement) retenirMachine(reference.type, machine.lire());
      window.dispatchEvent(new Event("fablab:stock-modifie"));
      afficherConfirmation(conteneur, mode, cle, reference, resultat, donnees);
    } catch (erreur) {
      // Le stock a pu changer entre-temps : on réaffiche le formulaire à jour.
      if (erreur.code === "STOCK_INSUFFISANT" && typeof erreur.details.stock === "number") {
        reference.stock = erreur.details.stock;
        afficherFormulaire(conteneur, mode, cle, reference, donnees);
        conteneur.querySelector("[aria-live=assertive]")?.replaceChildren(h("p", { class: "message message--erreur" }, erreur.message));
        return;
      }
      message.erreur(erreur.message);
      message.zone.scrollIntoView({ block: "center" });
      bouton.disabled = false;
    }
  });

  remplacer(conteneur, entete(mode.titre, `#/${cle}`), formulaire);
}

/**
 * Retour discret après l'enregistrement (7.1) : une unité « quitte » le casier
 * pour un prélèvement, ou y « arrive » pour une entrée. Purement décoratif, et
 * supprimé par la feuille de style si l'utilisateur a demandé moins d'animations.
 */
function carteAnimee(reference, sens) {
  const carte = carteReference(reference);
  const unite = h("span", {
    class: `unite-mobile unite-mobile--${reference.type} unite-mobile--${sens < 0 ? "depart" : "arrivee"}`,
    "aria-hidden": "true",
  });
  unite.style.setProperty("--teinte", reference.teinte);
  carte.prepend(unite);
  return carte;
}

// ---------- Confirmation, avec annulation immédiate (5.3) ----------

function afficherConfirmation(conteneur, mode, cle, reference, resultat, donnees) {
  const { mouvement, stock } = resultat;
  const message = zoneMessage();
  const aJour = { ...reference, stock };
  const machine = donnees.machines.find((m) => m.id === mouvement.machine_id);
  const detail = [
    `${mouvement.quantite} ${unites(reference.type, mouvement.quantite)}`,
    machine?.nom,
    mouvement.projet,
    donnees.enseignants.find((e) => e.id === mouvement.teacher_id)?.nom,
  ]
    .filter(Boolean)
    .join(" · ");

  const boutonAnnuler = h(
    "button",
    {
      type: "button",
      class: "bouton bouton--simple",
      onclick: async () => {
        boutonAnnuler.disabled = true;
        try {
          const annulation = await appeler("POST", `/mouvements/${mouvement.id}/annulation`, {
            teacher_id: mouvement.teacher_id,
            commentaire: "Annulation juste après la saisie",
          });
          window.dispatchEvent(new Event("fablab:stock-modifie"));
          remplacer(
            conteneur,
            entete(mode.titre, `#/${cle}`),
            h(
              "div",
              { class: "colonne-saisie" },
              h("p", { class: "message message--succes", role: "status" }, `${mode.annule} Le stock est revenu à sa valeur précédente.`),
              carteReference({ ...reference, stock: annulation.stock }),
              h(
                "div",
                { class: "actions" },
                h("a", { class: "bouton bouton--plein", href: `#/${cle}` }, mode.encore),
                h("a", { class: "bouton", href: "#/stock" }, "Retour au stock"),
              ),
            ),
          );
        } catch (erreur) {
          message.erreur(erreur.message);
          boutonAnnuler.disabled = false;
        }
      },
    },
    mode.annuler,
  );

  document.title = `${mode.fait} · Fablab Stock`;
  remplacer(
    conteneur,
    entete(mode.titre, `#/${cle}`),
    h(
      "div",
      { class: "colonne-saisie" },
      h("p", { class: "message message--succes confirmation", role: "status" }, `${mode.fait}.`),
      carteAnimee(aJour, mode.sens),
      h("p", { class: "secondaire" }, detail),
      message.zone,
      h(
        "div",
        { class: "actions" },
        h("a", { class: "bouton bouton--plein", href: "#/stock" }, "Retour au stock"),
        h("a", { class: "bouton", href: `#/${cle}` }, mode.encore),
      ),
      h("p", { class: "champ-aide" }, "Une erreur ? Vous pouvez annuler ce mouvement tout de suite."),
      boutonAnnuler,
    ),
  );
  conteneur.querySelector(".confirmation")?.scrollIntoView({ block: "start" });
}

// ---------- Point d'entrée ----------

/** `cle` vaut "prelever" ou "entree" ; `identifiant` est la référence choisie, s'il y en a une. */
export async function afficherSaisie(conteneur, app, cle, identifiant) {
  const mode = MODES[cle];
  remplacer(conteneur, h("p", { class: "secondaire" }, "Chargement…"));
  let donnees;
  try {
    donnees = await appeler("GET", "/saisie");
  } catch (erreur) {
    remplacer(conteneur, h("p", { class: "message message--erreur" }, erreur.message));
    return;
  }
  if (!identifiant) {
    afficherChoix(conteneur, mode, cle, donnees);
    return;
  }
  const reference = donnees.references.find((r) => r.id === Number(identifiant));
  if (!reference) {
    remplacer(
      conteneur,
      entete(mode.titre, `#/${cle}`),
      h("p", { class: "message message--erreur" }, "Cette référence n'existe pas ou n'est plus proposée à la saisie."),
    );
    return;
  }
  if (donnees.enseignants.length === 0) {
    remplacer(
      conteneur,
      entete(mode.titre, `#/${cle}`),
      h("p", { class: "message message--erreur" }, "La liste des enseignants est vide. Le gestionnaire doit d'abord y ajouter des noms."),
    );
    return;
  }
  afficherFormulaire(conteneur, mode, cle, reference, donnees);
}
