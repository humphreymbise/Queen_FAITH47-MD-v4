
require('dotenv').config();
const { default: makeWASocket, useSingleFileAuthState, DisconnectReason } = require("@whiskeysockets/baileys");
const pino = require("pino");
const { Boom } = require("@hapi/boom");
const fs = require("fs");
const path = require("path");

// Load SESSION_ID from config.env
const { SESSION_ID } = process.env;

// Use a single file auth state
const { state, saveState } = useSingleFileAuthState('./session.json');

// Load all plugins dynamically
function loadPlugins(sock) {
    const pluginsDir = path.join(__dirname, 'plugins');
    if (!fs.existsSync(pluginsDir)) return;

    const files = fs.readdirSync(pluginsDir).filter(file => file.endsWith('.js'));
    for (const file of files) {
        try {
            const plugin = require(path.join(pluginsDir, file));
            if (typeof plugin === 'function') plugin(sock);
            console.log(`✅ Plugin loaded: ${file}`);
        } catch (e) {
            console.error(`❌ Failed to load plugin ${file}:`, e);
        }
    }
}

async function startBot() {
    const sock = makeWASocket({
        logger: pino({ level: "silent" }),
        auth: state,
        browser: ["FAITH47-MD", "Chrome", "4.5"]
        // ⚠️ Hakuna printQRInTerminal
    });

    // Save auth state updates
    sock.ev.on("creds.update", saveState);

    // Connection updates
    sock.ev.on("connection.update", (update) => {
        const { connection, lastDisconnect } = update;

        if (connection === "close") {
            const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
            console.log("❌ Connection closed, reason:", reason);
            if (reason !== DisconnectReason.loggedOut) {
                console.log("🔄 Reconnecting...");
                startBot();
            }
        } else if (connection === "open") {
            console.log("✅ FAITH47-MD is online!");
        }
    });

    // Load plugins
    loadPlugins(sock);
}

// Make sure SESSION_ID exists
if (!SESSION_ID) {
    console.error("❌ SESSION_ID not found in config.env! Run session.js + sessionToString.js first.");
    process.exit(1);
}

startBot();
