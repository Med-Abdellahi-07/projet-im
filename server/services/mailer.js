"use strict";

const nodemailer = require("nodemailer");

/**
 * Mailer used for verification codes.
 *   sendVerificationCode(email, code) -> Promise<void>
 * With no SMTP configured, `enabled` is false and nothing is sent.
 */
function createMailer(smtp) {
    if (!smtp.enabled) {
        return { enabled: false, async sendVerificationCode() {} };
    }
    const transporter = nodemailer.createTransport({
        host: smtp.host,
        port: smtp.port,
        secure: smtp.port === 465,
        auth: { user: smtp.user, pass: smtp.password },
    });
    return {
        enabled: true,
        async sendVerificationCode(email, code) {
            await transporter.sendMail({
                from: smtp.from,
                to: email,
                subject: "Code de vérification - Industriel et Minier",
                text: `Votre code de vérification est : ${code} (valable 15 minutes).`,
                html: `<p>Votre code de vérification est : <strong>${code}</strong></p><p>Il est valable 15 minutes.</p>`,
            });
        },
    };
}

module.exports = { createMailer };
