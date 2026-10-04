// À commander (5.6) : la liste de réapprovisionnement, présentée comme un bon de
// commande imprimable. Les quantités sont modifiables avant l'export ou
// l'impression, sans aucun effet sur les données.

import { appeler } from "../api.js";
import { h, remplacer } from "../dom.js";
import { libelleReference, pastilleTeinte, specification } from "../matiere.js";
import { unites } from "./saisie.js";

const QUANTITE_MAX = 9999;

export async function afficherCommander(conteneur, app) {
  document.title = "À commander · Fablab Stock";
  const titre = () => h("h1", { class: "etiquette titre-ecran" }, "À commander");
  remplacer(conteneur, titre(), h("p", { class: "secondaire" }, "Chargement…"));

  let commande;
  try {
    commande = await appeler("GET", "/commande");
  } catch (erreur) {
    remplacer(conteneur, titre(), h("p", { class: "message message--erreur" }, erreur.message));
    return;
  }
  const { lignes, etabliLe } = commande;

  if (lignes.length === 0) {
    remplacer(
      conteneur,
      titre(),
      app.annonce(),
      h(
        "p",
        { class: "message message--succes" },
        "Rien à commander : tous les stocks sont au-dessus de leur seuil d'alerte.",
      ),
    );
    return;
  }

  // Quantités saisies à l'écran, par identifiant de référence.
  const quantites = new Map(lignes.map((l) => [l.id, l.suggestion]));
  const exporter = h("a", { class: "bouton bouton--plein", download: "" }, "Exporter en CSV");
  const alerte = h("p", { class: "message message--erreur", hidden: true, role: "alert" });

  function actualiser() {
    const invalide = [...quantites.values()].some((q) => q === null);
    alerte.hidden = !invalide;
    alerte.textContent = invalide ? `Chaque quantité doit être un nombre entier entre 0 et ${QUANTITE_MAX}.` : "";
    // L'export reprend les quantités affichées ; il est suspendu tant qu'une saisie est invalide.
    if (invalide) {
      exporter.removeAttribute("href");
      exporter.setAttribute("aria-disabled", "true");
    } else {
      const liste = [...quantites].map(([id, q]) => `${id}:${q}`).join(",");
      exporter.href = `/api/commande.csv?quantites=${encodeURIComponent(liste)}`;
      exporter.removeAttribute("aria-disabled");
    }
  }

  function champQuantite(l) {
    const id = `quantite-${l.id}`;
    const saisie = h("input", {
      id,
      type: "text",
      inputmode: "numeric",
      autocomplete: "off",
      class: "quantite-commande",
      value: String(l.suggestion),
      "aria-label": `Quantité à commander pour ${libelleReference(l)}, ${specification(l)}`,
    });
    const unite = h("span", { class: "secondaire" }, unites(l.type, l.suggestion));
    saisie.addEventListener("input", () => {
      const texte = saisie.value.trim();
      const valide = /^\d+$/.test(texte) && Number(texte) <= QUANTITE_MAX;
      quantites.set(l.id, valide ? Number(texte) : null);
      saisie.setAttribute("aria-invalid", String(!valide));
      if (valide) unite.textContent = unites(l.type, Number(texte));
      actualiser();
    });
    saisie.addEventListener("focus", () => saisie.select());
    return h("div", { class: "champ-quantite-commande" }, saisie, unite);
  }

  // Le contenu est regroupé dans un seul élément : sur téléphone, la cellule devient
    // une ligne « libellé : valeur » à deux colonnes.
    const cellule = (libelle, contenu, classe = null) =>
      h("td", { "data-libelle": libelle, class: classe }, h("span", { class: "valeur" }, contenu));
  const tableau = h(
    "table",
    { class: "tableau tableau--bon tableau--fiches" },
    h(
      "thead",
      {},
      h(
        "tr",
        {},
        ["Matière", "Spécification", "Fournisseur", "Stock", "Seuil", "Cible", "Quantité à commander"].map((t) =>
          h("th", { scope: "col" }, t),
        ),
      ),
    ),
    h(
      "tbody",
      {},
      lignes.map((l) =>
        h(
          "tr",
          {},
          cellule("Matière", [
            pastilleTeinte(l.type, l.teinte),
            h(
              "span",
              { class: "matiere-bon" },
              h("strong", {}, libelleReference(l)),
              l.marque && h("span", { class: "secondaire detail" }, l.marque),
            ),
          ]),
          cellule("Spécification", specification(l)),
          cellule("Fournisseur", l.fournisseur ?? "–"),
          cellule("Stock", String(l.stock), "stock-bas"),
          cellule("Seuil", String(l.seuil)),
          cellule("Cible", String(l.cible)),
          cellule("À commander", champQuantite(l)),
        ),
      ),
    ),
  );

  actualiser();
  remplacer(
    conteneur,
    h(
      "div",
      { class: "entete-liste sans-impression" },
      titre(),
      h(
        "div",
        { class: "actions-bon" },
        h("button", { type: "button", class: "bouton", onclick: () => window.print() }, "Imprimer"),
        exporter,
      ),
    ),
    app.annonce(),
    alerte,
    h(
      "section",
      { class: "bon", "aria-labelledby": "titre-bon" },
      h(
        "header",
        { class: "bon-entete" },
        h(
          "div",
          {},
          h("h2", { id: "titre-bon" }, "Bon de réapprovisionnement"),
          h("p", { class: "secondaire" }, "Fablab du lycée Jean Moulin · matières à recommander"),
        ),
        h("p", { class: "bon-date" }, h("span", {}, "Établi le"), h("strong", {}, etabliLe)),
      ),
      tableau,
      h(
        "p",
        { class: "secondaire bon-note sans-impression" },
        "Quantité suggérée = niveau cible moins stock actuel. Elle reste modifiable ici avant l'export ou l'impression, sans effet sur les données.",
      ),
    ),
  );
}
