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
    showFieldError,
    stateBadge,
} from "../dom.js";

const form = byId("form-equipement");
const tbody = byId("corps-tableau-equipements");
const edit = createEditState({ form, cancelButton: byId("bouton-annuler-equipement") });

function readForm() {
    return {
        code: byId("code").value.trim(),
        designation: byId("designation").value.trim(),
        type: byId("type").value.trim(),
        localisation: byId("localisation").value.trim(),
        etat: byId("etat").value,
        date_mise_service: byId("date_equipement").value,
    };
}

function validate(data) {
    let valid = true;
    const rules = [
        [data.code === "", "erreur-code", "Le code est obligatoire."],
        [data.designation === "", "erreur-designation", "La désignation est obligatoire."],
        [data.date_mise_service === "", "erreur-date", "La date est obligatoire."],
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
    const params = new URLSearchParams();
    const search = byId("recherche-equipement").value.trim();
    const type = byId("filtre-type").value.trim();
    const etat = byId("filtre-etat").value;
    if (search) params.set("recherche", search);
    if (type) params.set("type", type);
    if (etat) params.set("etat", etat);

    const equipements = await api(`/equipements?${params}`);
    tbody.replaceChildren();
    if (equipements.length === 0) {
        tbody.append(emptyRow(7, "Aucun équipement trouvé."));
        return;
    }
    for (const eq of equipements) {
        tbody.append(
            h("tr", {}, [
                h("td", {}, eq.code),
                h("td", {}, eq.designation),
                h("td", {}, eq.type ?? ""),
                h("td", {}, eq.localisation ?? ""),
                h("td", {}, stateBadge(eq.etat)),
                h("td", {}, dateOnly(eq.date_mise_service)),
                h("td", { class: "actions-table" }, [
                    actionButton("Modifier", () => startEdit(eq.id)),
                    actionButton("Supprimer", () => remove(eq.id)),
                ]),
            ]),
        );
    }
}

async function startEdit(id) {
    try {
        const eq = await api(`/equipements/${id}`);
        byId("code").value = eq.code;
        byId("designation").value = eq.designation;
        byId("type").value = eq.type ?? "";
        byId("localisation").value = eq.localisation ?? "";
        byId("etat").value = eq.etat;
        byId("date_equipement").value = dateOnly(eq.date_mise_service);
        edit.startEditing(id);
    } catch (error) {
        report(error);
    }
}

async function remove(id) {
    if (!confirm("Supprimer cet équipement ? Ses pannes et interventions seront aussi supprimées.")) return;
    try {
        await api(`/equipements/${id}`, { method: "DELETE" });
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
    const data = readForm();
    if (!validate(data)) return;
    try {
        if (edit.editingId) await api(`/equipements/${edit.editingId}`, { method: "PUT", body: data });
        else await api("/equipements", { method: "POST", body: data });
        edit.reset();
        await loadList();
    } catch (error) {
        showFieldError("erreur-code", errorMessage(error));
    }
});

byId("bouton-annuler-equipement").addEventListener("click", () => edit.reset());
byId("recherche-equipement").addEventListener("input", () => loadList().catch(report));
byId("filtre-type").addEventListener("input", () => loadList().catch(report));
byId("filtre-etat").addEventListener("change", () => loadList().catch(report));

initSession().then(loadList).catch(report);
