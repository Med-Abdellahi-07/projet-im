import { api, errorMessage } from "../api.js";
import { initSession } from "../session.js";
import { createEditState } from "../crud-form.js";
import {
    actionButton,
    byId,
    dateOnly,
    emptyRow,
    h,
    hideFieldError,
    priorityBadge,
    showFieldError,
} from "../dom.js";

const form = byId("form-intervention");
const tbody = byId("corps-tableau-interventions");
const select = byId("equipement_intervention");
const pannesBox = byId("pannes_liees");
const EMPTY = "Choisissez d'abord un équipement.";

const edit = createEditState({
    form,
    cancelButton: byId("bouton-annuler-intervention"),
    onReset: () => pannesBox.replaceChildren(h("div", { class: "vide" }, EMPTY)),
});

async function fillEquipements() {
    const equipements = await api("/equipements");
    select.replaceChildren(h("option", { value: "" }, "-- Choisir un équipement --"));
    for (const eq of equipements) {
        select.append(h("option", { value: eq.id }, `${eq.code} - ${eq.designation}`));
    }
}

/**
 * Lists the breakdowns that this intervention can resolve: the open ones of the
 * equipment, plus the ones already linked to it when editing.
 */
async function showPannes(equipementId, checkedIds = []) {
    if (!equipementId) {
        pannesBox.replaceChildren(h("div", { class: "vide" }, EMPTY));
        return;
    }
    const pannes = await api(`/equipements/${equipementId}/pannes`);
    const usable = pannes.filter((p) => p.statut === "Ouverte" || checkedIds.includes(p.id));
    if (usable.length === 0) {
        pannesBox.replaceChildren(h("div", { class: "vide" }, "Aucune panne ouverte pour cet équipement."));
        return;
    }
    pannesBox.replaceChildren(
        ...usable.map((p) =>
            h("label", {}, [
                h("input", {
                    type: "checkbox",
                    name: "panne_liee",
                    value: p.id,
                    checked: checkedIds.includes(p.id),
                }),
                ` ${dateOnly(p.date_panne)} — ${p.description} `,
                priorityBadge(p.priorite),
            ]),
        ),
    );
}

async function loadList() {
    const interventions = await api("/interventions");
    tbody.replaceChildren();
    if (interventions.length === 0) {
        tbody.append(emptyRow(6, "Aucune intervention enregistrée."));
        return;
    }
    for (const i of interventions) {
        tbody.append(
            h("tr", {}, [
                h("td", {}, `${i.code} - ${i.designation}`),
                h("td", {}, dateOnly(i.date_intervention)),
                h("td", {}, i.technicien),
                h("td", {}, i.pannes_resolues || "—"),
                h("td", {}, i.observations ?? ""),
                h("td", { class: "actions-table" }, [
                    actionButton("Modifier", () => startEdit(i.id)),
                    actionButton("Supprimer", () => remove(i.id)),
                ]),
            ]),
        );
    }
}

async function startEdit(id) {
    try {
        const i = await api(`/interventions/${id}`);
        select.value = i.equipement_id;
        byId("date_intervention").value = dateOnly(i.date_intervention);
        byId("technicien").value = i.technicien;
        byId("observations").value = i.observations ?? "";
        await showPannes(i.equipement_id, i.panne_ids);
        edit.startEditing(id);
    } catch (error) {
        report(error);
    }
}

async function remove(id) {
    if (!confirm("Supprimer cette intervention ? Les pannes qu'elle seule résolvait seront rouvertes."))
        return;
    try {
        await api(`/interventions/${id}`, { method: "DELETE" });
        await loadList();
    } catch (error) {
        report(error);
    }
}

function report(error) {
    alert(errorMessage(error));
}

function validate(data) {
    let valid = true;
    const rules = [
        [data.equipement_id === "", "erreur-equipement-int", "Choisissez un équipement."],
        [data.date_intervention === "", "erreur-date-int", "La date est obligatoire."],
        [data.technicien === "", "erreur-technicien", "Le nom du technicien est obligatoire."],
    ];
    for (const [failed, id, message] of rules) {
        if (failed) {
            showFieldError(id, message);
            valid = false;
        } else {
            hideFieldError(id);
        }
    }
    return valid;
}

select.addEventListener("change", () => showPannes(select.value).catch(report));

form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = {
        equipement_id: select.value,
        date_intervention: byId("date_intervention").value,
        technicien: byId("technicien").value.trim(),
        observations: byId("observations").value.trim(),
        panne_ids: [...pannesBox.querySelectorAll("input[name=panne_liee]:checked")].map((input) =>
            Number(input.value),
        ),
    };
    if (!validate(data)) return;
    try {
        if (edit.editingId) await api(`/interventions/${edit.editingId}`, { method: "PUT", body: data });
        else await api("/interventions", { method: "POST", body: data });
        edit.reset();
        await loadList();
    } catch (error) {
        showFieldError("erreur-equipement-int", errorMessage(error));
    }
});

byId("bouton-annuler-intervention").addEventListener("click", () => edit.reset());

initSession()
    .then(() => Promise.all([fillEquipements(), loadList()]))
    .catch(report);
