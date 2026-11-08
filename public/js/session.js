/**
 * Page protection and sidebar for the internal pages.
 *
 * The server is the authority: GET /api/auth/moi answers 401 when there is no
 * valid session cookie. localStorage only holds the e-mail for an instant
 * redirect and display, it grants nothing.
 */

import { api } from "./api.js";
import { byId } from "./dom.js";

export async function initSession() {
    if (!localStorage.getItem("utilisateurConnecte")) {
        window.location.href = "login.html";
        return new Promise(() => {});
    }

    const { utilisateur } = await api("/auth/moi");
    localStorage.setItem("utilisateurConnecte", JSON.stringify({ email: utilisateur.email }));

    const avatar = byId("avatar-utilisateur");
    const email = byId("email-utilisateur");
    const welcome = byId("message-bienvenue");
    if (avatar) avatar.textContent = utilisateur.email.charAt(0).toUpperCase();
    if (email) email.textContent = utilisateur.email;
    if (welcome) welcome.textContent = `Bienvenue, ${utilisateur.email}`;

    const logout = byId("lien-deconnexion");
    if (logout) {
        logout.addEventListener("click", async (event) => {
            event.preventDefault();
            try {
                await api("/auth/deconnexion", { method: "POST", redirectOn401: false });
            } finally {
                localStorage.removeItem("utilisateurConnecte");
                window.location.href = "login.html";
            }
        });
    }
    return utilisateur;
}
