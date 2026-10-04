// Avant chaque fichier de test : applique les migrations sur la base de test.

import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";

await applyD1Migrations(env.DB, env.MIGRATIONS_TEST);
