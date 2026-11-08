"use strict";

const { request, setup, clearDatabase, loggedInAgent, fakeMailer, testEnv } = require("./helpers");

let ctx;
beforeAll(async () => {
    ctx = await setup();
});
afterAll(async () => {
    await ctx.pool.end();
});
beforeEach(async () => {
    await clearDatabase(ctx.pool);
    ctx.mailer.sent.length = 0;
});

const EMAIL = "new.user@example.com";
const PASSWORD = "Password-123";

describe("every /api route except /api/auth requires a session", () => {
    const protectedRoutes = [
        ["get", "/api/equipements"],
        ["get", "/api/equipements/1"],
        ["post", "/api/equipements"],
        ["put", "/api/equipements/1"],
        ["delete", "/api/equipements/1"],
        ["get", "/api/pannes"],
        ["post", "/api/pannes"],
        ["put", "/api/pannes/1"],
        ["delete", "/api/pannes/1"],
        ["get", "/api/interventions"],
        ["post", "/api/interventions"],
        ["put", "/api/interventions/1"],
        ["delete", "/api/interventions/1"],
        ["get", "/api/dashboard"],
        ["get", "/api/auth/moi"],
        ["get", "/api/unknown-route"],
    ];
    test.each(protectedRoutes)("%s %s answers 401 without a cookie", async (method, url) => {
        const res = await request(ctx.app)[method](url).send({});
        expect(res.status).toBe(401);
    });

    test("a forged or tampered cookie is rejected", async () => {
        const res = await request(ctx.app).get("/api/equipements").set("Cookie", "im_session=not.a.jwt");
        expect(res.status).toBe(401);
    });

    test("static pages stay public", async () => {
        const res = await request(ctx.app).get("/login.html");
        expect(res.status).toBe(200);
        expect(res.text).toContain("Connexion");
    });
});

describe("sign-up, verification and login", () => {
    test("full flow: sign up, verify with the e-mailed code, log in, use the API", async () => {
        const signup = await request(ctx.app)
            .post("/api/auth/inscription")
            .send({ email: EMAIL, mot_de_passe: PASSWORD });
        expect(signup.status).toBe(201);
        expect(signup.body.codeDeTest).toBeUndefined();

        const code = ctx.mailer.lastCode(EMAIL);
        expect(code).toMatch(/^[0-9]{6}$/);

        const beforeVerify = await request(ctx.app)
            .post("/api/auth/connexion")
            .send({ email: EMAIL, mot_de_passe: PASSWORD });
        expect(beforeVerify.status).toBe(403);
        expect(beforeVerify.body.nonVerifie).toBe(true);
        expect(beforeVerify.headers["set-cookie"]).toBeUndefined();

        const verify = await request(ctx.app).post("/api/auth/verification").send({ email: EMAIL, code });
        expect(verify.status).toBe(200);

        const agent = request.agent(ctx.app);
        const login = await agent.post("/api/auth/connexion").send({ email: EMAIL, mot_de_passe: PASSWORD });
        expect(login.status).toBe(200);
        const cookie = login.headers["set-cookie"][0];
        expect(cookie).toMatch(/im_session=/);
        expect(cookie).toMatch(/HttpOnly/i);
        expect(cookie).toMatch(/SameSite=Strict/i);

        expect((await agent.get("/api/equipements")).status).toBe(200);
        expect((await agent.get("/api/auth/moi")).body.utilisateur.email).toBe(EMAIL);

        await agent.post("/api/auth/deconnexion");
        expect((await agent.get("/api/equipements")).status).toBe(401);
    });

    test("the verification code is stored hashed, never in clear", async () => {
        await request(ctx.app).post("/api/auth/inscription").send({ email: EMAIL, mot_de_passe: PASSWORD });
        const code = ctx.mailer.lastCode(EMAIL);
        const [[row]] = await ctx.pool.query("SELECT code_verification FROM utilisateurs WHERE email = ?", [
            EMAIL,
        ]);
        expect(row.code_verification).not.toBe(code);
        expect(row.code_verification).toMatch(/^[0-9a-f]{64}$/);
    });

    test("passwords are stored as bcrypt hashes", async () => {
        await request(ctx.app).post("/api/auth/inscription").send({ email: EMAIL, mot_de_passe: PASSWORD });
        const [[row]] = await ctx.pool.query("SELECT mot_de_passe_hash FROM utilisateurs WHERE email = ?", [
            EMAIL,
        ]);
        expect(row.mot_de_passe_hash).toMatch(/^\$2[aby]\$/);
    });

    test("invalid e-mail or short password is rejected", async () => {
        expect(
            (
                await request(ctx.app)
                    .post("/api/auth/inscription")
                    .send({ email: "nope", mot_de_passe: PASSWORD })
            ).status,
        ).toBe(400);
        expect(
            (
                await request(ctx.app)
                    .post("/api/auth/inscription")
                    .send({ email: EMAIL, mot_de_passe: "short" })
            ).status,
        ).toBe(400);
        expect(
            (
                await request(ctx.app)
                    .post("/api/auth/inscription")
                    .send({ email: { $ne: 1 }, mot_de_passe: PASSWORD })
            ).status,
        ).toBe(400);
    });
});

