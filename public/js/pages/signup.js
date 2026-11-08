import { api, errorMessage } from "../api.js";
import { byId, hideFieldError, hideGlobalError, showFieldError, showGlobalError } from "../dom.js";

byId("form-inscription").addEventListener("submit", async (event) => {
    event.preventDefault();
    hideGlobalError();

    const email = byId("email").value.trim();
    const motDePasse = byId("mot_de_passe").value;
    const confirmation = byId("confirmation").value;

    let valid = true;
    const rules = [
        [email === "", "erreur-email", "L'adresse email est obligatoire."],
        [
            motDePasse.length < 8,
            "erreur-mot-de-passe",
            "Le mot de passe doit contenir au moins 8 caractères.",
        ],
        [confirmation !== motDePasse, "erreur-confirmation", "Les mots de passe ne correspondent pas."],
    ];
    for (const [failed, id, message] of rules) {
        if (failed) {
            showFieldError(id, message);
            valid = false;
        } else {
            hideFieldError(id);
        }
    }
    if (!valid) return;

    const button = event.target.querySelector("button[type=submit]");
    button.disabled = true;
    button.textContent = "Création...";
    try {
        const result = await api("/auth/inscription", {
            method: "POST",
            body: { email, mot_de_passe: motDePasse },
            redirectOn401: false,
        });
        sessionStorage.setItem("emailEnAttenteVerification", email);
        // Only present when the server runs in development mode without SMTP.
        if (result.codeDeTest) sessionStorage.setItem("codeDeTest", result.codeDeTest);
        else sessionStorage.removeItem("codeDeTest");
        window.location.href = "verification.html?depuis=inscription";
    } catch (error) {
        showGlobalError(errorMessage(error));
        button.disabled = false;
        button.textContent = "Créer mon compte";
    }
});
