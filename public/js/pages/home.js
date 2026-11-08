import { api, errorMessage } from "../api.js";
import { initSession } from "../session.js";
import { byId, dateOnly, h } from "../dom.js";

function indicator(value, label, tone = "") {
    return h("div", { class: `indicateur ${tone}`.trim() }, [
        h("div", { class: "valeur" }, String(value)),
        h("div", { class: "libelle" }, label),
    ]);
}

/** Compact summary under the module cards, built from the existing API. */
async function renderSummary() {
    const [stats, interventions] = await Promise.all([api("/dashboard"), api("/interventions")]);

    byId("resume-indicateurs").replaceChildren(
        indicator(stats.enService, "Équipements en service", "ok"),
        indicator(stats.enPanne, "Équipements en panne", "danger"),
        indicator(stats.enMaintenance, "En maintenance", "alerte"),
        indicator(stats.pannesOuvertes, "Pannes ouvertes", "danger"),
    );

    const list = byId("resume-interventions");
    const latest = interventions.slice(0, 3);
    if (latest.length === 0) {
        list.replaceChildren(h("li", {}, "Aucune intervention enregistrée."));
    } else {
        list.replaceChildren(
            ...latest.map((i) =>
                h("li", {}, [
                    h("span", { class: "date" }, dateOnly(i.date_intervention)),
                    h("strong", {}, `${i.code} - ${i.designation}`),
                    h("span", {}, i.technicien),
                ]),
            ),
        );
    }
    byId("resume-accueil").hidden = false;
}

initSession()
    .then(renderSummary)
    // The summary is a bonus: if it fails the module cards still work.
    .catch((error) => console.error(errorMessage(error)));
