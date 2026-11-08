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
    statusBadge,
} from "../dom.js";

const form = byId("form-panne");
const tbody = byId("corps-tableau-pannes");
const statusField = byId("champ-statut");
const edit = createEditState({
    form,
    cancelButton: byId("bouton-annuler-panne"),
    onReset: () => {
        statusField.hidden = true;
    },
});

async function fillEquipements() {
    const select = byId("equipement");
    const equipements = await api("/equipements");
    select.replaceChildren(h("option", { value: "" }, "-- Choisir un équipement --"));
    for (const eq of equipements) {
        select.append(h("option", { value: eq.id }, `${eq.code} - ${eq.designation}`));
    }
}

function validate(data) {
    let valid = true;
    const rules = [
        [data.equipement_id === "", "erreur-equipement", "Choisissez un équipement."],
        [data.date_panne === "", "erreur-date-panne", "La date est obligatoire."],
        [data.description === "", "erreur-description", "La description est obligatoire."],
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

async function loadList() {
    const pannes = await api("/pannes");
    tbody.replaceChildren();
    if (pannes.length === 0) {
        tbody.append(emptyRow(6, "Aucune panne enregistrée."));
        return;
    }
    for (const p of pannes) {
        tbody.append(
            h("tr", {}, [
                h("td", {}, `${p.code} - ${p.designation}`),
                h("td", {}, dateOnly(p.date_panne)),
                h("td", {}, p.description ?? ""),
                h("td", {}, priorityBadge(p.priorite)),
                h("td", {}, [
                    statusBadge(p.statut),
                    p.date_resolution ? ` le ${dateOnly(p.date_resolution)}` : null,
                ]),
                h("td", { class: "actions-table" }, [
                    actionButton("Modifier", () => startEdit(p.id)),
                    actionButton("Supprimer", () => remove(p.id)),
                ]),
            ]),
        );
    }
}

async function startEdit(id) {
    try {
        const p = await api(`/pannes/${id}`);
        byId("equipement").value = p.equipement_id;
        byId("date_panne").value = dateOnly(p.date_panne);
        byId("description").value = p.description ?? "";
        byId("priorite").value = p.priorite;
        byId("statut").value = p.statut;
        statusField.hidden = false;
        edit.startEditing(id);
    } catch (error) {
        report(error);
    }
}

async function remove(id) {
    if (!confirm("Supprimer cette panne ?")) return;
    try {
        await api(`/pannes/${id}`, { method: "DELETE" });
        await loadList();
    } catch (error) {
        report(error);
    }
}

function report(error) {
    alert(errorMessage(error));
}

form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = {
        equipement_id: byId("equipement").value,
        date_panne: byId("date_panne").value,
        description: byId("description").value.trim(),
        priorite: byId("priorite").value,
    };
    if (!validate(data)) return;
    try {
        if (edit.editingId) {
            data.statut = byId("statut").value;
            await api(`/pannes/${edit.editingId}`, { method: "PUT", body: data });
        } else {
            await api("/pannes", { method: "POST", body: data });
        }
        edit.reset();
        await loadList();
    } catch (error) {
        showFieldError("erreur-equipement", errorMessage(error));
    }
});

byId("bouton-annuler-panne").addEventListener("click", () => edit.reset());

initSession()
    .then(() => Promise.all([fillEquipements(), loadList()]))
    .catch(report);
