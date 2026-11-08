/* =========================================================
   script.js
   Logique commune du projet "Industriel et Minier".
   Toutes les pages (sauf login/inscription/verification, qui ont
   leur propre script inline) passent par ce fichier : protection
   des pages par authentification, CRUD équipements/pannes/
   interventions via l'API du serveur backend, tableau de bord.
   ========================================================= */

const API_URL = "http://localhost:3000/api";

/* =========================================================
   AUTHENTIFICATION : protège les pages internes et remplit
   la barre latérale (email, initiale, déconnexion).
   ========================================================= */

function utilisateurActuel() {
    try {
        return JSON.parse(localStorage.getItem("utilisateurConnecte"));
    } catch (erreur) {
        return null;
    }
}

function initEnteteUtilisateur() {
    const carteAvatar = document.getElementById("avatar-utilisateur");
    const carteEmail = document.getElementById("email-utilisateur");
    const lienDeconnexion = document.getElementById("lien-deconnexion");

    /* Ces éléments n'existent que sur les pages internes
       (pas sur login/inscription/verification) */
    if (!carteAvatar && !lienDeconnexion) return;

    const utilisateur = utilisateurActuel();

    if (!utilisateur) {
        window.location.href = "login.html";
        return;
    }

    if (carteAvatar) carteAvatar.textContent = utilisateur.email.charAt(0).toUpperCase();
    if (carteEmail) carteEmail.textContent = utilisateur.email;

    if (lienDeconnexion) {
        lienDeconnexion.addEventListener("click", function (e) {
            e.preventDefault();
            localStorage.removeItem("utilisateurConnecte");
            window.location.href = "login.html";
        });
    }

    const messageBienvenue = document.getElementById("message-bienvenue");
    if (messageBienvenue) {
        messageBienvenue.textContent = "Bienvenue, " + utilisateur.email;
    }
}

/* ---------- Utilitaires de validation / affichage ---------- */

function afficherErreur(idErreur, message) {
    const el = document.getElementById(idErreur);
    if (!el) return;
    el.textContent = message;
    el.classList.add("visible");
}

function cacherErreur(idErreur) {
    const el = document.getElementById(idErreur);
    if (!el) return;
    el.classList.remove("visible");
    el.textContent = "";
}

function gererErreurReseau(erreur) {
    console.error(erreur);
    alert("Impossible de contacter le serveur. Vérifie qu'il est bien démarré (npm start dans le dossier backend).");
}

function echapperHtml(texte) {
    const div = document.createElement("div");
    div.textContent = texte ?? "";
    return div.innerHTML;
}

/* =========================================================
   BADGES D'ÉTAT / PRIORITÉ
   ========================================================= */

function classeBadgeEtat(etat) {
    if (etat === "En panne") return "badge badge-panne";
    if (etat === "En maintenance") return "badge badge-maintenance";
    return "badge badge-service";
}

function classeBadgePriorite(priorite) {
    if (priorite === "Haute") return "badge badge-haute";
    if (priorite === "Basse") return "badge badge-basse";
    return "badge badge-moyenne";
}

/* =========================================================
   PAGE EQUIPEMENTS (index.html)
   ========================================================= */

