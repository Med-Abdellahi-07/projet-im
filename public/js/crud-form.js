/** Shared behavior of the "create or edit" forms of the three resource pages. */

import { byId } from "./dom.js";

export function createEditState({ form, cancelButton, defaultLabel = "Enregistrer", onReset = () => {} }) {
    const submit = form.querySelector("button[type=submit]");
    return {
        get editingId() {
            return form.dataset.modificationId || null;
        },
        startEditing(id) {
            form.dataset.modificationId = String(id);
            submit.textContent = "Mettre à jour";
            cancelButton.hidden = false;
            window.scrollTo({ top: 0, behavior: "smooth" });
        },
        reset() {
            form.reset();
            delete form.dataset.modificationId;
            submit.textContent = defaultLabel;
            cancelButton.hidden = true;
            onReset();
        },
    };
}

export function field(id) {
    return byId(id);
}
