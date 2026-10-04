-- Migration 0002 : accès (spécifications, sections 5.1 et 7).

-- Session d'un appareil. Le jeton du cookie n'est jamais stocké : on ne garde
-- que son empreinte SHA-256.
CREATE TABLE session (
  jeton_hache         TEXT PRIMARY KEY,
  cree_le             TEXT NOT NULL,
  vu_le               TEXT NOT NULL,
  expire_le           TEXT NOT NULL,
  -- Dernière activité en mode gestionnaire, NULL si le mode n'est pas ouvert.
  gestionnaire_vu_le  TEXT
);

CREATE INDEX session_par_expiration ON session (expire_le);

-- Essais de saisie de code, pour limiter les tentatives répétées.
-- `origine` est l'empreinte de l'adresse IP, jamais l'adresse elle-même.
CREATE TABLE tentative (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  type      TEXT NOT NULL CHECK (type IN ('commun', 'gestionnaire')),
  origine   TEXT NOT NULL,
  cree_le   TEXT NOT NULL
);

CREATE INDEX tentative_par_type ON tentative (type, cree_le);
