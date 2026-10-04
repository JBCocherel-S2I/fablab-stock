// Bloc 2 : codes d'accès, sessions, limitation des essais (5.1, 5.9, 7).

import { beforeEach, describe, expect, it } from "vitest";
import { hacherCode, lireIterations, verifierCode } from "../src/acces/hachage";
import {
  CODE_COMMUN,
  CODE_GESTIONNAIRE_INITIAL,
  JOURS,
  MINUTES,
  creerBanc,
  viderAcces,
} from "./client";
import { baseDeTest } from "./outils";

beforeEach(viderAcces);

describe("hachage des codes", () => {
  it("reconnaît le bon code et refuse les autres", async () => {
    const h = await hacherCode("fablab-2026");
    expect(await verifierCode("fablab-2026", h)).toBe(true);
    expect(await verifierCode("fablab-2027", h)).toBe(false);
    expect(await verifierCode("", h)).toBe(false);
  });

  it("ne contient pas le code en clair et change à chaque hachage (sel aléatoire)", async () => {
    const a = await hacherCode("fablab-2026");
    const b = await hacherCode("fablab-2026");
    expect(a).not.toContain("fablab-2026");
    expect(a).not.toBe(b);
    expect(a).toMatch(/^pbkdf2-sha256\$100000\$/);
  });

  it("ignore les espaces en début et en fin de saisie", async () => {
    const h = await hacherCode("fablab-2026");
    expect(await verifierCode("  fablab-2026 ", h)).toBe(true);
  });

  it("le nombre d'itérations est réglable entre 1000 et 100000, 100000 par défaut", async () => {
    expect(lireIterations("20000")).toBe(20_000);
    for (const invalide of [undefined, "", "abc", "999", "100001", "1500.5"]) {
      expect(lireIterations(invalide)).toBe(100_000);
    }
    const h = await hacherCode("fablab-2026", 20_000);
    expect(h).toMatch(/^pbkdf2-sha256\$20000\$/);
    expect(await verifierCode("fablab-2026", h)).toBe(true);
  });

  it("refuse un hachage mal formé", async () => {
    expect(await verifierCode("x", "n'importe quoi")).toBe(false);
  });
});

describe("première mise en service", () => {
  it("personne n'est connecté et le code commun n'existe pas", async () => {
    const r = await creerBanc().client()("GET", "/api/session");
    expect(r.corps).toEqual({
      connecte: false,
      gestionnaire: false,
      gestionnaireExpireLe: null,
      codeCommunDefini: false,
      aCommander: null,
    });
  });

  it("l'entrée par code commun est refusée tant qu'il n'est pas défini", async () => {
    const r = await creerBanc().client()("POST", "/api/acces/entrer", { code: "peu importe" });
    expect(r.statut).toBe(409);
    expect(r.corps.code).toBe("CODE_COMMUN_NON_DEFINI");
  });

  it("sans secret initial, le mode gestionnaire est indisponible", async () => {
    const banc = creerBanc({ secretInitial: null });
    const r = await banc.client()("POST", "/api/acces/gestionnaire", { code: CODE_GESTIONNAIRE_INITIAL });
    expect(r.statut).toBe(503);
    expect(r.corps.code).toBe("CODE_GESTIONNAIRE_NON_CONFIGURE");
  });

  it("le secret initial ouvre le mode gestionnaire, et il est stocké haché", async () => {
    const banc = creerBanc();
    const c = banc.client();
    const r = await c("POST", "/api/acces/gestionnaire", { code: CODE_GESTIONNAIRE_INITIAL });
    expect(r.statut).toBe(200);
    expect(r.corps).toMatchObject({ connecte: true, gestionnaire: true });

    const lignes = await baseDeTest().tous<{ cle: string; valeur: string }>("SELECT cle, valeur FROM settings");
    expect(lignes).toHaveLength(1);
    expect(lignes[0]!.valeur).toMatch(/^pbkdf2-sha256\$1000\$/);
    expect(lignes[0]!.valeur).not.toContain(CODE_GESTIONNAIRE_INITIAL);
  });

  it("une fois le code gestionnaire changé, le secret initial ne fonctionne plus", async () => {
    const banc = creerBanc();
    const g = await banc.gestionnaire();
    const r = await g("PUT", "/api/acces/code-gestionnaire", {
      actuel: CODE_GESTIONNAIRE_INITIAL,
      nouveau: "nouveau-code-gestion",
    });
    expect(r.statut).toBe(200);

    const autre = banc.client("192.0.2.7");
    expect((await autre("POST", "/api/acces/gestionnaire", { code: CODE_GESTIONNAIRE_INITIAL })).statut).toBe(401);
    expect((await autre("POST", "/api/acces/gestionnaire", { code: "nouveau-code-gestion" })).statut).toBe(200);
  });
});

