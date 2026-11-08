"use strict";

const { setup, clearDatabase, loggedInAgent } = require("./helpers");

let ctx;
let api;
beforeAll(async () => {
    ctx = await setup();
});
afterAll(async () => {
    await ctx.pool.end();
});
beforeEach(async () => {
    await clearDatabase(ctx.pool);
    api = await loggedInAgent(ctx);
});

const equipement = (over = {}) => ({
    code: "EQ001",
    designation: "Pompe",
    type: "Pompe",
    localisation: "Zone A",
    etat: "En service",
    date_mise_service: "2024-01-15",
    ...over,
});

async function createEquipement(over) {
    const res = await api.post("/api/equipements").send(equipement(over));
    expect(res.status).toBe(201);
    return res.body.id;
}
async function createPanne(equipement_id, over = {}) {
    const res = await api.post("/api/pannes").send({
        equipement_id,
        date_panne: "2026-10-01",
        description: "Fuite",
        priorite: "Haute",
        ...over,
    });
    expect(res.status).toBe(201);
    return res.body.id;
}
async function createIntervention(equipement_id, panne_ids, over = {}) {
    const res = await api.post("/api/interventions").send({
        equipement_id,
        date_intervention: "2026-10-05",
        technicien: "Technicien A",
        observations: "OK",
        panne_ids,
        ...over,
    });
    expect(res.status).toBe(201);
    return res.body.id;
}
const etat = async (id) => (await api.get(`/api/equipements/${id}`)).body.etat;
const panne = async (id) => (await api.get(`/api/pannes/${id}`)).body;

describe("input validation", () => {
    test("ids must be positive integers", async () => {
        for (const bad of ["abc", "0", "-1", "1.5", "1;DROP", "99999999999"]) {
            expect((await api.get(`/api/equipements/${bad}`)).status).toBe(400);
        }
    });

    test("equipment fields are checked", async () => {
        const cases = [
            { code: "" },
            { code: "x".repeat(21) },
            { designation: "" },
            { etat: "Cassé" },
            { date_mise_service: "2026-02-30" },
            { date_mise_service: "15/01/2024" },
            { date_mise_service: "" },
            { type: "t".repeat(51) },
            { code: 123 },
        ];
        for (const over of cases) {
            const res = await api.post("/api/equipements").send(equipement(over));
            expect(res.status).toBe(400);
            expect(res.body.message).toBeTruthy();
        }
        expect((await api.post("/api/equipements").send("not an object")).status).toBe(400);
        expect((await api.post("/api/equipements").send([1, 2])).status).toBe(400);
    });

    test("a duplicate code answers 409", async () => {
        await createEquipement();
        const res = await api.post("/api/equipements").send(equipement());
        expect(res.status).toBe(409);
    });

    test("breakdown and intervention fields are checked", async () => {
        const id = await createEquipement();
        const badPannes = [
            { priorite: "Urgente" },
            { description: "" },
            { date_panne: "2026-13-01" },
            { equipement_id: "abc" },
            { statut: "Perdue" },
        ];
        for (const over of badPannes) {
            const res = await api.post("/api/pannes").send({
                equipement_id: id,
                date_panne: "2026-10-01",
                description: "x",
                priorite: "Haute",
                ...over,
            });
            expect(res.status).toBe(400);
        }
        const badInterventions = [
            { technicien: "" },
            { date_intervention: "demain" },
            { panne_ids: "1,2" },
            { panne_ids: ["a"] },
        ];
        for (const over of badInterventions) {
            const res = await api.post("/api/interventions").send({
                equipement_id: id,
                date_intervention: "2026-10-05",
                technicien: "T",
                ...over,
            });
            expect(res.status).toBe(400);
        }
        const unknownEquipment = await api.post("/api/pannes").send({
            equipement_id: 999999,
            date_panne: "2026-10-01",
            description: "x",
        });
        expect(unknownEquipment.status).toBe(400);
    });

    test("filters are validated and search wildcards are literal", async () => {
        await createEquipement({ code: "EQ%1", designation: "Pourcent" });
        await createEquipement({ code: "EQ002", designation: "Autre" });
        expect((await api.get("/api/equipements?etat=Cassé")).status).toBe(400);
        const literal = await api.get("/api/equipements?recherche=%25");
        expect(literal.body.map((e) => e.code)).toEqual(["EQ%1"]);
        const all = await api.get("/api/equipements?recherche=EQ");
        expect(all.body).toHaveLength(2);
    });

    test("SQL injection attempts are treated as plain text", async () => {
        await createEquipement();
        const res = await api.get("/api/equipements").query({ recherche: "' OR '1'='1" });
        expect(res.status).toBe(200);
        expect(res.body).toHaveLength(0);
        expect((await api.get("/api/equipements")).body).toHaveLength(1);
    });
});