describe("no account enumeration", () => {
    test("sign-up answers the same for a new and an already registered address", async () => {
        const first = await request(ctx.app)
            .post("/api/auth/inscription")
            .send({ email: EMAIL, mot_de_passe: PASSWORD });
        const code = ctx.mailer.lastCode(EMAIL);
        await request(ctx.app).post("/api/auth/verification").send({ email: EMAIL, code });
        const second = await request(ctx.app)
            .post("/api/auth/inscription")
            .send({ email: EMAIL, mot_de_passe: "Another-Pass-1" });
        expect(second.status).toBe(first.status);
        expect(second.body).toEqual(first.body);
    });

    test("login: unknown account and wrong password give the same answer", async () => {
        await loggedInAgent(ctx, "known@example.com", PASSWORD);
        const wrong = await request(ctx.app)
            .post("/api/auth/connexion")
            .send({ email: "known@example.com", mot_de_passe: "bad-password" });
        const unknown = await request(ctx.app)
            .post("/api/auth/connexion")
            .send({ email: "ghost@example.com", mot_de_passe: "bad-password" });
        expect(wrong.status).toBe(401);
        expect(unknown.status).toBe(401);
        expect(unknown.body).toEqual(wrong.body);
    });

    test("verification: unknown account and wrong code give the same answer", async () => {
        await request(ctx.app).post("/api/auth/inscription").send({ email: EMAIL, mot_de_passe: PASSWORD });
        const wrongCode = await request(ctx.app)
            .post("/api/auth/verification")
            .send({ email: EMAIL, code: "000000" });
        const unknown = await request(ctx.app)
            .post("/api/auth/verification")
            .send({ email: "ghost@example.com", code: "000000" });
        expect(unknown.status).toBe(wrongCode.status);
        expect(unknown.body).toEqual(wrongCode.body);
    });

    test("resend answers the same for known and unknown addresses", async () => {
        await request(ctx.app).post("/api/auth/inscription").send({ email: EMAIL, mot_de_passe: PASSWORD });
        const known = await request(ctx.app).post("/api/auth/renvoyer-code").send({ email: EMAIL });
        const unknown = await request(ctx.app)
            .post("/api/auth/renvoyer-code")
            .send({ email: "ghost@example.com" });
        expect(unknown.status).toBe(known.status);
        expect(unknown.body).toEqual(known.body);
    });
});

describe("verification code limits", () => {
    test("after 5 wrong attempts the code is cancelled, even the right one fails", async () => {
        await request(ctx.app).post("/api/auth/inscription").send({ email: EMAIL, mot_de_passe: PASSWORD });
        const code = ctx.mailer.lastCode(EMAIL);
        const wrong = code === "123456" ? "654321" : "123456";
        for (let i = 0; i < 5; i += 1) {
            const res = await request(ctx.app)
                .post("/api/auth/verification")
                .send({ email: EMAIL, code: wrong });
            expect(res.status).toBe(400);
        }
        const tooLate = await request(ctx.app).post("/api/auth/verification").send({ email: EMAIL, code });
        expect(tooLate.status).toBe(400);

        // A new code is required: make the resend cooldown pass, then it works.
        await ctx.pool.query(
            "UPDATE utilisateurs SET code_expiration = DATE_SUB(NOW(), INTERVAL 1 MINUTE) WHERE email = ?",
            [EMAIL],
        );
        await request(ctx.app).post("/api/auth/renvoyer-code").send({ email: EMAIL });
        const fresh = ctx.mailer.lastCode(EMAIL);
        const ok = await request(ctx.app).post("/api/auth/verification").send({ email: EMAIL, code: fresh });
        expect(ok.status).toBe(200);
    });

    test("an expired code is refused", async () => {
        await request(ctx.app).post("/api/auth/inscription").send({ email: EMAIL, mot_de_passe: PASSWORD });
        const code = ctx.mailer.lastCode(EMAIL);
        await ctx.pool.query(
            "UPDATE utilisateurs SET code_expiration = DATE_SUB(NOW(), INTERVAL 1 MINUTE) WHERE email = ?",
            [EMAIL],
        );
        const res = await request(ctx.app).post("/api/auth/verification").send({ email: EMAIL, code });
        expect(res.status).toBe(400);
    });

    test("resend is throttled to one code per minute per account", async () => {
        await request(ctx.app).post("/api/auth/inscription").send({ email: EMAIL, mot_de_passe: PASSWORD });
        const count = ctx.mailer.sent.length;
        await request(ctx.app).post("/api/auth/renvoyer-code").send({ email: EMAIL });
        expect(ctx.mailer.sent.length).toBe(count);
    });
});

