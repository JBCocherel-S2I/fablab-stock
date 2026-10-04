// Erreur métier renvoyée par l'API : { erreur: "message en français", code: "CODE", ... }.

export type StatutErreur = 400 | 401 | 403 | 404 | 409 | 429 | 503;

export class ErreurApi extends Error {
  constructor(
    public readonly statut: StatutErreur,
    public readonly code: string,
    message: string,
    public readonly details: Record<string, unknown> = {},
  ) {
    super(message);
  }
}