describe("procédure de secours : code gestionnaire oublié (notice d'administration)", () => {
  it("effacer le code enregistré remet en service le secret initial, sans toucher au reste", async () => {
    const banc = creerBanc();
    const enseignant = await banc.enseignant();
    const g = await banc.gestionnaire();
    await g("PUT", "/api/acces/code-gestionnaire", {
      actuel: CODE_GESTIONNAIRE_INITIAL,
      nouveau: "code-que-l-on-oublie",
    });
    const perdu = banc.client("192.0.2.30");
    expect((await perdu("POST", "/api/acces/gestionnaire", { code: CODE_GESTIONNAIRE_INITIAL })).statut).toBe(401);

    // La commande de la notice.
    await baseDeTest().executer("DELETE FROM settings WHERE cle = 'code_gestionnaire'");

    expect((await perdu("POST", "/api/acces/gestionnaire", { code: CODE_GESTIONNAIRE_INITIAL })).statut).toBe(200);
    expect((await perdu("POST", "/api/acces/gestionnaire", { code: "code-que-l-on-oublie" })).statut).toBe(401);
    // Le code commun et les sessions des enseignants ne sont pas touchés.
    expect((await enseignant("GET", "/api/session")).corps.connecte).toBe(true);
    expect((await banc.client("192.0.2.31")("POST", "/api/acces/entrer", { code: CODE_COMMUN })).statut).toBe(200);
  });
});

describe("code commun", () => {
  it("le bon code ouvre une session sans mode gestionnaire", async () => {
    const banc = creerBanc();
    const c = await banc.enseignant();
    const r = await c("GET", "/api/session");
    expect(r.corps).toMatchObject({ connecte: true, gestionnaire: false, codeCommunDefini: true });
  });

  it("un mauvais code est refusé, avec le nombre d'essais restants", async () => {
    const banc = creerBanc();
    await banc.enseignant();
    const c = banc.client("192.0.2.9");
    const r = await c("POST", "/api/acces/entrer", { code: "mauvais" });
    expect(r.statut).toBe(401);
    expect(r.corps).toMatchObject({ code: "CODE_INCORRECT", essaisRestants: 4 });
    expect((await c("GET", "/api/session")).corps.connecte).toBe(false);
  });

  it("le code gestionnaire n'ouvre pas l'entrée commune, et inversement", async () => {
    const banc = creerBanc();
    await banc.enseignant();
    const c = banc.client("192.0.2.9");
    expect((await c("POST", "/api/acces/entrer", { code: CODE_GESTIONNAIRE_INITIAL })).statut).toBe(401);
    expect((await c("POST", "/api/acces/gestionnaire", { code: CODE_COMMUN })).statut).toBe(401);
  });

  it("un jeton de cookie inventé ne donne aucun accès", async () => {
    const banc = creerBanc();
    await banc.enseignant();
    const r = await banc.client()("GET", "/api/session", undefined, { cookie: "fablab-session=jeton-invente" });
    expect(r.corps.connecte).toBe(false);
  });
});