describe("missing rows answer 404", () => {
    test.each(["equipements", "pannes", "interventions"])(
        "GET/PUT/DELETE on a missing %s",
        async (resource) => {
            const equipementId = await createEquipement();
            const payloads = {
                equipements: equipement({ code: "ZZ" }),
                pannes: {
                    equipement_id: equipementId,
                    date_panne: "2026-10-01",
                    description: "x",
                    priorite: "Basse",
                },
                interventions: {
                    equipement_id: equipementId,
                    date_intervention: "2026-10-05",
                    technicien: "T",
                },
            };
            expect((await api.get(`/api/${resource}/999999`)).status).toBe(404);
            expect((await api.put(`/api/${resource}/999999`).send(payloads[resource])).status).toBe(404);
            expect((await api.delete(`/api/${resource}/999999`)).status).toBe(404);
        },
    );

    test("equipment pannes of a missing equipment", async () => {
        expect((await api.get("/api/equipements/999999/pannes")).status).toBe(404);
    });
});

describe("GET by id", () => {
    test("returns one row for each resource", async () => {
        const e = await createEquipement();
        const p = await createPanne(e);
        const i = await createIntervention(e, [p]);
        expect((await api.get(`/api/equipements/${e}`)).body.code).toBe("EQ001");
        expect((await api.get(`/api/pannes/${p}`)).body.description).toBe("Fuite");
        const intervention = (await api.get(`/api/interventions/${i}`)).body;
        expect(intervention.technicien).toBe("Technicien A");
        expect(intervention.panne_ids).toEqual([p]);
    });

    test("dates are plain YYYY-MM-DD strings", async () => {
        const e = await createEquipement({ date_mise_service: "2024-01-01" });
        expect((await api.get(`/api/equipements/${e}`)).body.date_mise_service).toBe("2024-01-01");
    });
});

