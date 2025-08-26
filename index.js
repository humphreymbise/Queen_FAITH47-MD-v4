
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require("@whiskeysockets/baileys");
const pino = require("pino");
const { Boom } = require("@hapi/boom");
const config = require("./config");
const fs = require("fs");

// Start Bot
async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState("./session");

    const sock = makeWASocket({
        logger: pino({ level: "silent" }),
        printQRInTerminal: true,
        auth: state,
        browser: ["FAITH47-MD", "Chrome", "4.0"]
    });

    sock.ev.on("creds.update", saveCreds);

    // Connection update
    sock.ev.on("connection.update", (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === "close") {
            let reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
            if (reason === DisconnectReason.loggedOut) {
                console.log("❌ Logged out. Delete /session and scan again.");
                process.exit(1);
            } else {
                console.log("🔄 Reconnecting...");
                startBot();
            }
        } else if (connection === "open") {
            console.log("✅ Bot connected successfully!");
        }
    });

    // Message handler
    sock.ev.on("messages.upsert", async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const from = msg.key.remoteJid;
        const body = 
            msg.message.conversation ||
            msg.message.extendedTextMessage?.text ||
            msg.message.imageMessage?.caption ||
            msg.message.videoMessage?.caption ||
            "";

        if (!body) return;

        const prefix = config.PREFIX || ".";
        const isCmd = body.startsWith(prefix);

        if (isCmd) {
            const cmd = body.slice(prefix.length).trim().split(" ")[0].toLowerCase();

            switch (cmd) {
                case "alive":
                    await sock.sendMessage(from, { text: config.LIVE_MSG }, { quoted: msg });
                    break;

                case "menu":
                    let menuText = `
👋 Hello, I am faith47 *${config.BOT_NAME}*
Prefix: ${config.PREFIX}

plugins:
- ${prefix}alive
- ${prefix}menu
- ${prefix}owner
                    `;
                    await sock.sendMessage(from, { image: { url: config.MENU_IMAGE_URL }, caption: menuText }, { quoted: msg });
                    break;

                case "owner":
                    await sock.sendMessage(from, { text: `👑 Owner: ${config.OWNER_NAME}\n📞 Number: ${config.OWNER_NUMBER}` }, { quoted: msg });
                    break;

                default:
                    await sock.sendMessage(from, { text: "❓ Unknown command. Try .menu" }, { quoted: msg });
                    break;
            }
        }
    });
}

startBot();
