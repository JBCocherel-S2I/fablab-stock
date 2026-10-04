// Page d'état du service (etat.html) : interroge /api/etat et remplit les trois casiers.

import "./https.js";

function remplir(id, { valeur, detail, enService }) {
  const casier = document.getElementById(id);
  casier.dataset.etat = enService ? "ok" : "alerte";
  casier.querySelector(".casier-valeur").textContent = valeur;
  casier.querySelector(".casier-detail").textContent = detail;
  casier.querySelector(".casier-etat").textContent = enService ? "✓ En service" : "! En panne";
}

function toutEnPanne(detail) {
  for (const id of ["casier-application", "casier-base", "casier-heure"]) {
    remplir(id, { valeur: "Indisponible", detail, enService: false });
  }
}

async function verifier() {
  let etat;
  try {
    const reponse = await fetch("/api/etat", { headers: { accept: "application/json" } });
    etat = await reponse.json();
  } catch {
    toutEnPanne("Le serveur ne répond pas. Vérifiez la connexion internet.");
    return;
  }

  remplir("casier-application", {
    valeur: "Worker",
    detail: "Le serveur de l'application répond.",
    enService: true,
  });

  const base = etat.base;
  const baseComplete = base.accessible && base.manquantes.length === 0;
  remplir("casier-base", {
    valeur: `${base.tables.length} tables`,
    detail: !base.accessible
      ? "La base est inaccessible."
      : baseComplete
        ? base.tables.join(", ")
        : `Tables manquantes : ${base.manquantes.join(", ")}. Appliquez les migrations.`,
    enService: baseComplete,
  });

  remplir("casier-heure", {
    valeur: etat.heureParis,
    detail: "Heure de Paris",
    enService: true,
  });
}

verifier();
