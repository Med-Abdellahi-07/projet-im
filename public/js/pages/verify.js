import { api, errorMessage } from "../api.js";
import { byId, hideGlobalError, showFieldError, hideFieldError, showGlobalError } from "../dom.js";

const email = sessionStorage.getItem("emailEnAttenteVerification");
if (!email) window.location.href = "login.html";

if (new URLSearchParams(window.location.search).get("depuis") === "login") {
    byId("texte-explication").textContent =
        "Ce compte n'est pas encore vérifié. Saisissez le code à 6 chiffres envoyé par email pour l'activer.";
}

function showInfo(message) {
    const info = byId("message-code-test");
    info.textContent = message;
    info.hidden = false;
}

const testCode = sessionStorage.getItem("codeDeTest");
if (testCode) showInfo(`Mode développement (aucun serveur email configuré) : votre code est ${testCode}`);

byId("form-verification").addEventListener("submit", async (event) => {
    event.preventDefault();
    hideGlobalError();

    const code = byId("code").value.trim();
    if (!/^[0-9]{6}$/.test(code)) {
        showFieldError("erreur-code", "Entrez les 6 chiffres du code.");
        return;
    }
    hideFieldError("erreur-code");

    const button = event.target.querySelector("button[type=submit]");
    button.disabled = true;
    button.textContent = "Vérification...";
    try {
        await api("/auth/verification", { method: "POST", body: { email, code }, redirectOn401: false });
        sessionStorage.removeItem("emailEnAttenteVerification");
        sessionStorage.removeItem("codeDeTest");
        window.location.href = "login.html?verifie=1";
    } catch (error) {
        showGlobalError(errorMessage(error));
        button.disabled = false;
        button.textContent = "Vérifier le compte";
    }
});

byId("lien-renvoyer").addEventListener("click", async (event) => {
    event.preventDefault();
    hideGlobalError();
    try {
        const result = await api("/auth/renvoyer-code", {
            method: "POST",
            body: { email },
            redirectOn401: false,
        });
        if (result.codeDeTest) {
            sessionStorage.setItem("codeDeTest", result.codeDeTest);
            showInfo(
                `Mode développement (aucun serveur email configuré) : votre nouveau code est ${result.codeDeTest}`,
            );
        } else {
            showInfo(result.message);
        }
    } catch (error) {
        showGlobalError(errorMessage(error));
    }
});
