import { api, errorMessage } from "../api.js";
import { initSession } from "../session.js";
import { byId, h } from "../dom.js";

function indicator(value, label, tone = "") {
    return h("div", { class: `indicateur ${tone}`.trim() }, [
        h("div", { class: "valeur" }, String(value)),
        h("div", { class: "libelle" }, label),
    ]);
}

async function render() {
    const stats = await api("/dashboard");
    const priorities = stats.pannesOuvertesParPriorite;
    byId("indicateurs").replaceChildren(
        indicator(stats.totalEquipements, "Équipements au total", "accent"),
        indicator(stats.enService, "En service", "ok"),
        indicator(stats.enPanne, "En panne", "danger"),
        indicator(stats.enMaintenance, "En maintenance", "alerte"),
        indicator(stats.pannesOuvertes, "Pannes ouvertes", "danger"),
        indicator(stats.totalPannes, "Pannes déclarées"),
        indicator(stats.totalInterventions, "Interventions réalisées"),
        indicator(stats.interventionsCeMois, "Interventions ce mois-ci", "accent"),
        indicator(priorities.Haute, "Pannes ouvertes : priorité haute", "danger"),
        indicator(priorities.Moyenne, "Pannes ouvertes : priorité moyenne", "alerte"),
        indicator(priorities.Basse, "Pannes ouvertes : priorité basse", "ok"),
    );
}

initSession()
    .then(render)
    .catch((error) => alert(errorMessage(error)));
