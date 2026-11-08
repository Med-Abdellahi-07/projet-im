import { api, ApiError, errorMessage } from "../api.js";
import { byId, hideFieldError, hideGlobalError, showFieldError, showGlobalError } from "../dom.js";

if (new URLSearchParams(window.location.search).get("verifie") === "1") {
    const success = byId("message-succes");
    success.textContent = "Votre compte a été vérifié avec succès. Vous pouvez vous connecter.";
    success.hidden = false;
}

byId("form-connexion").addEventListener("submit", async (event) => {
    event.preventDefault();
    hideGlobalError();

    const email = byId("email").value.trim();
    const motDePasse = byId("mot_de_passe").value;

    let valid = true;
    if (email === "") {
        showFieldError("erreur-email", "L'adresse email est obligatoire.");
        valid = false;
    } else {
        hideFieldError("erreur-email");
    }
    if (motDePasse === "") {
        showFieldError("erreur-mot-de-passe", "Le mot de passe est obligatoire.");
        valid = false;
    } else {
        hideFieldError("erreur-mot-de-passe");
    }
    if (!valid) return;

    const button = event.target.querySelector("button[type=submit]");
    button.disabled = true;
    button.textContent = "Connexion...";
    try {
        const result = await api("/auth/connexion", {
            method: "POST",
            body: { email, mot_de_passe: motDePasse },
            redirectOn401: false,
        });
        // Only used for an instant redirect and display: the cookie is what counts.
        localStorage.setItem("utilisateurConnecte", JSON.stringify({ email: result.utilisateur.email }));
        window.location.href = "accueil.html";
    } catch (error) {
        if (error instanceof ApiError && error.status === 403 && error.body.nonVerifie) {
            sessionStorage.setItem("emailEnAttenteVerification", email);
            window.location.href = "verification.html?depuis=login";
            return;
        }
        showGlobalError(errorMessage(error));
        button.disabled = false;
        button.textContent = "Se connecter";
    }
});
