
const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason, Browsers, jidNormalizedUser, getContentType } = require('@whiskeysockets/baileys');
const fs = require('fs');
const path = require('path');
const os = require('os');
const P = require('pino');
const config = require('./config'); // make sure you have config.js with PREFIX, OWNER, etc.
const { AntiDelete, saveMessage, getGroupAdmins } = require('./lib/functions'); // make sure these functions exist

const tempDir = path.join(os.tmpdir(), 'cache-temp');
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

const prefix = config.PREFIX || '.';
const ownerNumber = config.OWNER || ['923191089077'];

// Clear temp files every 5 minutes
setInterval(() => {
    fs.readdir(tempDir, (err, files) => {
        if (err) return console.error(err);
        for (const file of files) {
            fs.unlink(path.join(tempDir, file), console.error);
        }
    });
}, 5 * 60 * 1000);

async function startBot() {
    console.log('Connecting to WhatsApp...');
    const { state, saveCreds } = await useMultiFileAuthState('./sessions');
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        logger: P({ level: 'silent' }),
        printQRInTerminal: false,
        browser: Browsers.macOS('FAITH_Bot'),
        auth: state,
        version
    });

    // Connection updates
    sock.ev.on('connection.update', ({ connection, lastDisconnect }) => {
        if (connection === 'close') {
            if ((lastDisconnect.error)?.output?.statusCode !== DisconnectReason.loggedOut) {
                console.log('Reconnecting...');
                startBot();
            } else {
                console.log('Logged out. Session removed.');
            }
        } else if (connection === 'open') {
            console.log('Bot connected ✅');

            // Load plugins safely
            const pluginsDir = path.join(__dirname, 'plugins');
            if (fs.existsSync(pluginsDir)) {
                fs.readdirSync(pluginsDir).forEach(file => {
                    if (file.endsWith('.js')) {
                        try {
                            require(path.join(pluginsDir, file));
                        } catch (err) {
                            console.error('Error loading plugin:', file, err);
                        }
                    }
                });
            }
            console.log('Plugins loaded ✅');
        }
    });

    sock.ev.on('creds.update', saveCreds);

    // Message handler
    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg.message) return;

        let content = msg.message;
        if (getContentType(content) === 'ephemeralMessage') content = content.ephemeralMessage.message;

        const sender = msg.key.participant || msg.key.remoteJid;
        const isGroup = msg.key.remoteJid.endsWith('@g.us');
        const groupMetadata = isGroup ? await sock.groupMetadata(msg.key.remoteJid) : null;
        const groupAdmins = isGroup ? await getGroupAdmins(groupMetadata) : [];

        // Save message for anti-delete
        await saveMessage(msg);

        // Anti-Delete
        if (!msg.message) await AntiDelete(sock, m);

        // Command handling
        let text = content?.conversation || content?.extendedTextMessage?.text || '';
        const isCmd = text.startsWith(prefix);
        if (!isCmd) return;

        const args = text.slice(prefix.length).trim().split(/ +/);
        const commandName = args.shift().toLowerCase();

        // Example command
        if (commandName === 'ping') {
            await sock.sendMessage(msg.key.remoteJid, { text: 'Pong!' }, { quoted: msg });
        }

        // TODO: Add more commands
    });

    return sock;
}

// Start bot
startBot().catch(err => console.error(err));