function initPageEquipements() {
    const form = document.getElementById("form-equipement");
    if (!form) return;

    const boutonAnnuler = document.getElementById("bouton-annuler-equipement");

    function reinitialiserFormulaire() {
        form.reset();
        delete form.dataset.modificationId;
        document.querySelector("#form-equipement button[type=submit]").textContent = "Enregistrer";
        boutonAnnuler.style.display = "none";
    }

    form.addEventListener("submit", async function (e) {
        e.preventDefault();

        const code = document.getElementById("code").value.trim();
        const designation = document.getElementById("designation").value.trim();
        const type = document.getElementById("type").value.trim();
        const localisation = document.getElementById("localisation").value.trim();
        const etat = document.getElementById("etat").value;
        const date_mise_service = document.getElementById("date_equipement").value;

        let valide = true;

        if (code === "") {
            afficherErreur("erreur-code", "Le code est obligatoire.");
            valide = false;
        } else {
            cacherErreur("erreur-code");
        }

        if (designation === "") {
            afficherErreur("erreur-designation", "La désignation est obligatoire.");
            valide = false;
        } else {
            cacherErreur("erreur-designation");
        }

        if (date_mise_service === "") {
            afficherErreur("erreur-date", "La date est obligatoire.");
            valide = false;
        } else {
            cacherErreur("erreur-date");
        }

        if (!valide) return;

        const donnees = { code, designation, type, localisation, etat, date_mise_service };
        const idEnCoursDeModification = form.dataset.modificationId;

        try {
            let reponse;
            if (idEnCoursDeModification) {
                reponse = await fetch(`${API_URL}/equipements/${idEnCoursDeModification}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(donnees)
                });
            } else {
                reponse = await fetch(`${API_URL}/equipements`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(donnees)
                });
            }

            const resultat = await reponse.json();

            if (!reponse.ok) {
                afficherErreur("erreur-code", resultat.message || "Erreur lors de l'enregistrement.");
                return;
            }

            reinitialiserFormulaire();
            afficherListeEquipements();
        } catch (erreur) {
            gererErreurReseau(erreur);
        }
    });

    boutonAnnuler.addEventListener("click", reinitialiserFormulaire);

    afficherListeEquipements();

    const rechercheInput = document.getElementById("recherche-equipement");
    const filtreType = document.getElementById("filtre-type");
    const filtreEtat = document.getElementById("filtre-etat");

    if (rechercheInput) rechercheInput.addEventListener("input", afficherListeEquipements);
    if (filtreType) filtreType.addEventListener("input", afficherListeEquipements);
    if (filtreEtat) filtreEtat.addEventListener("change", afficherListeEquipements);
}

async function afficherListeEquipements() {
    const tbody = document.getElementById("corps-tableau-equipements");
    if (!tbody) return;

    const recherche = document.getElementById("recherche-equipement");
    const filtreType = document.getElementById("filtre-type");
    const filtreEtat = document.getElementById("filtre-etat");

    const parametres = new URLSearchParams();
    if (recherche && recherche.value.trim() !== "") parametres.append("recherche", recherche.value.trim());
    if (filtreType && filtreType.value.trim() !== "") parametres.append("type", filtreType.value.trim());
    if (filtreEtat && filtreEtat.value !== "") parametres.append("etat", filtreEtat.value);

    try {
        const reponse = await fetch(`${API_URL}/equipements?${parametres.toString()}`);
        const equipements = await reponse.json();

        tbody.innerHTML = "";

        if (equipements.length === 0) {
            tbody.innerHTML = "<tr><td colspan='7'>Aucun équipement trouvé.</td></tr>";
            return;
        }

        equipements.forEach(eq => {
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td>${echapperHtml(eq.code)}</td>
                <td>${echapperHtml(eq.designation)}</td>
                <td>${echapperHtml(eq.type ?? "")}</td>
                <td>${echapperHtml(eq.localisation ?? "")}</td>
                <td><span class="${classeBadgeEtat(eq.etat)}">${eq.etat}</span></td>
                <td>${eq.date_mise_service ? eq.date_mise_service.substring(0, 10) : ""}</td>
                <td class="actions-table">
                    <button class="secondaire" onclick="modifierEquipement(${eq.id})">Modifier</button>
                    <button class="secondaire" onclick="supprimerEquipement(${eq.id})">Supprimer</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (erreur) {
        gererErreurReseau(erreur);
    }
}

async function modifierEquipement(id) {
    try {
        const reponse = await fetch(`${API_URL}/equipements`);
        const equipements = await reponse.json();
        const equipement = equipements.find(eq => eq.id === id);
        if (!equipement) return;

        document.getElementById("code").value = equipement.code;
        document.getElementById("designation").value = equipement.designation;
        document.getElementById("type").value = equipement.type ?? "";
        document.getElementById("localisation").value = equipement.localisation ?? "";
        document.getElementById("etat").value = equipement.etat;
        document.getElementById("date_equipement").value = equipement.date_mise_service
            ? equipement.date_mise_service.substring(0, 10)
            : "";

        const form = document.getElementById("form-equipement");
        form.dataset.modificationId = id;
        document.querySelector("#form-equipement button[type=submit]").textContent = "Mettre à jour";
        document.getElementById("bouton-annuler-equipement").style.display = "inline-flex";

        window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (erreur) {
        gererErreurReseau(erreur);
    }
}

async function supprimerEquipement(id) {
    if (!confirm("Supprimer cet équipement ?")) return;
    try {
        await fetch(`${API_URL}/equipements/${id}`, { method: "DELETE" });
        afficherListeEquipements();
    } catch (erreur) {
        gererErreurReseau(erreur);
    }
}

async function remplirListeEquipements(idSelect) {
    const select = document.getElementById(idSelect);
    if (!select) return;

    try {
        const reponse = await fetch(`${API_URL}/equipements`);
        const equipements = await reponse.json();

        select.innerHTML = "<option value=''>-- Choisir un équipement --</option>";
        equipements.forEach(eq => {
            const option = document.createElement("option");
            option.value = eq.id;
            option.textContent = `${eq.code} - ${eq.designation}`;
            select.appendChild(option);
        });
    } catch (erreur) {
        gererErreurReseau(erreur);
    }
}

/* =========================================================
   PAGE PANNES (pannes.html)
   ========================================================= */

function initPagePannes() {
    const form = document.getElementById("form-panne");
    if (!form) return;

    const boutonAnnuler = document.getElementById("bouton-annuler-panne");

    remplirListeEquipements("equipement");

    function reinitialiserFormulaire() {
        form.reset();
        delete form.dataset.modificationId;
        document.querySelector("#form-panne button[type=submit]").textContent = "Enregistrer";
        boutonAnnuler.style.display = "none";
    }

    form.addEventListener("submit", async function (e) {
        e.preventDefault();

        const equipement_id = document.getElementById("equipement").value;
        const date_panne = document.getElementById("date_panne").value;
        const description = document.getElementById("description").value.trim();
        const priorite = document.getElementById("priorite").value;

        let valide = true;

        if (equipement_id === "") {
            afficherErreur("erreur-equipement", "Choisissez un équipement.");
            valide = false;
        } else {
            cacherErreur("erreur-equipement");
        }

        if (date_panne === "") {
            afficherErreur("erreur-date-panne", "La date est obligatoire.");
            valide = false;
        } else {
            cacherErreur("erreur-date-panne");
        }

        if (description === "") {
            afficherErreur("erreur-description", "La description est obligatoire.");
            valide = false;
        } else {
            cacherErreur("erreur-description");
        }

        if (!valide) return;

        const donnees = { equipement_id, date_panne, description, priorite };
        const idEnCoursDeModification = form.dataset.modificationId;

        try {
            let reponse;
            if (idEnCoursDeModification) {
                reponse = await fetch(`${API_URL}/pannes/${idEnCoursDeModification}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(donnees)
                });
            } else {
                reponse = await fetch(`${API_URL}/pannes`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(donnees)
                });
            }

            if (!reponse.ok) {
                const resultat = await reponse.json();
                afficherErreur("erreur-equipement", resultat.message || "Erreur lors de l'enregistrement.");
                return;
            }

            reinitialiserFormulaire();
            afficherListePannes();
            remplirListeEquipements("equipement");
        } catch (erreur) {
            gererErreurReseau(erreur);
        }
    });

    boutonAnnuler.addEventListener("click", reinitialiserFormulaire);

    afficherListePannes();
}