describe("breakdown and equipment state logic", () => {
    test("declaring a breakdown puts the equipment 'En panne' and it starts 'Ouverte'", async () => {
        const e = await createEquipement();
        const p = await createPanne(e);
        expect(await etat(e)).toBe("En panne");
        const row = await panne(p);
        expect(row.statut).toBe("Ouverte");
        expect(row.date_resolution).toBeNull();
    });

    test("an intervention resolves only the selected breakdowns; the equipment is back in service only when none is left open", async () => {
        const e = await createEquipement();
        const a = await createPanne(e, { description: "A" });
        const b = await createPanne(e, { description: "B" });

        await createIntervention(e, [a], { date_intervention: "2026-10-05" });
        expect((await panne(a)).statut).toBe("Résolue");
        expect((await panne(a)).date_resolution).toBe("2026-10-05");
        expect((await panne(b)).statut).toBe("Ouverte");
        expect(await etat(e)).toBe("En panne");

        await createIntervention(e, [b], { date_intervention: "2026-10-07" });
        expect((await panne(b)).statut).toBe("Résolue");
        expect(await etat(e)).toBe("En service");
    });

    test("an intervention cannot resolve a breakdown of another equipment", async () => {
        const e1 = await createEquipement({ code: "E1" });
        const e2 = await createEquipement({ code: "E2" });
        const p2 = await createPanne(e2);
        const res = await api.post("/api/interventions").send({
            equipement_id: e1,
            date_intervention: "2026-10-05",
            technicien: "T",
            panne_ids: [p2],
        });
        expect(res.status).toBe(400);
        expect((await panne(p2)).statut).toBe("Ouverte");
    });

    test("deleting an intervention reopens the breakdowns it alone resolved", async () => {
        const e = await createEquipement();
        const p = await createPanne(e);
        const i = await createIntervention(e, [p]);
        expect(await etat(e)).toBe("En service");

        expect((await api.delete(`/api/interventions/${i}`)).status).toBe(200);
        expect((await panne(p)).statut).toBe("Ouverte");
        expect((await panne(p)).date_resolution).toBeNull();
        expect(await etat(e)).toBe("En panne");
    });

    test("a breakdown resolved by two interventions stays resolved when one is deleted", async () => {
        const e = await createEquipement();
        const p = await createPanne(e);
        const i1 = await createIntervention(e, [p], {
            date_intervention: "2026-10-05",
        });
        await createIntervention(e, [p], { date_intervention: "2026-10-08" });
        await api.delete(`/api/interventions/${i1}`);
        expect((await panne(p)).statut).toBe("Résolue");
        expect(await etat(e)).toBe("En service");
    });

    test("editing an intervention to unselect a breakdown reopens it", async () => {
        const e = await createEquipement();
        const a = await createPanne(e, { description: "A" });
        const b = await createPanne(e, { description: "B" });
        const i = await createIntervention(e, [a, b]);
        expect(await etat(e)).toBe("En service");

        const res = await api.put(`/api/interventions/${i}`).send({
            equipement_id: e,
            date_intervention: "2026-10-05",
            technicien: "T",
            panne_ids: [a],
        });
        expect(res.status).toBe(200);
        expect((await panne(b)).statut).toBe("Ouverte");
        expect(await etat(e)).toBe("En panne");
    });

    test("editing an intervention without panne_ids keeps its links", async () => {
        const e = await createEquipement();
        const p = await createPanne(e);
        const i = await createIntervention(e, [p]);
        await api.put(`/api/interventions/${i}`).send({
            equipement_id: e,
            date_intervention: "2026-10-09",
            technicien: "Nouveau",
            observations: "",
        });
        const row = (await api.get(`/api/interventions/${i}`)).body;
        expect(row.panne_ids).toEqual([p]);
        expect((await panne(p)).date_resolution).toBe("2026-10-09");
    });

    test("moving an intervention to another equipment requires choosing the breakdowns again", async () => {
        const e1 = await createEquipement({ code: "E1" });
        const e2 = await createEquipement({ code: "E2" });
        const p = await createPanne(e1);
        const i = await createIntervention(e1, [p]);
        const res = await api.put(`/api/interventions/${i}`).send({
            equipement_id: e2,
            date_intervention: "2026-10-05",
            technicien: "T",
        });
        expect(res.status).toBe(400);
    });

    test("deleting an open breakdown puts the equipment back in service", async () => {
        const e = await createEquipement();
        const p = await createPanne(e);
        expect(await etat(e)).toBe("En panne");
        await api.delete(`/api/pannes/${p}`);
        expect(await etat(e)).toBe("En service");
    });

    test("deleting one of two open breakdowns keeps the equipment 'En panne'", async () => {
        const e = await createEquipement();
        const a = await createPanne(e);
        await createPanne(e);
        await api.delete(`/api/pannes/${a}`);
        expect(await etat(e)).toBe("En panne");
    });

    test("moving a breakdown recalculates both equipments", async () => {
        const e1 = await createEquipement({ code: "E1" });
        const e2 = await createEquipement({ code: "E2" });
        const p = await createPanne(e1);
        const res = await api.put(`/api/pannes/${p}`).send({
            equipement_id: e2,
            date_panne: "2026-10-01",
            description: "Fuite",
            priorite: "Haute",
        });
        expect(res.status).toBe(200);
        expect(await etat(e1)).toBe("En service");
        expect(await etat(e2)).toBe("En panne");
    });

    test("closing and reopening a breakdown by hand updates statut, date and equipment", async () => {
        const e = await createEquipement();
        const p = await createPanne(e);
        const payload = {
            equipement_id: e,
            date_panne: "2026-10-01",
            description: "Fuite",
            priorite: "Haute",
        };

        await api.put(`/api/pannes/${p}`).send({ ...payload, statut: "Résolue" });
        expect((await panne(p)).statut).toBe("Résolue");
        expect((await panne(p)).date_resolution).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(await etat(e)).toBe("En service");

        await api.put(`/api/pannes/${p}`).send({ ...payload, statut: "Ouverte" });
        expect((await panne(p)).date_resolution).toBeNull();
        expect(await etat(e)).toBe("En panne");
    });

    test("'En maintenance' is a manual state and survives breakdown changes", async () => {
        const e = await createEquipement({ etat: "En maintenance" });
        const p = await createPanne(e);
        expect(await etat(e)).toBe("En maintenance");
        await createIntervention(e, [p]);
        expect(await etat(e)).toBe("En maintenance");
    });

    test("manually setting 'En service' cannot hide an open breakdown", async () => {
        const e = await createEquipement();
        await createPanne(e);
        await api.put(`/api/equipements/${e}`).send(equipement({ etat: "En service" }));
        expect(await etat(e)).toBe("En panne");
    });

    test("the equipment pannes endpoint lists statut and resolution date", async () => {
        const e = await createEquipement();
        const p = await createPanne(e);
        await createIntervention(e, [p]);
        const rows = (await api.get(`/api/equipements/${e}/pannes`)).body;
        expect(rows).toHaveLength(1);
        expect(rows[0].statut).toBe("Résolue");
    });
});

