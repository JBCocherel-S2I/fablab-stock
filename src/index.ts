// Point d'entrée du Worker : l'API. Les fichiers de l'interface (dossier public/)
// sont servis directement par Cloudflare, sans passer par ce code.

import { creerApp } from "./app";

export default creerApp();