async function afficherListePannes() {
    const tbody = document.getElementById("corps-tableau-pannes");
    if (!tbody) return;

    try {
        const reponse = await fetch(`${API_URL}/pannes`);
        const pannes = await reponse.json();

        tbody.innerHTML = "";

        if (pannes.length === 0) {
            tbody.innerHTML = "<tr><td colspan='5'>Aucune panne enregistrée.</td></tr>";
            return;
        }

        pannes.forEach(p => {
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td>${echapperHtml(p.code)} - ${echapperHtml(p.designation)}</td>
                <td>${p.date_panne ? p.date_panne.substring(0, 10) : ""}</td>
                <td>${echapperHtml(p.description)}</td>
                <td><span class="${classeBadgePriorite(p.priorite)}">${p.priorite}</span></td>
                <td class="actions-table">
                    <button class="secondaire" onclick='modifierPanne(${p.id})'>Modifier</button>
                    <button class="secondaire" onclick="supprimerPanne(${p.id})">Supprimer</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (erreur) {
        gererErreurReseau(erreur);
    }
}

async function modifierPanne(id) {
    try {
        const reponse = await fetch(`${API_URL}/pannes`);
        const pannes = await reponse.json();
        const panne = pannes.find(p => p.id === id);
        if (!panne) return;

        await remplirListeEquipements("equipement");
        document.getElementById("equipement").value = panne.equipement_id;
        document.getElementById("date_panne").value = panne.date_panne ? panne.date_panne.substring(0, 10) : "";
        document.getElementById("description").value = panne.description ?? "";
        document.getElementById("priorite").value = panne.priorite;

        const form = document.getElementById("form-panne");
        form.dataset.modificationId = id;
        document.querySelector("#form-panne button[type=submit]").textContent = "Mettre à jour";
        document.getElementById("bouton-annuler-panne").style.display = "inline-flex";

        window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (erreur) {
        gererErreurReseau(erreur);
    }
}

async function supprimerPanne(id) {
    if (!confirm("Supprimer cette panne ?")) return;
    try {
        await fetch(`${API_URL}/pannes/${id}`, { method: "DELETE" });
        afficherListePannes();
    } catch (erreur) {
        gererErreurReseau(erreur);
    }
}

/* =========================================================
   PAGE INTERVENTIONS (interventions.html)
   ========================================================= */

function initPageInterventions() {
    const form = document.getElementById("form-intervention");
    if (!form) return;

    const boutonAnnuler = document.getElementById("bouton-annuler-intervention");
    const selectEquipement = document.getElementById("equipement_intervention");
    const conteneurPannes = document.getElementById("pannes_liees");

    remplirListeEquipements("equipement_intervention");

    /* Quand on choisit un équipement, on affiche ses pannes pour
       pouvoir cocher celles que l'intervention résout. */
    selectEquipement.addEventListener("change", function () {
        chargerPannesDeLEquipement(selectEquipement.value, []);
    });

    async function chargerPannesDeLEquipement(equipementId, panneIdsCochees) {
        if (!equipementId) {
            conteneurPannes.innerHTML = "<div class='vide'>Choisissez d'abord un équipement.</div>";
            return;
        }
        try {
            const reponse = await fetch(`${API_URL}/pannes-par-equipement/${equipementId}`);
            const pannes = await reponse.json();

            if (pannes.length === 0) {
                conteneurPannes.innerHTML = "<div class='vide'>Aucune panne enregistrée pour cet équipement.</div>";
                return;
            }

            conteneurPannes.innerHTML = "";
            pannes.forEach(p => {
                const id = "panne-" + p.id;
                const coche = panneIdsCochees.includes(p.id) ? "checked" : "";
                const label = document.createElement("label");
                label.innerHTML = `
                    <input type="checkbox" name="panne_liee" value="${p.id}" id="${id}" ${coche}>
                    ${p.date_panne ? p.date_panne.substring(0, 10) : ""} — ${echapperHtml(p.description)}
                    <span class="${classeBadgePriorite(p.priorite)}">${p.priorite}</span>
                `;
                conteneurPannes.appendChild(label);
            });
        } catch (erreur) {
            gererErreurReseau(erreur);
        }
    }

    function reinitialiserFormulaire() {
        form.reset();
        delete form.dataset.modificationId;
        document.querySelector("#form-intervention button[type=submit]").textContent = "Enregistrer";
        boutonAnnuler.style.display = "none";
        conteneurPannes.innerHTML = "<div class='vide'>Choisissez d'abord un équipement.</div>";
    }

    form.addEventListener("submit", async function (e) {
        e.preventDefault();

        const equipement_id = selectEquipement.value;
        const date_intervention = document.getElementById("date_intervention").value;
        const technicien = document.getElementById("technicien").value.trim();
        const observations = document.getElementById("observations").value.trim();
        const panne_ids = Array.from(conteneurPannes.querySelectorAll("input[name=panne_liee]:checked"))
            .map(input => Number(input.value));

        let valide = true;

        if (equipement_id === "") {
            afficherErreur("erreur-equipement-int", "Choisissez un équipement.");
            valide = false;
        } else {
            cacherErreur("erreur-equipement-int");
        }

        if (date_intervention === "") {
            afficherErreur("erreur-date-int", "La date est obligatoire.");
            valide = false;
        } else {
            cacherErreur("erreur-date-int");
        }

        if (technicien === "") {
            afficherErreur("erreur-technicien", "Le nom du technicien est obligatoire.");
            valide = false;
        } else {
            cacherErreur("erreur-technicien");
        }

        if (!valide) return;

        const donnees = { equipement_id, date_intervention, technicien, observations, panne_ids };
        const idEnCoursDeModification = form.dataset.modificationId;

        try {
            let reponse;
            if (idEnCoursDeModification) {
                reponse = await fetch(`${API_URL}/interventions/${idEnCoursDeModification}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(donnees)
                });
            } else {
                reponse = await fetch(`${API_URL}/interventions`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(donnees)
                });
            }

            if (!reponse.ok) {
                const resultat = await reponse.json();
                afficherErreur("erreur-equipement-int", resultat.message || "Erreur lors de l'enregistrement.");
                return;
            }

            reinitialiserFormulaire();
            afficherListeInterventions();
            remplirListeEquipements("equipement_intervention");
        } catch (erreur) {
            gererErreurReseau(erreur);
        }
    });

    boutonAnnuler.addEventListener("click", reinitialiserFormulaire);

    /* Exposé pour que modifierIntervention() puisse précocher les pannes */
    initPageInterventions.chargerPannesDeLEquipement = chargerPannesDeLEquipement;

    afficherListeInterventions();
}

async function afficherListeInterventions() {
    const tbody = document.getElementById("corps-tableau-interventions");
    if (!tbody) return;

    try {
        const reponse = await fetch(`${API_URL}/interventions`);
        const interventions = await reponse.json();

        tbody.innerHTML = "";

        if (interventions.length === 0) {
            tbody.innerHTML = "<tr><td colspan='6'>Aucune intervention enregistrée.</td></tr>";
            return;
        }

        interventions.forEach(i => {
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td>${echapperHtml(i.code)} - ${echapperHtml(i.designation)}</td>
                <td>${i.date_intervention ? i.date_intervention.substring(0, 10) : ""}</td>
                <td>${echapperHtml(i.technicien)}</td>
                <td>${i.pannes_resolues ? echapperHtml(i.pannes_resolues) : "—"}</td>
                <td>${echapperHtml(i.observations ?? "")}</td>
                <td class="actions-table">
                    <button class="secondaire" onclick="modifierIntervention(${i.id})">Modifier</button>
                    <button class="secondaire" onclick="supprimerIntervention(${i.id})">Supprimer</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (erreur) {
        gererErreurReseau(erreur);
    }
}

async function modifierIntervention(id) {
    try {
        const reponse = await fetch(`${API_URL}/interventions`);
        const interventions = await reponse.json();
        const intervention = interventions.find(i => i.id === id);
        if (!intervention) return;

        await remplirListeEquipements("equipement_intervention");
        document.getElementById("equipement_intervention").value = intervention.equipement_id;
        document.getElementById("date_intervention").value = intervention.date_intervention
            ? intervention.date_intervention.substring(0, 10)
            : "";
        document.getElementById("technicien").value = intervention.technicien;
        document.getElementById("observations").value = intervention.observations ?? "";

        /* Récupère les pannes déjà liées pour les précocher */
        const reponsePannes = await fetch(`${API_URL}/pannes-par-equipement/${intervention.equipement_id}`);
        const toutesLesPannes = await reponsePannes.json();
        const panneIdsLies = intervention.pannes_resolues
            ? toutesLesPannes.filter(p => intervention.pannes_resolues.includes(p.description)).map(p => p.id)
            : [];

        if (initPageInterventions.chargerPannesDeLEquipement) {
            await initPageInterventions.chargerPannesDeLEquipement(intervention.equipement_id, panneIdsLies);
        }

        const form = document.getElementById("form-intervention");
        form.dataset.modificationId = id;
        document.querySelector("#form-intervention button[type=submit]").textContent = "Mettre à jour";
        document.getElementById("bouton-annuler-intervention").style.display = "inline-flex";

        window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (erreur) {
        gererErreurReseau(erreur);
    }
}

async function supprimerIntervention(id) {
    if (!confirm("Supprimer cette intervention ?")) return;
    try {
        await fetch(`${API_URL}/interventions/${id}`, { method: "DELETE" });
        afficherListeInterventions();
    } catch (erreur) {
        gererErreurReseau(erreur);
    }
}

/* =========================================================
   PAGE TABLEAU DE BORD (dashboard.html)
   ========================================================= */

async function initPageTableauDeBord() {
    const conteneur = document.getElementById("indicateurs");
    if (!conteneur) return;

    try {
        const reponse = await fetch(`${API_URL}/dashboard`);
        const stats = await reponse.json();

        conteneur.innerHTML = `
            <div class="indicateur accent">
                <div class="valeur">${stats.totalEquipements}</div>
                <div class="libelle">Équipements au total</div>
            </div>
            <div class="indicateur ok">
                <div class="valeur">${stats.enService}</div>
                <div class="libelle">En service</div>
            </div>
            <div class="indicateur danger">
                <div class="valeur">${stats.enPanne}</div>
                <div class="libelle">En panne</div>
            </div>
            <div class="indicateur alerte">
                <div class="valeur">${stats.enMaintenance}</div>
                <div class="libelle">En maintenance</div>
            </div>
            <div class="indicateur">
                <div class="valeur">${stats.totalPannes}</div>
                <div class="libelle">Pannes déclarées</div>
            </div>
            <div class="indicateur">
                <div class="valeur">${stats.totalInterventions}</div>
                <div class="libelle">Interventions réalisées</div>
            </div>
        `;
    } catch (erreur) {
        gererErreurReseau(erreur);
    }
}

/* =========================================================
   Initialisation générale : on protège la page (redirection
   vers login.html si non connecté), on remplit la barre
   latérale, puis on détecte la page pour lancer la bonne
   fonction d'initialisation.
   ========================================================= */

document.addEventListener("DOMContentLoaded", function () {
    initEnteteUtilisateur();
    initPageEquipements();
    initPagePannes();
    initPageInterventions();
    initPageTableauDeBord();
});
