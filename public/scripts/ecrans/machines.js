// Administration : machines (4.3, 5.7).

import { appeler } from "../api.js";
import { champ } from "../dom.js";
import { TYPES, libelleType } from "../matiere.js";
import { afficherListe, champSegment } from "./liste.js";

export function afficherMachines(zone) {
  return afficherListe(zone, {
    charger: async () => (await appeler("GET", "/administration/machines")).machines,
    compte: (machines) => {
      const actives = machines.filter((m) => m.actif).length;
      return `${actives} machine${actives > 1 ? "s" : ""} active${actives > 1 ? "s" : ""}`;
    },
    libelleAjout: "+ Ajouter une machine",
    texteVide: "Aucune machine pour le moment. Ajoutez une première machine.",
    colonnes: [
      { titre: "Machine", classe: "nom", cellule: (m) => m.nom },
      { titre: "Matière utilisée", cellule: (m) => libelleType(m.type) },
    ],
    nom: (m) => m.nom,
    titrePanneau: (m) => (m ? `Modifier : ${m.nom}` : "Ajouter une machine"),
    champs: (m) => {
      const nom = champ(
        "Nom",
        { name: "nom", type: "text", required: true, maxlength: 60, autocomplete: "off", value: m?.nom ?? "" },
        "Par exemple « Imprimante 1 » ou « Découpeuse laser ».",
      );
      const type = champSegment("Matière utilisée", "type", TYPES, m?.type ?? "filament");
      return { blocs: [nom.bloc, type.bloc], lire: () => ({ nom: nom.saisie.value, type: type.lire() }) };
    },
    enregistrer: async (m, valeurs) => {
      const { machine } = m
        ? await appeler("PATCH", `/administration/machines/${m.id}`, valeurs)
        : await appeler("POST", "/administration/machines", valeurs);
      return m ? `Machine enregistrée : « ${machine.nom} ».` : `« ${machine.nom} » est ajoutée.`;
    },
    basculer: async (m) => {
      await appeler("PATCH", `/administration/machines/${m.id}`, { actif: !m.actif });
      return `« ${m.nom} » est ${m.actif ? "désactivée" : "réactivée"}.`;
    },
    aide: (m) =>
      m.actif
        ? "Une machine désactivée n'est plus proposée au prélèvement mais reste visible dans l'historique."
        : "Cette machine est désactivée : elle n'est plus proposée au prélèvement.",
  });
}
