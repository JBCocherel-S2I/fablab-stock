// Pictogrammes des casiers, dessinés en SVG à partir de l'état de la référence
// (stock, niveau cible, teinte). Jamais d'image figée (7.1).
// Les couleurs viennent des variables CSS, par les classes .picto-*.

const SVG = "http://www.w3.org/2000/svg";

function svg(balise, attributs = {}, ...enfants) {
  const element = document.createElementNS(SVG, balise);
  for (const [nom, valeur] of Object.entries(attributs)) element.setAttribute(nom, String(valeur));
  element.append(...enfants);
  return element;
}

/** Remplissage entre 0 et 1 : stock rapporté au niveau cible. */
export function remplissage(stock, cible) {
  if (stock <= 0) return 0;
  if (cible <= 0) return 1;
  return Math.min(stock / cible, 1);
}

const RAYON_FLASQUE = 46;
const RAYON_MOYEU = 7;
const RAYON_MATIERE_MIN = 14;
const RAYON_MATIERE_MAX = 38;

/** Bobine vue de face : le disque de filament grossit avec le stock. */
function bobine(taux) {
  const racine = svg("svg", { viewBox: "0 0 100 100", class: "picto picto--filament" });
  racine.append(svg("circle", { cx: 50, cy: 50, r: RAYON_FLASQUE, class: "picto-support" }));
  if (taux > 0) {
    const rayon = RAYON_MATIERE_MIN + (RAYON_MATIERE_MAX - RAYON_MATIERE_MIN) * taux;
    racine.append(svg("circle", { cx: 50, cy: 50, r: rayon.toFixed(1), class: "picto-matiere" }));
  }
  racine.append(svg("circle", { cx: 50, cy: 50, r: RAYON_MOYEU, class: "picto-moyeu" }));
  return racine;
}

const PLAQUES_MAX = 8;
const HAUTEUR_PLAQUE = 7;
const PAS_PLAQUE = 10;
const SOL = 92;

/** Pile de plaques vue en coupe : le nombre de plaques dessinées suit le stock. */
function pile(taux) {
  const racine = svg("svg", { viewBox: "0 0 100 100", class: "picto picto--plaque" });
  const nombre = taux > 0 ? Math.max(1, Math.ceil(taux * PLAQUES_MAX)) : 0;
  for (let i = 0; i < nombre; i++) {
    racine.append(
      svg("rect", {
        x: 12,
        y: SOL - 4 - HAUTEUR_PLAQUE - i * PAS_PLAQUE,
        width: 76,
        height: HAUTEUR_PLAQUE,
        class: "picto-matiere",
      }),
    );
  }
  racine.append(svg("line", { x1: 4, y1: SOL, x2: 96, y2: SOL, class: "picto-sol" }));
  return racine;
}

/**
 * Pictogramme d'une référence. Purement décoratif : le stock est toujours écrit
 * en chiffres à côté, il est donc masqué aux lecteurs d'écran.
 */
export function pictogramme(reference) {
  const taux = remplissage(reference.stock, reference.cible);
  const dessin = reference.type === "filament" ? bobine(taux) : pile(taux);
  dessin.setAttribute("aria-hidden", "true");
  dessin.setAttribute("focusable", "false");
  dessin.style.setProperty("--teinte", reference.teinte);
  return dessin;
}
