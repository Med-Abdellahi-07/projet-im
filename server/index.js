"use strict";

require("dotenv").config({ quiet: true });
const { loadConfig } = require("./config");
const { createPool } = require("./db");
const { createMailer } = require("./services/mailer");
const { createApp } = require("./app");
const { migrate } = require("./migrate");
const { startDemoReset } = require("./services/demo");

async function main() {
    const config = loadConfig();
    // Create or upgrade the tables, then start serving.
    await migrate(config.db);

    const pool = createPool(config.db);
    const mailer = createMailer(config.smtp);
    if (config.demo.enabled) await startDemoReset(pool, config.demo);

    const app = createApp({ pool, config, mailer });
    app.listen(config.port, () => {
        console.log(`Server listening on port ${config.port} (${config.nodeEnv}).`);
        if (!mailer.enabled) {
            console.log(
                config.isDevelopment
                    ? "No SMTP configured: verification codes are printed in this console (development only)."
                    : "No SMTP configured: sign-up is disabled.",
            );
        }
    });
}

main().catch((error) => {
    console.error("Startup failed:", error.message);
    process.exit(1);
});
