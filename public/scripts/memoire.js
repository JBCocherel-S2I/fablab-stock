// Mémoire de l'appareil : dernier nom et dernière machine choisis, proposés par
// défaut à la saisie suivante (section 3). Rien d'autre n'est conservé.

import { h } from "./dom.js";

function lire(cle) {
  try {
    return localStorage.getItem(`fablab.${cle}`);
  } catch {
    return null; // stockage indisponible (navigation privée, réglage du navigateur)
  }
}

function ecrire(cle, valeur) {
  try {
    localStorage.setItem(`fablab.${cle}`, String(valeur));
  } catch {
    // Sans stockage, l'application fonctionne : le choix n'est simplement pas mémorisé.
  }
}

export function retenirMachine(type, id) {
  ecrire(`machine.${type}`, id);
}

export function machineRetenue(type) {
  return Number(lire(`machine.${type}`)) || null;
}

let compteur = 0;

/**
 * Sélecteur d'enseignant, pré-rempli avec le dernier nom utilisé sur l'appareil
 * s'il est toujours dans la liste. Renvoie { bloc, lire(), retenir() }.
 */
export function champEnseignant(enseignants, libelle = "Enseignant") {
  const id = `enseignant-${++compteur}`;
  const dernier = Number(lire("enseignant")) || null;
  const connu = enseignants.some((e) => e.id === dernier);
  const selecteur = h(
    "select",
    { id, name: "teacher_id", required: true },
    h("option", { value: "", selected: !connu }, "Choisir un nom"),
    enseignants.map((e) => h("option", { value: e.id, selected: connu && e.id === dernier }, e.nom)),
  );
  return {
    bloc: h("div", { class: "champ" }, h("label", { for: id }, libelle), selecteur),
    lire: () => Number(selecteur.value) || null,
    retenir: () => selecteur.value && ecrire("enseignant", selecteur.value),
  };
}