describe("modification des codes (5.9) : réservée au gestionnaire, côté serveur", () => {
  it("refuse sans session (401) et avec une simple session enseignant (403)", async () => {
    const banc = creerBanc();
    const enseignant = await banc.enseignant();
    const anonyme = banc.client("192.0.2.9");
    for (const [chemin, corps] of [
      ["/api/acces/code-commun", { nouveau: "autre-code-commun" }],
      ["/api/acces/code-gestionnaire", { actuel: CODE_GESTIONNAIRE_INITIAL, nouveau: "autre-code-gestion" }],
    ] as const) {
      expect((await anonyme("PUT", chemin, corps)).statut).toBe(401);
      const r = await enseignant("PUT", chemin, corps);
      expect(r.statut).toBe(403);
      expect(r.corps.code).toBe("GESTIONNAIRE_REQUIS");
    }
    // Les codes n'ont pas changé.
    expect((await banc.client("192.0.2.10")("POST", "/api/acces/entrer", { code: CODE_COMMUN })).statut).toBe(200);
  });

  it("refuse un code trop court ou trop long", async () => {
    const g = await creerBanc().gestionnaire();
    expect((await g("PUT", "/api/acces/code-commun", { nouveau: "12345" })).statut).toBe(400);
    expect((await g("PUT", "/api/acces/code-commun", { nouveau: "x".repeat(65) })).statut).toBe(400);
    expect((await g("PUT", "/api/acces/code-commun", { nouveau: "123456" })).statut).toBe(200);
    const r = await g("PUT", "/api/acces/code-gestionnaire", {
      actuel: CODE_GESTIONNAIRE_INITIAL,
      nouveau: "1234567",
    });
    expect(r.statut).toBe(400);
    expect(r.corps.code).toBe("CODE_INVALIDE");
  });

  it("refuse deux codes identiques", async () => {
    const g = await creerBanc().gestionnaire();
    const r1 = await g("PUT", "/api/acces/code-commun", { nouveau: CODE_GESTIONNAIRE_INITIAL });
    expect(r1.corps.code).toBe("CODES_IDENTIQUES");
    await g("PUT", "/api/acces/code-commun", { nouveau: CODE_COMMUN });
    const r2 = await g("PUT", "/api/acces/code-gestionnaire", {
      actuel: CODE_GESTIONNAIRE_INITIAL,
      nouveau: CODE_COMMUN,
    });
    expect(r2.corps.code).toBe("CODES_IDENTIQUES");
  });

  it("exige le code gestionnaire actuel pour changer le code gestionnaire", async () => {
    const g = await creerBanc().gestionnaire();
    const r = await g("PUT", "/api/acces/code-gestionnaire", { actuel: "faux-code", nouveau: "nouveau-code-gestion" });
    expect(r.statut).toBe(401);
    expect(r.corps.code).toBe("CODE_INCORRECT");
  });

  it("changer le code commun déconnecte les autres appareils, pas le gestionnaire", async () => {
    const banc = creerBanc();
    const enseignant = await banc.enseignant();
    const g = await banc.gestionnaire();
    expect((await g("PUT", "/api/acces/code-commun", { nouveau: "code-de-rentree" })).statut).toBe(200);

    expect((await enseignant("GET", "/api/session")).corps.connecte).toBe(false);
    expect((await g("GET", "/api/session")).corps).toMatchObject({ connecte: true, gestionnaire: true });
    const nouveau = banc.client("192.0.2.11");
    expect((await nouveau("POST", "/api/acces/entrer", { code: CODE_COMMUN })).statut).toBe(401);
    expect((await nouveau("POST", "/api/acces/entrer", { code: "code-de-rentree" })).statut).toBe(200);
  });

  it("changer le code gestionnaire ferme le mode gestionnaire des autres appareils", async () => {
    const banc = creerBanc();
    const g1 = await banc.gestionnaire("192.0.2.101");
    const g2 = await banc.gestionnaire("192.0.2.102");
    await g1("PUT", "/api/acces/code-gestionnaire", {
      actuel: CODE_GESTIONNAIRE_INITIAL,
      nouveau: "nouveau-code-gestion",
    });
    expect((await g1("GET", "/api/session")).corps.gestionnaire).toBe(true);
    expect((await g2("GET", "/api/session")).corps).toMatchObject({ connecte: true, gestionnaire: false });
  });
});

