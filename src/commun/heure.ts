// Dates : enregistrées en UTC côté serveur, affichées en heure de Paris (règle 6).

const FUSEAU = "Europe/Paris";

const FORMAT_PARIS = new Intl.DateTimeFormat("fr-FR", {
  timeZone: FUSEAU,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const FORMAT_PARTIES = new Intl.DateTimeFormat("en-CA", {
  timeZone: FUSEAU,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

/** Horodatage à enregistrer en base : ISO 8601, UTC. */
export function horodatage(date: Date = new Date()): string {
  return date.toISOString();
}

/** Affichage en heure de Paris, par exemple "03/10/2026 18:42". */
export function enHeureDeParis(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return FORMAT_PARIS.format(d).replace(",", "");
}

function parties(date: Date): Record<string, number> {
  return Object.fromEntries(
    FORMAT_PARTIES.formatToParts(date)
      .filter((p) => p.type !== "literal")
      .map((p) => [p.type, Number(p.value)]),
  );
}

/** Jour calendaire à Paris, au format AAAA-MM-JJ. */
export function jourDeParis(date: Date): string {
  const p = parties(date);
  const deux = (n: number) => String(n).padStart(2, "0");
  return `${p.year}-${deux(p.month!)}-${deux(p.day!)}`;
}

/** Vrai pour une date du type AAAA-MM-JJ qui existe au calendrier. */
export function estJourValide(jour: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(jour);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.toISOString().slice(0, 10) === jour;
}

/**
 * Instant (UTC) où commence un jour à Paris. Le décalage avec UTC dépend de
 * l'heure d'été : il est lu dans le fuseau lui-même, jamais supposé.
 */
export function debutDuJourDeParis(jour: string): Date {
  const [annee, mois, numero] = jour.split("-").map(Number) as [number, number, number];
  const minuitUtc = Date.UTC(annee, mois - 1, numero);
  // Heure qu'il est à Paris quand il est minuit UTC ce jour-là : c'est le décalage.
  const p = parties(new Date(minuitUtc));
  const vuDeParis = Date.UTC(p.year!, p.month! - 1, p.day!, p.hour!, p.minute!, p.second!);
  return new Date(minuitUtc - (vuDeParis - minuitUtc));
}

/** Jour suivant, au format AAAA-MM-JJ. */
export function jourSuivant(jour: string): string {
  const [annee, mois, numero] = jour.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(annee, mois - 1, numero + 1)).toISOString().slice(0, 10);
}
