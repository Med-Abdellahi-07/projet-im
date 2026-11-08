/**
 * Small wrapper around fetch for the JSON API (same origin, session cookie).
 * A 401 answer on a protected call sends the user back to the login page:
 * the server decides who is logged in.
 */

export class ApiError extends Error {
    constructor(status, body) {
        super((body && body.message) || "Erreur inattendue.");
        this.status = status;
        this.body = body || {};
        this.field = this.body.champ;
    }
}

export async function api(path, { method = "GET", body, redirectOn401 = true } = {}) {
    const options = { method, headers: {}, credentials: "same-origin" };
    if (body !== undefined) {
        options.headers["Content-Type"] = "application/json";
        options.body = JSON.stringify(body);
    }
    const response = await fetch(`/api${path}`, options);
    const data = await response.json().catch(() => null);
    if (response.status === 401 && redirectOn401) {
        localStorage.removeItem("utilisateurConnecte");
        window.location.href = "login.html";
        // Never resolves: the page is being replaced.
        return new Promise(() => {});
    }
    if (!response.ok) throw new ApiError(response.status, data);
    return data;
}

export function networkErrorMessage() {
    return "Impossible de contacter le serveur. Vérifiez votre connexion et réessayez.";
}

/** Text to show for any error: the server's message, or a network message (the cause is logged). */
export function errorMessage(error) {
    if (error instanceof ApiError) return error.message;
    console.error(error);
    return networkErrorMessage();
}
