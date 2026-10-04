// Hachage des codes d'accès : PBKDF2-SHA256 avec sel aléatoire (API Web Crypto).
// Format stocké : pbkdf2-sha256$iterations$sel$empreinte (sel et empreinte en base64).
// Le nombre d'itérations est écrit dans le hachage : on peut le changer plus tard
// sans invalider les codes existants.

/** Maximum accepté par Cloudflare Workers pour PBKDF2, et valeur par défaut. */
export const ITERATIONS = 100_000;
const ITERATIONS_MIN = 1_000;

/**
 * Nombre d'itérations lu dans la variable ITERATIONS_HACHAGE (wrangler.jsonc).
 * Il se règle au déploiement selon le temps de calcul réellement disponible.
 */
export function lireIterations(valeur: unknown): number {
  const n = Number(valeur);
  return Number.isInteger(n) && n >= ITERATIONS_MIN && n <= ITERATIONS ? n : ITERATIONS;
}

const encodeur = new TextEncoder();

function versBase64(octets: Uint8Array): string {
  return btoa(String.fromCharCode(...octets));
}

function depuisBase64(texte: string): Uint8Array {
  return Uint8Array.from(atob(texte), (c) => c.charCodeAt(0));
}

/** Les espaces en début et en fin de saisie sont ignorés (claviers de téléphone). */
export function normaliserCode(code: string): string {
  return code.normalize("NFC").trim();
}

async function deriver(code: string, sel: Uint8Array, iterations: number): Promise<Uint8Array> {
  const cle = await crypto.subtle.importKey("raw", encodeur.encode(normaliserCode(code)), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: sel, iterations },
    cle,
    256,
  );
  return new Uint8Array(bits);
}

export async function hacherCode(code: string, iterations: number = ITERATIONS): Promise<string> {
  const sel = crypto.getRandomValues(new Uint8Array(16));
  const empreinte = await deriver(code, sel, iterations);
  return `pbkdf2-sha256$${iterations}$${versBase64(sel)}$${versBase64(empreinte)}`;
}

export async function verifierCode(code: string, hachage: string): Promise<boolean> {
  const [algo, iterations, sel, attendu] = hachage.split("$");
  if (algo !== "pbkdf2-sha256" || !iterations || !sel || !attendu) return false;
  const calcule = await deriver(code, depuisBase64(sel), Number(iterations));
  const reference = depuisBase64(attendu);
  if (calcule.length !== reference.length) return false;
  // Comparaison en temps constant.
  let ecart = 0;
  for (let i = 0; i < calcule.length; i++) ecart |= calcule[i]! ^ reference[i]!;
  return ecart === 0;
}

/** Empreinte SHA-256 en hexadécimal (jetons de session, adresses IP). */
export async function empreinte(texte: string): Promise<string> {
  const octets = new Uint8Array(await crypto.subtle.digest("SHA-256", encodeur.encode(texte)));
  return [...octets].map((o) => o.toString(16).padStart(2, "0")).join("");
}

/** Jeton aléatoire de 256 bits, utilisable dans un cookie. */
export function jetonAleatoire(): string {
  return versBase64(crypto.getRandomValues(new Uint8Array(32)))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}