describe("test codes are never exposed outside development", () => {
    test("development without SMTP returns codeDeTest", async () => {
        jest.spyOn(console, "log").mockImplementation(() => {});
        const dev = await setup({
            env: { NODE_ENV: "development" },
            mailer: { enabled: false, async sendVerificationCode() {} },
        });
        const res = await request(dev.app)
            .post("/api/auth/inscription")
            .send({ email: EMAIL, mot_de_passe: PASSWORD });
        expect(res.status).toBe(201);
        expect(res.body.codeDeTest).toMatch(/^[0-9]{6}$/);
        await dev.pool.end();
    });

    test("production without SMTP disables sign-up and never returns a code", async () => {
        const prod = await setup({
            env: { NODE_ENV: "production", JWT_SECRET: "x".repeat(40) },
            mailer: { enabled: false, async sendVerificationCode() {} },
        });
        const res = await request(prod.app)
            .post("/api/auth/inscription")
            .send({ email: EMAIL, mot_de_passe: PASSWORD });
        expect(res.status).toBe(503);
        expect(JSON.stringify(res.body)).not.toMatch(/[0-9]{6}/);
        await prod.pool.end();
    });

    test("production refuses to start without a strong JWT secret", () => {
        const { loadConfig } = require("../server/config");
        expect(() => loadConfig(testEnv({ NODE_ENV: "production", JWT_SECRET: "short" }))).toThrow(
            /JWT_SECRET/,
        );
    });

    test("production cookies are Secure", async () => {
        const prod = await setup({
            env: { NODE_ENV: "production", JWT_SECRET: "x".repeat(40) },
        });
        await clearDatabase(prod.pool);
        const bcrypt = require("bcryptjs");
        await prod.pool.query(
            "INSERT INTO utilisateurs (email, mot_de_passe_hash, verifie) VALUES (?, ?, 1)",
            ["p@example.com", await bcrypt.hash("Password-123", 4)],
        );
        const res = await request(prod.app)
            .post("/api/auth/connexion")
            .set("X-Forwarded-Proto", "https")
            .send({ email: "p@example.com", mot_de_passe: "Password-123" });
        expect(res.status).toBe(200);
        expect(res.headers["set-cookie"][0]).toMatch(/Secure/i);
        await prod.pool.end();
    });
});

describe("rate limiting", () => {
    test.each([
        ["login", "/api/auth/connexion", { email: "a@example.com", mot_de_passe: "x" }],
        ["signup", "/api/auth/inscription", { email: "a@example.com", mot_de_passe: "Password-123" }],
        ["verify", "/api/auth/verification", { email: "a@example.com", code: "000000" }],
        ["resend", "/api/auth/renvoyer-code", { email: "a@example.com" }],
    ])("%s answers 429 once the limit is reached", async (name, url, payload) => {
        const limited = await setup({
            mailer: fakeMailer(),
            rateLimits: {
                login: { windowMs: 60000, limit: 1000 },
                signup: { windowMs: 60000, limit: 1000 },
                verify: { windowMs: 60000, limit: 1000 },
                resend: { windowMs: 60000, limit: 1000 },
                [name]: { windowMs: 60000, limit: 3 },
            },
        });
        const statuses = [];
        for (let i = 0; i < 5; i += 1) {
            statuses.push((await request(limited.app).post(url).send(payload)).status);
        }
        expect(statuses.slice(0, 3)).not.toContain(429);
        expect(statuses.slice(3)).toEqual([429, 429]);
        await limited.pool.end();
    });
});

describe("security headers, CORS and CSRF", () => {
    test("helmet and a strict CSP are applied", async () => {
        const res = await request(ctx.app).get("/login.html");
        expect(res.headers["x-content-type-options"]).toBe("nosniff");
        expect(res.headers["content-security-policy"]).toMatch(/script-src 'self'/);
        expect(res.headers["x-powered-by"]).toBeUndefined();
    });

    test("a foreign origin gets no CORS headers", async () => {
        const res = await request(ctx.app).get("/login.html").set("Origin", "https://evil.example");
        expect(res.headers["access-control-allow-origin"]).toBeUndefined();
    });

    test("an allowed origin gets CORS headers, others do not", async () => {
        const cors = await setup({
            env: { ALLOWED_ORIGIN: "https://app.example" },
        });
        const ok = await request(cors.app).get("/login.html").set("Origin", "https://app.example");
        const bad = await request(cors.app).get("/login.html").set("Origin", "https://evil.example");
        expect(ok.headers["access-control-allow-origin"]).toBe("https://app.example");
        expect(bad.headers["access-control-allow-origin"]).toBeUndefined();
        await cors.pool.end();
    });

    test("a state-changing request from another origin is refused even with a valid session", async () => {
        const agent = await loggedInAgent(ctx);
        const res = await agent.post("/api/equipements").set("Origin", "https://evil.example").send({
            code: "X1",
            designation: "X",
            date_mise_service: "2024-01-01",
        });
        expect(res.status).toBe(403);
    });
});