describe("dashboard", () => {
    test("counts equipment, open breakdowns by priority and this month's interventions", async () => {
        const e1 = await createEquipement({ code: "E1" });
        const e2 = await createEquipement({ code: "E2" });
        await createEquipement({ code: "E3", etat: "En maintenance" });
        const high = await createPanne(e1, { priorite: "Haute" });
        await createPanne(e1, { priorite: "Basse" });
        await createPanne(e2, { priorite: "Haute" });

        const today = new Date().toISOString().slice(0, 10);
        await createIntervention(e1, [high], { date_intervention: today });
        await createIntervention(e2, [], { date_intervention: "2024-01-10" });

        const stats = (await api.get("/api/dashboard")).body;
        expect(stats.totalEquipements).toBe(3);
        expect(stats.enService).toBe(0);
        expect(stats.enPanne).toBe(2);
        expect(stats.enMaintenance).toBe(1);
        expect(stats.totalPannes).toBe(3);
        expect(stats.pannesOuvertes).toBe(2);
        expect(stats.pannesOuvertesParPriorite).toEqual({
            Haute: 1,
            Moyenne: 0,
            Basse: 1,
        });
        expect(stats.totalInterventions).toBe(2);
        expect(stats.interventionsCeMois).toBe(1);
    });
});

describe("demo mode", () => {
    test("reset replaces all data with a consistent, fictional data set and a verified demo account", async () => {
        const { resetDemoData } = require("../server/services/demo");
        await createEquipement({ code: "REAL" });
        await resetDemoData(ctx.pool, ctx.config.demo);

        const demoAgent = require("supertest").agent(ctx.app);
        const login = await demoAgent.post("/api/auth/connexion").send({
            email: ctx.config.demo.email,
            mot_de_passe: ctx.config.demo.password,
        });
        expect(login.status).toBe(200);

        const equipements = (await demoAgent.get("/api/equipements")).body;
        expect(equipements.find((x) => x.code === "REAL")).toBeUndefined();
        expect(equipements.length).toBeGreaterThanOrEqual(5);

        // Every equipment is 'En panne' exactly when it has an open breakdown.
        const open = (await demoAgent.get("/api/pannes?statut=Ouverte")).body;
        const withOpen = new Set(open.map((p) => p.equipement_id));
        for (const eq of equipements) {
            if (eq.etat !== "En maintenance") expect(eq.etat === "En panne").toBe(withOpen.has(eq.id));
        }
    });

    test("running the reset twice gives the same result (idempotent)", async () => {
        const { resetDemoData } = require("../server/services/demo");
        await resetDemoData(ctx.pool, ctx.config.demo);
        await resetDemoData(ctx.pool, ctx.config.demo);
        const [[{ n }]] = await ctx.pool.query("SELECT COUNT(*) AS n FROM equipements");
        expect(n).toBe(6);
        const [[{ u }]] = await ctx.pool.query("SELECT COUNT(*) AS u FROM utilisateurs");
        expect(u).toBe(1);
    });
});

