/**
 * DOM helpers. Nothing here builds HTML from strings: values are always set
 * with textContent, so data coming from the API can never inject markup.
 */

/** h("td", { class: "x", onclick: fn }, "text" | Node | [children]) */
export function h(tag, attributes = {}, children = []) {
    const element = document.createElement(tag);
    for (const [name, value] of Object.entries(attributes)) {
        if (value === undefined || value === null || value === false) continue;
        if (name.startsWith("on") && typeof value === "function") {
            element.addEventListener(name.slice(2).toLowerCase(), value);
        } else if (name === "class") {
            element.className = value;
        } else {
            element.setAttribute(name, value === true ? "" : value);
        }
    }
    for (const child of Array.isArray(children) ? children : [children]) {
        if (child === null || child === undefined || child === false) continue;
        element.append(child instanceof Node ? child : document.createTextNode(String(child)));
    }
    return element;
}

export function byId(id) {
    return document.getElementById(id);
}

export function showFieldError(id, message) {
    const element = byId(id);
    if (!element) return;
    element.textContent = message;
    element.classList.add("visible");
}

export function hideFieldError(id) {
    const element = byId(id);
    if (!element) return;
    element.classList.remove("visible");
    element.textContent = "";
}

export function showGlobalError(message) {
    showFieldError("message-erreur-globale", message);
}

export function hideGlobalError() {
    hideFieldError("message-erreur-globale");
}

/** Only the first 10 characters of an ISO date (YYYY-MM-DD). */
export function dateOnly(value) {
    return value ? String(value).slice(0, 10) : "";
}

export function stateBadge(etat) {
    const css = { "En panne": "badge-panne", "En maintenance": "badge-maintenance" }[etat] || "badge-service";
    return h("span", { class: `badge ${css}` }, etat);
}

export function priorityBadge(priorite) {
    const css = { Haute: "badge-haute", Basse: "badge-basse" }[priorite] || "badge-moyenne";
    return h("span", { class: `badge ${css}` }, priorite);
}

export function statusBadge(statut) {
    const css = statut === "Ouverte" ? "badge-panne" : "badge-service";
    return h("span", { class: `badge ${css}` }, statut);
}

export function actionButton(label, onClick) {
    return h("button", { type: "button", class: "secondaire", onclick: onClick }, label);
}

export function emptyRow(columns, message) {
    return h("tr", {}, h("td", { colspan: String(columns) }, message));
}
