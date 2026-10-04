// Petite aide pour construire le DOM sans innerHTML : le texte venant des
// données est toujours inséré comme du texte, jamais comme du HTML.

/**
 * h("button", { class: "bouton", onclick: f }, "Texte", autreElement)
 * Les attributs "onxxx" deviennent des écouteurs, les autres des attributs HTML.
 * Une valeur false, null ou undefined est ignorée.
 */
export function h(balise, attributs = {}, ...enfants) {
  const element = document.createElement(balise);
  for (const [nom, valeur] of Object.entries(attributs)) {
    if (valeur === false || valeur === null || valeur === undefined) continue;
    if (nom.startsWith("on")) element.addEventListener(nom.slice(2), valeur);
    else element.setAttribute(nom, valeur === true ? "" : String(valeur));
  }
  for (const enfant of enfants.flat(Infinity)) {
    if (enfant === false || enfant === null || enfant === undefined) continue;
    element.append(enfant);
  }
  return element;
}

/** Remplace le contenu d'un élément. */
export function remplacer(element, ...enfants) {
  element.replaceChildren(...enfants.flat(Infinity).filter((e) => e !== false && e !== null && e !== undefined));
}

let compteur = 0;

/** Champ de formulaire avec son étiquette. Renvoie { bloc, saisie }. */
export function champ(libelle, attributs = {}, aide = null) {
  const id = `champ-${++compteur}`;
  const saisie = h("input", { id, ...attributs, "aria-describedby": aide ? `${id}-aide` : null });
  const bloc = h(
    "div",
    { class: "champ" },
    h("label", { for: id }, libelle),
    saisie,
    aide && h("p", { class: "champ-aide", id: `${id}-aide` }, aide),
  );
  return { bloc, saisie };
}

/** Champ de code masqué, avec un bouton pour afficher la saisie. */
export function champCode(libelle, attributs = {}, aide = null) {
  const { bloc, saisie } = champ(
    libelle,
    { type: "password", autocomplete: "off", autocapitalize: "none", spellcheck: "false", required: true, ...attributs },
    aide,
  );
  const bascule = h(
    "button",
    {
      type: "button",
      class: "bouton bouton--simple",
      "aria-pressed": "false",
      onclick: () => {
        const visible = saisie.type === "password";
        saisie.type = visible ? "text" : "password";
        bascule.textContent = visible ? "Masquer" : "Afficher";
        bascule.setAttribute("aria-pressed", String(visible));
      },
    },
    "Afficher",
  );
  const ligne = h("div", { class: "champ-avec-bouton" });
  saisie.replaceWith(ligne);
  ligne.append(saisie, bascule);
  return { bloc, saisie };
}

/** Zone de message annoncée aux lecteurs d'écran. */
export function zoneMessage() {
  const zone = h("div", { "aria-live": "assertive" });
  return {
    zone,
    erreur(texte) {
      remplacer(zone, h("p", { class: "message message--erreur" }, texte));
    },
    succes(texte) {
      remplacer(zone, h("p", { class: "message message--succes" }, texte));
    },
    vider() {
      remplacer(zone);
    },
  };
}

/**
 * Branche un formulaire : pendant l'envoi le bouton est désactivé, et une
 * erreur de l'API est affichée dans la zone de message.
 */
export function brancherFormulaire(formulaire, message, action) {
  formulaire.addEventListener("submit", async (evenement) => {
    evenement.preventDefault();
    const boutons = formulaire.querySelectorAll("button[type=submit]");
    boutons.forEach((b) => (b.disabled = true));
    message.vider();
    try {
      await action();
    } catch (erreur) {
      message.erreur(erreur.message || "Une erreur est survenue. Réessayez.");
    } finally {
      boutons.forEach((b) => (b.disabled = false));
    }
  });
}