describe("migration", () => {
    test("running the migration again is harmless", async () => {
        const { migrate } = require("../server/migrate");
        await migrate(ctx.config.db);
        await migrate(ctx.config.db);
    });

    test("a database from the first version of the project is upgraded", async () => {
        const mysql = require("mysql2/promise");
        const { migrate } = require("../server/migrate");
        const admin = await mysql.createConnection({
            host: ctx.config.db.host,
            port: ctx.config.db.port,
            user: ctx.config.db.user,
            password: ctx.config.db.password,
            multipleStatements: true,
            dateStrings: true,
        });
        try {
            await admin.query("DROP DATABASE IF EXISTS industriel_minier_legacy");
            await admin.query("CREATE DATABASE industriel_minier_legacy");
            await admin.query(`
            USE industriel_minier_legacy;
            CREATE TABLE utilisateurs (id INT AUTO_INCREMENT PRIMARY KEY, email VARCHAR(150) NOT NULL UNIQUE,
              mot_de_passe_hash VARCHAR(255) NOT NULL, code_verification VARCHAR(6), code_expiration DATETIME,
              verifie TINYINT(1) NOT NULL DEFAULT 0, date_creation TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
            CREATE TABLE equipements (id INT AUTO_INCREMENT PRIMARY KEY, code VARCHAR(20) NOT NULL UNIQUE,
              designation VARCHAR(100) NOT NULL, type VARCHAR(50), localisation VARCHAR(100),
              etat ENUM('En service','En panne','En maintenance') DEFAULT 'En service', date_mise_service DATE);
            CREATE TABLE pannes (id INT AUTO_INCREMENT PRIMARY KEY, equipement_id INT NOT NULL, date_panne DATE NOT NULL,
              description TEXT, priorite ENUM('Basse','Moyenne','Haute') DEFAULT 'Moyenne',
              FOREIGN KEY (equipement_id) REFERENCES equipements(id) ON DELETE CASCADE);
            CREATE TABLE interventions (id INT AUTO_INCREMENT PRIMARY KEY, equipement_id INT NOT NULL,
              date_intervention DATE NOT NULL, technicien VARCHAR(100) NOT NULL, observations TEXT,
              FOREIGN KEY (equipement_id) REFERENCES equipements(id) ON DELETE CASCADE);
            CREATE TABLE intervention_panne (intervention_id INT NOT NULL, panne_id INT NOT NULL,
              PRIMARY KEY (intervention_id, panne_id),
              FOREIGN KEY (intervention_id) REFERENCES interventions(id) ON DELETE CASCADE,
              FOREIGN KEY (panne_id) REFERENCES pannes(id) ON DELETE CASCADE);
            INSERT INTO equipements (code, designation) VALUES ('E1', 'Old');
            INSERT INTO pannes (equipement_id, date_panne, description) VALUES (1, '2026-09-01', 'handled'), (1, '2026-09-02', 'open');
            INSERT INTO interventions (equipement_id, date_intervention, technicien) VALUES (1, '2026-09-03', 'T');
            INSERT INTO intervention_panne VALUES (1, 1);
            INSERT INTO utilisateurs (email, mot_de_passe_hash, code_verification) VALUES ('old@example.com', 'h', '123456');
        `);
            await migrate({ ...ctx.config.db, database: "industriel_minier_legacy" });
            const [rows] = await admin.query(
                "SELECT description, statut, date_resolution FROM industriel_minier_legacy.pannes ORDER BY id",
            );
            expect(rows[0].statut).toBe("Résolue");
            expect(rows[0].date_resolution).toBe("2026-09-03");
            expect(rows[1].statut).toBe("Ouverte");
            const [[user]] = await admin.query(
                "SELECT code_verification, tentatives_code FROM industriel_minier_legacy.utilisateurs",
            );
            expect(user.code_verification).toBeNull();
            expect(user.tentatives_code).toBe(0);
        } finally {
            await admin.query("DROP DATABASE IF EXISTS industriel_minier_legacy");
            await admin.end();
        }
    });
});
