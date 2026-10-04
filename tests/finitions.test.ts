// Bloc 7 : PWA, identité visuelle et accessibilité (section 7).

import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { contraste } from "../src/commun/contraste";

const { fichiers, pages, application, manifeste, entetes, icones } = env.INTERFACE;

const couleurs = Object.fromEntries(
  [...env.FEUILLE_DE_STYLE.matchAll(/--([a-z-]+):\s*(#[0-9A-Fa-f]{6})\s*;/g)].map((m) => [m[1], m[2]]),
) as Record<string, string>;

describe("PWA : installation sur l'écran d'accueil", () => {
  const m = JSON.parse(manifeste) as Record<string, any>;

  it("le manifeste décrit une application autonome, en français", () => {
    expect(m).toMatchObject({
      name: "Fablab Stock",
      short_name: "Fablab Stock",
      lang: "fr",
      start_url: "/",
      scope: "/",
      display: "standalone",
    });
  });

  it("les couleurs du manifeste sont celles de la charte", () => {
    expect(m.background_color).toBe(couleurs.bois);
    expect(m.theme_color).toBe(couleurs.acier);
    for (const page of Object.values(pages)) {
      expect(page).toContain(`<meta name="theme-color" content="${couleurs.acier}">`);
    }
  });

  it("propose des icônes de 192 et 512 pixels, classiques et rognables", () => {
    for (const usage of ["any", "maskable"]) {
      const tailles = m.icons.filter((i: any) => i.purpose === usage).map((i: any) => i.sizes).sort();
      expect(tailles, usage).toEqual(["192x192", "512x512"]);
    }
  });

  it("chaque icône déclarée existe, est un PNG, et a la taille annoncée", () => {
    for (const icone of m.icons) {
      const [largeur, hauteur] = icone.sizes.split("x").map(Number);
      expect(icone.type).toBe("image/png");
      expect(icones[icone.src], icone.src).toEqual({ signature: true, largeur, hauteur });
    }
    expect(icones["/icones/icone-180.png"]).toEqual({ signature: true, largeur: 180, hauteur: 180 });
  });

  it("chaque page déclare le manifeste et l'icône pour iOS", () => {
    for (const page of Object.values(pages)) {
      expect(page).toContain('<link rel="manifest" href="/manifest.webmanifest">');
      expect(page).toContain('<link rel="apple-touch-icon" href="/icones/icone-180.png">');
      expect(page).toContain('<html lang="fr">');
      expect(page).toContain('<meta name="viewport" content="width=device-width, initial-scale=1">');
    }
  });

  it("il n'y a pas de mode hors ligne en version 1 : aucun service worker", () => {
    expect(fichiers.some((f) => /service-?worker|sw\.js/i.test(f))).toBe(false);
    expect(pages.index).not.toMatch(/serviceWorker/);
  });
});

describe("aucune ressource externe", () => {
  it("tous les fichiers référencés par les pages existent dans l'application", () => {
    for (const [nom, page] of Object.entries(pages)) {
      const liens = [...page.matchAll(/(?:href|src)="([^"]+)"/g)].map((l) => l[1]!);
      expect(liens.length).toBeGreaterThan(5);
      for (const lien of liens) {
        expect(lien.startsWith("/"), `${nom} : ${lien}`).toBe(true);
        if (lien !== "/") expect(fichiers, `${nom} : ${lien}`).toContain(lien);
      }
    }
  });

  it("la police est hébergée avec l'application", () => {
    const polices = [...env.FEUILLE_DE_STYLE.matchAll(/url\("([^"]+)"\)/g)].map((u) => u[1]!);
    expect(polices).toHaveLength(2);
    for (const police of polices) expect(fichiers).toContain(police);
    expect(env.FEUILLE_DE_STYLE).toContain('"Atkinson Hyperlegible"');
  });

  it("ni les pages ni les styles n'appellent un autre site", () => {
    for (const texte of [pages.index, pages.etat, application, env.FEUILLE_DE_STYLE]) {
      expect(texte).not.toMatch(/https?:\/\//);
    }
  });

  it("la politique de sécurité n'autorise que l'application elle-même", () => {
    expect(entetes).toContain("default-src 'self'");
    expect(entetes).toContain("script-src 'self'");
    expect(entetes).toContain("frame-ancestors 'none'");
    expect(entetes).not.toMatch(/unsafe-inline|unsafe-eval/);
  });
});

describe("identité visuelle (7.1)", () => {
  // Hors impression : une feuille imprimée est en noir sur blanc.
  const ecran = application.slice(0, application.indexOf("/* ---------- Impression"));
  const impression = [...application.matchAll(/@media print \{[\s\S]*?\n\}/g)].map((b) => b[0]).join("\n");

  it("toutes les couleurs passent par les variables CSS", () => {
    const sansImpression = application.replace(/@media print \{[\s\S]*?\n\}/g, "");
    expect(sansImpression.match(/#[0-9A-Fa-f]{3,8}\b/g)).toBeNull();
    expect(sansImpression).not.toMatch(/\b(rgb|hsl)a?\(/);
    expect(ecran.length).toBeGreaterThan(1000);
    expect(impression).toContain(".bon");
  });

  it("un seul thème, sans dégradé ni effet de verre", () => {
    for (const feuille of [application, env.FEUILLE_DE_STYLE]) {
      expect(feuille).not.toMatch(/gradient\(/);
      expect(feuille).not.toMatch(/backdrop-filter|blur\(/);
      expect(feuille).not.toMatch(/prefers-color-scheme/);
    }
  });

  it("les ombres sont nettes : aucune ombre floue", () => {
    for (const feuille of [application, env.FEUILLE_DE_STYLE]) {
      for (const [, valeur] of feuille.matchAll(/box-shadow:\s*([^;]+);/g)) {
        // La variable --ombre est contrôlée plus bas.
        if (valeur === "none" || valeur === "var(--ombre)") continue;
        // Forme attendue : décalage x, décalage y, flou nul, couleur.
        expect(valeur, valeur).toMatch(/^(-?\d+px|0) (-?\d+px|0|var\(--trait\)) 0 var\(--[a-z-]+\)$/);
      }
      expect(feuille.match(/--ombre:\s*([^;]+);/)?.[1] ?? "8px 8px 0 var(--encre)").toBe("8px 8px 0 var(--encre)");
    }
  });

  it("les angles sont droits : seuls les éléments ronds (bobine, pastille) sont arrondis", () => {
    for (const feuille of [application, env.FEUILLE_DE_STYLE]) {
      for (const [, valeur] of feuille.matchAll(/border-radius:\s*([^;]+);/g)) {
        expect(["0", "50%"]).toContain(valeur);
      }
    }
  });
});

describe("accessibilité (7)", () => {
  it("les animations sont désactivées si l'utilisateur a demandé moins de mouvement", () => {
    const reduit = [...application.matchAll(/@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\n\}/g)].map((b) => b[0]).join("\n");
    expect(reduit).toContain(".unite-mobile");
    // Toute règle qui anime ou déplace un élément a sa contrepartie.
    for (const selecteur of [".bouton:active", ".casier--stock:active"]) {
      expect(reduit, selecteur).toContain(selecteur);
    }
    expect(application.match(/animation:/g)).toHaveLength(2);
    expect(application).not.toMatch(/transition:/);
  });

  it("le focus au clavier reste toujours visible", () => {
    expect(env.FEUILLE_DE_STYLE).toMatch(/:focus-visible \{\s*outline: var\(--trait\) solid var\(--encre\)/);
    // Aucun contour de focus n'est supprimé, sauf sur la zone de contenu, qui n'est pas un contrôle.
    const suppressions = [...application.matchAll(/([^{}]+)\{[^{}]*outline:\s*none/g)].map((r) => r[1]!.trim());
    expect(suppressions).toEqual([".contenu:focus"]);
  });

  // Paires réellement utilisées dans l'interface, en plus de celles du bloc 1.
  const pairesTexte: [string, string, string][] = [
    ["papier", "encre", "bouton plein, onglet actif"],
    ["papier", "acier", "navigation, en-tête de tableau, étiquette d'étagère"],
    ["papier", "brique", "bandeau « À commander », pastille de la navigation"],
    ["brique", "papier", "stock bas dans le bon, pastille « Annulation »"],
    ["texte-secondaire", "papier", "texte d'exemple des champs, détail d'une ligne"],
    ["texte-secondaire", "casier", "spécification et unité dans un casier"],
    ["texte-secondaire", "bois", "compteur de références, texte d'aide"],
    ["encre", "bois", "pastille « Désactivée »"],
  ];
  it.each(pairesTexte)("texte %s sur fond %s (%s) : au moins 4,5", (texte, fond) => {
    expect(contraste(couleurs[texte]!, couleurs[fond]!)).toBeGreaterThanOrEqual(4.5);
  });

  it("le texte brique sur bois n'est employé qu'en grand texte gras", () => {
    const regle = application.match(/\.alerte-texte \{([^}]+)\}/)![1]!;
    expect(regle).toContain("color: var(--brique)");
    expect(regle).toContain("font-weight: 700");
    // 1,1875 rem = 19 px, au-dessus du seuil de 18,66 px du grand texte gras.
    expect(Number(regle.match(/font-size: ([\d.]+)rem/)![1]) * 16).toBeGreaterThanOrEqual(18.66);
    expect(contraste(couleurs.brique!, couleurs.bois!)).toBeGreaterThanOrEqual(3);
  });

  it("les contours qui portent une information ont un contraste d'au moins 3", () => {
    for (const [trait, fond] of [["encre", "bois"], ["encre", "casier"], ["encre", "papier"], ["brique", "bois"], ["brique", "casier"], ["papier", "acier"]] as const) {
      expect(contraste(couleurs[trait]!, couleurs[fond]!), `${trait} sur ${fond}`).toBeGreaterThanOrEqual(3);
    }
  });
});
