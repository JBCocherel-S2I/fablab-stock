// Appels à l'API. Une réponse en erreur devient une exception portant le
// message en français renvoyé par le serveur.

export class ErreurApi extends Error {
  constructor(message, statut, code, details = {}) {
    super(message);
    this.statut = statut;
    this.code = code;
    this.details = details;
  }
}

let surAccesPerdu = () => {};

/** Fonction appelée quand le serveur signale une session ou un mode gestionnaire perdu. */
export function ecouterAccesPerdu(fonction) {
  surAccesPerdu = fonction;
}

export async function appeler(methode, chemin, corps) {
  let reponse;
  try {
    reponse = await fetch(`/api${chemin}`, {
      method: methode,
      headers: methode === "GET" ? { accept: "application/json" } : { "content-type": "application/json" },
      body: methode === "GET" ? undefined : JSON.stringify(corps ?? {}),
      credentials: "same-origin",
    });
  } catch {
    throw new ErreurApi("Le serveur ne répond pas. Vérifiez la connexion internet.", 0, "HORS_LIGNE");
  }

  let donnees = {};
  try {
    donnees = await reponse.json();
  } catch {
    // Réponse sans JSON : traitée comme une erreur ci-dessous si le statut l'indique.
  }

  if (!reponse.ok) {
    const { erreur, code, ...details } = donnees;
    const exception = new ErreurApi(erreur || "Une erreur est survenue. Réessayez.", reponse.status, code, details);
    if (code === "SESSION_REQUISE" || code === "GESTIONNAIRE_REQUIS") surAccesPerdu(exception);
    throw exception;
  }
  return donnees;
}