describe("sessions", () => {
  it("la session commune dure 90 jours après la dernière visite", async () => {
    const banc = creerBanc();
    const c = await banc.enseignant();
    banc.avancer(JOURS(89));
    expect((await c("GET", "/api/session")).corps.connecte).toBe(true); // visite : prolongée
    banc.avancer(JOURS(89));
    expect((await c("GET", "/api/session")).corps.connecte).toBe(true);
    banc.avancer(JOURS(91));
    expect((await c("GET", "/api/session")).corps.connecte).toBe(false);
  });

  it("le cookie est renouvelé quand la session est prolongée", async () => {
    const banc = creerBanc();
    const c = await banc.enseignant();
    expect((await c("GET", "/api/session")).cookie).toBeNull();
    banc.avancer(JOURS(2));
    expect((await c("GET", "/api/session")).cookie).toMatch(/Max-Age=7776000/);
  });

  it("le mode gestionnaire se ferme après 15 minutes d'inactivité, la session reste", async () => {
    const banc = creerBanc();
    const g = await banc.gestionnaire();
    banc.avancer(MINUTES(14));
    expect((await g("GET", "/api/session")).corps.gestionnaire).toBe(true);
    banc.avancer(MINUTES(1));
    expect((await g("GET", "/api/session")).corps).toMatchObject({ connecte: true, gestionnaire: false });
    const r = await g("GET", "/api/administration/enseignants");
    expect(r.statut).toBe(403);
  });

  it("chaque action du gestionnaire repousse la fermeture", async () => {
    const banc = creerBanc();
    const g = await banc.gestionnaire();
    banc.avancer(MINUTES(10));
    expect((await g("GET", "/api/administration/enseignants")).statut).toBe(200);
    banc.avancer(MINUTES(10));
    expect((await g("GET", "/api/session")).corps.gestionnaire).toBe(true);
    banc.avancer(MINUTES(15));
    expect((await g("GET", "/api/session")).corps.gestionnaire).toBe(false);
  });

  it("consulter l'état de la session ne repousse pas la fermeture", async () => {
    const banc = creerBanc();
    const g = await banc.gestionnaire();
    for (let i = 0; i < 3; i++) {
      banc.avancer(MINUTES(5));
      await g("GET", "/api/session");
    }
    expect((await g("GET", "/api/session")).corps.gestionnaire).toBe(false);
  });

  it("on peut quitter le mode gestionnaire sans se déconnecter", async () => {
    const g = await creerBanc().gestionnaire();
    const r = await g("POST", "/api/acces/quitter-gestionnaire");
    expect(r.corps).toMatchObject({ connecte: true, gestionnaire: false });
    expect((await g("GET", "/api/administration/enseignants")).statut).toBe(403);
  });

  it("la déconnexion supprime la session côté serveur", async () => {
    const banc = creerBanc();
    const c = await banc.enseignant();
    const avant = await baseDeTest().premier<{ n: number }>("SELECT COUNT(*) AS n FROM session");
    await c("POST", "/api/acces/deconnexion");
    const apres = await baseDeTest().premier<{ n: number }>("SELECT COUNT(*) AS n FROM session");
    expect(apres!.n).toBe(avant!.n - 1);
    expect((await c("GET", "/api/session")).corps.connecte).toBe(false);
  });

  it("le jeton n'est pas stocké en clair dans la base", async () => {
    const banc = creerBanc();
    const c = banc.client();
    const r = await c("POST", "/api/acces/gestionnaire", { code: CODE_GESTIONNAIRE_INITIAL });
    const jeton = r.cookie!.split(";")[0]!.split("=")[1]!;
    const ligne = await baseDeTest().premier<{ jeton_hache: string }>("SELECT jeton_hache FROM session");
    expect(ligne!.jeton_hache).not.toBe(jeton);
    expect(ligne!.jeton_hache).toMatch(/^[0-9a-f]{64}$/);
  });

  it("en HTTPS, le cookie est sécurisé : __Host-, Secure, HttpOnly, SameSite=Lax", async () => {
    const banc = creerBanc();
    const c = banc.client("192.0.2.1", "https://fablab-stock.exemple.workers.dev");
    const r = await c("POST", "/api/acces/gestionnaire", { code: CODE_GESTIONNAIRE_INITIAL });
    expect(r.cookie).toMatch(/^__Host-fablab-session=/);
    expect(r.cookie).toMatch(/; Secure/);
    expect(r.cookie).toMatch(/; HttpOnly/);
    expect(r.cookie).toMatch(/; SameSite=Lax/);
    expect(r.cookie).toMatch(/; Path=\//);
    expect((await c("GET", "/api/session")).corps.gestionnaire).toBe(true);
  });
});

describe("limitation des essais (5.1)", () => {
  it("bloque après 5 essais faux, même avec le bon code, puis débloque après 15 minutes", async () => {
    const banc = creerBanc();
    await banc.enseignant();
    const c = banc.client("192.0.2.20");
    for (let i = 0; i < 5; i++) {
      const r = await c("POST", "/api/acces/entrer", { code: "faux" });
      expect(r.statut).toBe(401);
      expect(r.corps.essaisRestants).toBe(4 - i);
      banc.avancer(MINUTES(1));
    }
    const bloque = await c("POST", "/api/acces/entrer", { code: CODE_COMMUN });
    expect(bloque.statut).toBe(429);
    expect(bloque.corps).toMatchObject({ code: "TROP_D_ESSAIS", minutes: 10 });
    expect(bloque.corps.erreur).toBe("Trop d'essais. Réessayez dans 10 minutes.");

    banc.avancer(MINUTES(10));
    expect((await c("POST", "/api/acces/entrer", { code: CODE_COMMUN })).statut).toBe(200);
  });

  it("les essais refusés pendant le blocage ne le prolongent pas", async () => {
    const banc = creerBanc();
    await banc.enseignant();
    const c = banc.client("192.0.2.21");
    for (let i = 0; i < 5; i++) await c("POST", "/api/acces/entrer", { code: "faux" });
    for (let i = 0; i < 10; i++) {
      banc.avancer(MINUTES(1));
      expect((await c("POST", "/api/acces/entrer", { code: CODE_COMMUN })).statut).toBe(429);
    }
    banc.avancer(MINUTES(5));
    expect((await c("POST", "/api/acces/entrer", { code: CODE_COMMUN })).statut).toBe(200);
  });

  it("un appareil bloqué n'empêche pas un autre appareil d'entrer", async () => {
    const banc = creerBanc();
    await banc.enseignant();
    const a = banc.client("192.0.2.22");
    for (let i = 0; i < 6; i++) await a("POST", "/api/acces/entrer", { code: "faux" });
    const b = banc.client("192.0.2.23");
    expect((await b("POST", "/api/acces/entrer", { code: CODE_COMMUN })).statut).toBe(200);
  });

  it("un code correct remet le compteur à zéro", async () => {
    const banc = creerBanc();
    await banc.enseignant();
    const c = banc.client("192.0.2.24");
    for (let i = 0; i < 4; i++) await c("POST", "/api/acces/entrer", { code: "faux" });
    expect((await c("POST", "/api/acces/entrer", { code: CODE_COMMUN })).statut).toBe(200);
    const r = await c("POST", "/api/acces/entrer", { code: "faux" });
    expect(r.corps.essaisRestants).toBe(4);
  });

  it("le code gestionnaire est limité de la même façon, avec un compteur distinct", async () => {
    const banc = creerBanc();
    await banc.enseignant();
    const c = banc.client("192.0.2.25");
    for (let i = 0; i < 5; i++) {
      expect((await c("POST", "/api/acces/gestionnaire", { code: "faux" })).statut).toBe(401);
    }
    expect((await c("POST", "/api/acces/gestionnaire", { code: CODE_GESTIONNAIRE_INITIAL })).statut).toBe(429);
    // Le compteur du code commun n'est pas touché.
    expect((await c("POST", "/api/acces/entrer", { code: CODE_COMMUN })).statut).toBe(200);
  });

  it("au-delà de 30 essais faux toutes origines confondues, tout nouvel essai est bloqué", async () => {
    const banc = creerBanc();
    await banc.enseignant();
    for (let i = 0; i < 30; i++) {
      const r = await banc.client(`198.51.100.${i}`)("POST", "/api/acces/entrer", { code: "faux" });
      expect(r.statut).toBe(401);
    }
    const r = await banc.client("203.0.113.1")("POST", "/api/acces/entrer", { code: CODE_COMMUN });
    expect(r.statut).toBe(429);
    banc.avancer(MINUTES(15));
    expect((await banc.client("203.0.113.1")("POST", "/api/acces/entrer", { code: CODE_COMMUN })).statut).toBe(200);
  });

  it("l'adresse IP n'est pas stockée en clair", async () => {
    const banc = creerBanc();
    await banc.enseignant();
    await banc.client("192.0.2.26")("POST", "/api/acces/entrer", { code: "faux" });
    const lignes = await baseDeTest().tous<{ origine: string }>("SELECT origine FROM tentative");
    expect(lignes).toHaveLength(1);
    expect(lignes[0]!.origine).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("protection des écritures", () => {
  it("refuse une écriture venant d'un autre site", async () => {
    const c = creerBanc().client();
    const r = await c("POST", "/api/acces/gestionnaire", { code: CODE_GESTIONNAIRE_INITIAL }, {
      origin: "https://site-malveillant.example",
    });
    expect(r.statut).toBe(403);
    expect(r.corps.code).toBe("ORIGINE_REFUSEE");
  });

  it("accepte une écriture venant de l'application elle-même", async () => {
    const c = creerBanc().client();
    const r = await c("POST", "/api/acces/gestionnaire", { code: CODE_GESTIONNAIRE_INITIAL }, {
      origin: "http://localhost",
    });
    expect(r.statut).toBe(200);
  });

  it("refuse une écriture qui n'est pas en JSON", async () => {
    const c = creerBanc().client();
    const r = await c("POST", "/api/acces/gestionnaire", { code: CODE_GESTIONNAIRE_INITIAL }, {
      "content-type": "text/plain",
    });
    expect(r.statut).toBe(400);
  });

  it("les réponses de l'API ne sont jamais mises en cache", async () => {
    const banc = creerBanc();
    const { creerApp } = await import("../src/app");
    const { env } = await import("cloudflare:workers");
    const reponse = await creerApp().request("/api/session", {}, env);
    expect(reponse.headers.get("cache-control")).toBe("no-store");
    expect(banc).toBeDefined();
  });
});
