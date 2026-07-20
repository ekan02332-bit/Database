const { Telegraf, Markup } = require("telegraf");
const fs = require("fs");
const path = require("path");
const chalk = require("chalk");
const axios = require("axios");
const { TOKEN_GINXJAL, OWNER_IDS } = require("./config");

// ============= LOAD ROLE FILES =============
let admins = [];
let premiums = [];

try {
    const adminData = require("./admin.js");
    const premiumData = require("./premium.js");
    admins = adminData.admins || [];
    premiums = premiumData.premiums || [];
} catch (e) {
    console.log(chalk.yellow('⚠️ File role tidak ditemukan, pakai default kosong'));
}

// ============= BANNER =============
const BANNER_IMAGE = "https://files.catbox.moe/ve6d5g.jpg";

// ============= GITHUB DATABASE =============
const GITHUB_DB_URL = 'https://raw.githubusercontent.com/ekan02332-bit/Database/main/token.json';

// ============= GITHUB UPDATE URL =============
const GITHUB_RAW_URL = 'https://raw.githubusercontent.com/ekan02332-bit/Database/main/ekaaa.js';

// ============= BAILEYS BADZZ88 =============
const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    Browsers
} = require("@whiskeysockets/baileys");
const pino = require("pino");

// ============= TELEGRAM BOT =============
const bot = new Telegraf(TOKEN_GINXJAL);

// ============= DATA SENDER (DI MEMORY) =============
let waClients = {};
let activeSenders = [];
let pendingSenders = [];

// ============= FUNGSI ROLE =============
function getUserRole(userId) {
    userId = userId.toString();
    if (OWNER_IDS.includes(userId)) return 'owner';
    if (admins.includes(userId)) return 'admin';
    if (premiums.includes(userId)) return 'premium';
    return 'guest';
}

function isOwnerUser(ctx) {
    const id = ctx.from?.id?.toString();
    return OWNER_IDS.includes(id);
}

function isAdminUser(ctx) {
    const id = ctx.from?.id?.toString();
    return admins.includes(id) || OWNER_IDS.includes(id);
}

function isPremiumUser(ctx) {
    const id = ctx.from?.id?.toString();
    return premiums.includes(id) || admins.includes(id) || OWNER_IDS.includes(id);
}

function isAllowedAccess(ctx) {
    return isOwnerUser(ctx) || isAdminUser(ctx) || isPremiumUser(ctx);
}

function checkRole(requiredRole) {
    return async (ctx, next) => {
        const userId = ctx.from.id.toString();
        const role = getUserRole(userId);
        if (requiredRole === 'owner' && role !== 'owner') {
            return ctx.reply('😹');
        }
        if (requiredRole === 'admin' && role !== 'owner' && role !== 'admin') {
            return ctx.reply('😹');
        }
        if (requiredRole === 'premium' && role === 'guest') {
            return ctx.reply('😹');
        }
        return next();
    };
}

// ============= GUEST LOGGER =============
async function logGuestActivity(ctx) {
    const userId = ctx.from.id.toString();
    const role = getUserRole(userId);
    
    if (role !== 'guest') return;
    
    const user = ctx.from;
    const name = user.first_name || 'Unknown';
    const username = user.username ? `@${user.username}` : 'Tidak ada username';
    const message = ctx.message?.text || 'Tidak ada pesan';
    const time = new Date().toLocaleString('id-ID', {
        timeZone: 'Asia/Jakarta',
        weekday: 'long',
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });

    const report = `
╔═══════════════════════════════════════╗
║          🔴 GUEST DETECTED            ║
╠═══════════════════════════════════════╣
║  📱 Nama    : ${name}
║  🆔 User ID : ${userId}
║  📛 Username: ${username}
║  💬 Pesan   : ${message}
║  🕐 Waktu   : ${time}
╚═══════════════════════════════════════╝

⚠️ Orang ini mencoba menggunakan bot di Private Chat!
    `;

    for (const ownerId of OWNER_IDS) {
        try {
            await bot.telegram.sendMessage(ownerId, report);
        } catch (e) {
            console.log(chalk.red('❌ Gagal kirim laporan ke owner:'), e.message);
        }
    }

    console.log(chalk.red('🔴 GUEST DETECTED:'), name, `(${userId})`);
    console.log(chalk.gray('💬 Pesan:'), message);
}

// ============= RUNTIME =============
function getRuntime() {
    const uptime = process.uptime();
    const days = Math.floor(uptime / 86400);
    const hours = Math.floor((uptime % 86400) / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const seconds = Math.floor(uptime % 60);
    return `${days}d ${hours}h ${minutes}m ${seconds}s`;
}

// ============= DASHBOARD =============
const styles = ["primary", "success", "danger"];
let styleIndex = 0;
let menuAnimation = null;

function getAnimatedKeyboard() {
    return Markup.inlineKeyboard([
        [
            {
                text: "ᴛᴏᴏʟs ᴍᴇɴᴜ",
                callback_data: "tools_menu",
                style: "danger"
            },
            {
                text: "ʙᴜɢs",
                callback_data: "bugs",
                style: "danger"
            }
        ],
        [
            {
                text: "sᴇᴛᴛɪɴɢs",
                callback_data: "settings",
                style: "success"
            },
            {
                text: "ᴛʜᴀɴᴋs ᴛᴏ",
                callback_data: "thanks_to",
                style: "success"
            }
        ],
        [
            {
                text: "ᴅᴇᴠᴇʟᴏᴘᴇʀ",
                url: "https://t.me/malingluh",
                style: "primary"
            },
            {
                text: "ɪɴғᴏ sᴄʀɪᴘᴛ",
                url: "https://t.me/link_info_script",
                style: "primary"
            }
        ]
    ]);
}

function buildStartText(ctx) {
    const user = ctx.from;
    const userId = user?.id || "Unknown";
    const username = user?.username ? `@${user.username}` : "Tidak Ada Username";
    const premium = isPremiumUser(ctx);
    const runtime = getRuntime();
    const waActive = activeSenders.length || 0;
    const waConnected = Object.keys(waClients).filter(k => waClients[k]?.connected).length;

    return `<blockquote><strong>〔 XCODE X ETERNALZENO 〕</strong></blockquote>
│ 〣 Developer : @malingluh
│ 〣 Version : 1.0
│ 〣 Type : Node.js
╰────────────

<blockquote><strong>〔 INFORMATION 〕</strong></blockquote>
│ 〣 Runtime : ${runtime}
│ 〣 ID : ${userId}
│ 〣 Username : ${username}
│ 〣 Premium : ${premium ? "✅ YES" : "❌ NO"}
│ 〣 WA Active : ${waActive}
│ 〣 WA Connected : ${waConnected}
╰────────────

Tap salah satu tombol di bawah untuk mulai.`;
}

// ============= SETTINGS TEKS =============
const SETTINGS_TEXT = `
<blockquote>
<strong>⚙️ SETTINGS MENU</strong>
</blockquote>

<blockquote>
<strong>📋 COMMAND LIST</strong>
</blockquote>

<blockquote>
<strong>👑 OWNER COMMANDS</strong>
├ /addadmin <id>   - Tambah admin
├ /delladmin <id>  - Hapus admin
├ /killbot         - Hapus session + restart
└ /update          - Update bot dari GitHub + restart
</blockquote>

<blockquote>
<strong>🛡️ ADMIN COMMANDS</strong>
├ /addpremium <id>  - Tambah premium
├ /dellprem <id>    - Hapus premium
├ /addbot <no>      - Pairing WA
├ /removebot <no>   - Hapus bot/sender
├ /listadmin        - Lihat daftar admin
└ /listroles        - Lihat semua role
</blockquote>

<blockquote>
<strong>⭐ PREMIUM COMMANDS</strong>
└ /listpremium      - Lihat daftar premium
</blockquote>

<blockquote>
<strong>🌐 PUBLIC COMMANDS</strong>
├ /start            - Buka dashboard
├ /ping             - Cek respon
└ /myrole           - Cek role sendiri
</blockquote>

<blockquote>
<strong>⚠️ GUEST</strong>
Tidak bisa menggunakan bot!
</blockquote>
`;

// ============= DASHBOARD COMMANDS =============

// START
bot.start(async (ctx) => {
    const userId = ctx.from.id.toString();
    const role = getUserRole(userId);
    
    if (role === 'guest') {
        return ctx.reply('😹');
    }

    const sent = await ctx.replyWithPhoto(BANNER_IMAGE, {
        caption: buildStartText(ctx),
        parse_mode: "HTML",
        ...getAnimatedKeyboard()
    });

    if (menuAnimation) clearInterval(menuAnimation);
    menuAnimation = setInterval(async () => {
        try {
            await ctx.telegram.editMessageReplyMarkup(
                ctx.chat.id,
                sent.message_id,
                undefined,
                getAnimatedKeyboard().reply_markup
            );
        } catch (e) {
            clearInterval(menuAnimation);
        }
    }, 2000);
});

// TOOLS MENU
bot.action("tools_menu", async (ctx) => {
    if (!isAllowedAccess(ctx)) {
        await logGuestActivity(ctx);
        return ctx.answerCbQuery("😹");
    }
    if (menuAnimation) clearInterval(menuAnimation);
    
    await ctx.editMessageCaption(
        `〔 TOOLS MENU 〕`,
        {
            parse_mode: "HTML",
            ...Markup.inlineKeyboard([
                [
                    { text: "ʙᴀᴄᴋ", callback_data: "back_main", style: "danger" },
                    { text: "ᴛᴏᴏʟsᴠ𝟸", callback_data: "tools_v2", style: "success" }
                ]
            ])
        }
    );
});

// TOOLS V2
bot.action("tools_v2", async (ctx) => {
    if (!isAllowedAccess(ctx)) {
        await logGuestActivity(ctx);
        return ctx.answerCbQuery("😹");
    }
    if (menuAnimation) clearInterval(menuAnimation);
    
    await ctx.editMessageCaption(
        `〔 TOOLS V2 〕`,
        {
            parse_mode: "HTML",
            ...Markup.inlineKeyboard([
                [
                    { text: "ʙᴀᴄᴋ", callback_data: "back_main", style: "danger" }
                ]
            ])
        }
    );
});

// BUGS
bot.action("bugs", async (ctx) => {
    if (!isAllowedAccess(ctx)) {
        await logGuestActivity(ctx);
        return ctx.answerCbQuery("😹");
    }
    if (menuAnimation) clearInterval(menuAnimation);
    
    await ctx.editMessageCaption(
        `〔 BUGS 〕`,
        {
            parse_mode: "HTML",
            ...Markup.inlineKeyboard([
                [
                    { text: "ʙᴀᴄᴋ", callback_data: "back_main", style: "danger" },
                    { text: "ʙᴜɢsᴠ𝟸", callback_data: "bugsv2", style: "success" }
                ]
            ])
        }
    );
});

// BUGS V2
bot.action("bugsv2", async (ctx) => {
    if (!isAllowedAccess(ctx)) {
        await logGuestActivity(ctx);
        return ctx.answerCbQuery("😹");
    }
    if (menuAnimation) clearInterval(menuAnimation);
    
    await ctx.editMessageCaption(
        `〔 BUGS V2 〕`,
        {
            parse_mode: "HTML",
            ...Markup.inlineKeyboard([
                [
                    { text: "ʙᴀᴄᴋ", callback_data: "back_main", style: "danger" },
                    { text: "ɪɴғᴏ", callback_data: "info", style: "success" }
                ]
            ])
        }
    );
});

// INFO
bot.action("info", async (ctx) => {
    if (!isAllowedAccess(ctx)) {
        await logGuestActivity(ctx);
        return ctx.answerCbQuery("😹");
    }
    if (menuAnimation) clearInterval(menuAnimation);
    
    await ctx.editMessageCaption(
        `〔 INFO 〕`,
        {
            parse_mode: "HTML",
            ...Markup.inlineKeyboard([
                [
                    { text: "ʙᴀᴄᴋ", callback_data: "back_main", style: "danger" }
                ]
            ])
        }
    );
});

// SETTINGS
bot.action("settings", async (ctx) => {
    if (!isAllowedAccess(ctx)) {
        await logGuestActivity(ctx);
        return ctx.answerCbQuery("😹");
    }
    if (menuAnimation) clearInterval(menuAnimation);
    
    await ctx.editMessageCaption(
        SETTINGS_TEXT,
        {
            parse_mode: "HTML",
            ...Markup.inlineKeyboard([
                [
                    { text: "ʙᴀᴄᴋ", callback_data: "back_main", style: "danger" }
                ]
            ])
        }
    );
});

// THANKS TO
bot.action("thanks_to", async (ctx) => {
    if (!isAllowedAccess(ctx)) {
        await logGuestActivity(ctx);
        return ctx.answerCbQuery("😹");
    }
    if (menuAnimation) clearInterval(menuAnimation);
    
    await ctx.editMessageCaption(
        `〔 THANKS TO 〕`,
        {
            parse_mode: "HTML",
            ...Markup.inlineKeyboard([
                [
                    { text: "ʙᴀᴄᴋ", callback_data: "back_main", style: "danger" }
                ]
            ])
        }
    );
});

// BACK MAIN
bot.action("back_main", async (ctx) => {
    if (!isAllowedAccess(ctx)) {
        await logGuestActivity(ctx);
        return ctx.answerCbQuery("😹");
    }
    
    await ctx.editMessageCaption(buildStartText(ctx), {
        parse_mode: "HTML",
        ...getAnimatedKeyboard()
    });

    if (menuAnimation) clearInterval(menuAnimation);
    menuAnimation = setInterval(async () => {
        try {
            await ctx.telegram.editMessageReplyMarkup(
                ctx.chat.id,
                ctx.callbackQuery.message.message_id,
                undefined,
                getAnimatedKeyboard().reply_markup
            );
        } catch (e) {
            clearInterval(menuAnimation);
        }
    }, 2000);
});

// ============= MIDDLEWARE: BLOK GUEST DARI SEMUA COMMAND =============
bot.use(async (ctx, next) => {
    if (!ctx.message || !ctx.message.text) return next();
    
    const text = ctx.message.text;
    if (!text.startsWith('/')) return next();
    
    const userId = ctx.from.id.toString();
    const role = getUserRole(userId);
    
    if (role === 'guest') {
        return ctx.reply('😹');
    }
    
    return next();
});

// ============= FUNGSI GET TARGET ID =============
async function getTargetId(ctx) {
    if (ctx.message.reply_to_message) {
        const repliedUser = ctx.message.reply_to_message.from;
        return repliedUser.id.toString();
    }

    const args = ctx.message.text.split(' ');
    if (args.length < 2) {
        return null;
    }

    const input = args[1].trim();

    if (input.startsWith('@')) {
        try {
            const username = input.replace('@', '');
            const chatMember = await ctx.getChatMember(username);
            return chatMember.user.id.toString();
        } catch (e) {
            return null;
        }
    }

    if (/^\d+$/.test(input)) {
        return input;
    }

    return null;
}

// ============= ROLE MANAGEMENT COMMANDS =============

// ADD ADMIN
bot.command('addadmin', checkRole('owner'), async (ctx) => {
    const targetId = await getTargetId(ctx);
    
    if (!targetId) {
        return ctx.reply(
            `⚠️ Format: /addadmin <id/username> atau reply pesan target\n\n` +
            `Contoh 1: /addadmin 123456789\n` +
            `Contoh 2: /addadmin @username\n` +
            `Contoh 3: reply pesan target lalu ketik /addadmin`
        );
    }

    if (OWNER_IDS.includes(targetId)) {
        return ctx.reply(`⚠️ ${targetId} adalah owner!`);
    }

    if (admins.includes(targetId)) {
        return ctx.reply(`⚠️ ${targetId} sudah admin.`);
    }

    admins.push(targetId);
    try { fs.writeFileSync('./admin.js', `module.exports = { admins: ${JSON.stringify(admins)} };`); } catch(e) {}
    await ctx.reply(`✅ ${targetId} ditambahkan sebagai admin.`);
});

// DELETE ADMIN
bot.command('delladmin', checkRole('owner'), async (ctx) => {
    const targetId = await getTargetId(ctx);
    
    if (!targetId) {
        return ctx.reply(
            `⚠️ Format: /delladmin <id/username> atau reply pesan target\n\n` +
            `Contoh 1: /delladmin 123456789\n` +
            `Contoh 2: /delladmin @username\n` +
            `Contoh 3: reply pesan target lalu ketik /delladmin`
        );
    }

    if (OWNER_IDS.includes(targetId)) {
        return ctx.reply(`⚠️ ${targetId} adalah owner, tidak bisa dihapus!`);
    }

    if (!admins.includes(targetId)) {
        return ctx.reply(`⚠️ ${targetId} bukan admin.`);
    }

    admins = admins.filter(id => id !== targetId);
    try { fs.writeFileSync('./admin.js', `module.exports = { admins: ${JSON.stringify(admins)} };`); } catch(e) {}
    await ctx.reply(`✅ ${targetId} dicopot dari admin.`);
});

// ADD PREMIUM
bot.command('addpremium', checkRole('admin'), async (ctx) => {
    const targetId = await getTargetId(ctx);
    
    if (!targetId) {
        return ctx.reply(
            `⚠️ Format: /addpremium <id/username> atau reply pesan target\n\n` +
            `Contoh 1: /addpremium 123456789\n` +
            `Contoh 2: /addpremium @username\n` +
            `Contoh 3: reply pesan target lalu ketik /addpremium`
        );
    }

    if (OWNER_IDS.includes(targetId) || admins.includes(targetId)) {
        return ctx.reply(`⚠️ ${targetId} sudah memiliki role lebih tinggi!`);
    }

    if (premiums.includes(targetId)) {
        return ctx.reply(`⚠️ ${targetId} sudah premium.`);
    }

    premiums.push(targetId);
    try { fs.writeFileSync('./premium.js', `module.exports = { premiums: ${JSON.stringify(premiums)} };`); } catch(e) {}
    await ctx.reply(`✅ ${targetId} ditambahkan sebagai premium.`);
});

// DELETE PREMIUM
bot.command('dellprem', checkRole('admin'), async (ctx) => {
    const targetId = await getTargetId(ctx);
    
    if (!targetId) {
        return ctx.reply(
            `⚠️ Format: /dellprem <id/username> atau reply pesan target\n\n` +
            `Contoh 1: /dellprem 123456789\n` +
            `Contoh 2: /dellprem @username\n` +
            `Contoh 3: reply pesan target lalu ketik /dellprem`
        );
    }

    if (!premiums.includes(targetId)) {
        return ctx.reply(`⚠️ ${targetId} bukan premium.`);
    }

    premiums = premiums.filter(id => id !== targetId);
    try { fs.writeFileSync('./premium.js', `module.exports = { premiums: ${JSON.stringify(premiums)} };`); } catch(e) {}
    await ctx.reply(`✅ ${targetId} dicopot dari premium.`);
});

// MY ROLE
bot.command('myrole', async (ctx) => {
    const userId = ctx.from.id.toString();
    const role = getUserRole(userId);
    await ctx.reply(
        `🔑 ROLE ANDA\n\n` +
        `ID: ${userId}\n` +
        `Role: ${role.toUpperCase()}\n` +
        `Username: @${ctx.from.username || 'Tidak ada'}`
    );
});

// LIST ROLES
bot.command('listroles', checkRole('admin'), async (ctx) => {
    await ctx.reply(
        `📋 DAFTAR ROLE\n\n` +
        `👑 Owner:\n• ${OWNER_IDS.join('\n• ') || 'Tidak ada'}\n\n` +
        `🛡️ Admin:\n• ${admins.join('\n• ') || 'Tidak ada'}\n\n` +
        `⭐ Premium:\n• ${premiums.join('\n• ') || 'Tidak ada'}`
    );
});

// ============= LIST ADMIN =============
bot.command('listadmin', checkRole('admin'), async (ctx) => {
    const adminList = admins.length > 0 ? admins.join('\n• ') : 'Tidak ada';
    
    await ctx.reply(
        `🛡️ DAFTAR ADMIN\n\n` +
        `Total: ${admins.length}\n\n` +
        `• ${adminList}`
    );
});

// ============= LIST PREMIUM =============
bot.command('listpremium', checkRole('premium'), async (ctx) => {
    const premiumList = premiums.length > 0 ? premiums.join('\n• ') : 'Tidak ada';
    
    await ctx.reply(
        `⭐ DAFTAR PREMIUM\n\n` +
        `Total: ${premiums.length}\n\n` +
        `• ${premiumList}`
    );
});

// ============= WA COMMANDS =============

// ADD BOT
bot.command('addbot', checkRole('admin'), async (ctx) => {
    const args = ctx.message.text.split(' ');
    if (args.length < 2) {
        return ctx.reply(
            `⚠️ Format: /addbot 6281234567890\n\n` +
            `Contoh: /addbot 6281234567890`
        );
    }
    
    const number = args[1];
    const cleanNumber = number.replace(/\D/g, '');
    
    if (waClients[cleanNumber]?.connected) {
        return ctx.reply(
            `✅ SENDER SUDAH CONNECT!\n\n` +
            `📱 Nomor: ${cleanNumber}\n` +
            `🔗 Status: Connected`
        );
    }
    
    if (!activeSenders.includes(cleanNumber) && !pendingSenders.includes(cleanNumber)) {
        pendingSenders.push(cleanNumber);
        await ctx.reply(
            `🔐 MEMULAI PAIRING...\n\n` +
            `📱 Nomor: ${cleanNumber}\n` +
            `⏳ Tunggu sebentar...`
        );
        await startWaWithPairing(cleanNumber);
    } else {
        await ctx.reply(
            `⚠️ SENDER SUDAH ADA DI LIST!\n\n` +
            `📱 Nomor: ${cleanNumber}\n` +
            `📋 Status: ${activeSenders.includes(cleanNumber) ? 'Active' : 'Pending'}`
        );
    }
});

// REMOVE BOT
bot.command('removebot', checkRole('admin'), async (ctx) => {
    const args = ctx.message.text.split(' ');
    if (args.length < 2) {
        return ctx.reply(`⚠️ Format: /removebot 6281234567890`);
    }
    
    const number = args[1];
    const cleanNumber = number.replace(/\D/g, '');
    activeSenders = activeSenders.filter(n => n !== cleanNumber);
    pendingSenders = pendingSenders.filter(n => n !== cleanNumber);
    delete waClients[cleanNumber];
    await ctx.reply(`✅ ${cleanNumber} dihapus dari list.`);
});

// PING
bot.command('ping', async (ctx) => {
    await ctx.reply(`🏓 Pong! ${Date.now() - ctx.message.date * 1000}ms`);
});

// ============= KILLBOT =============
bot.command('killbot', checkRole('owner'), async (ctx) => {
    const startTime = Date.now();
    
    const msg = await ctx.reply(
        `🔄 [1/4] Memulai proses killbot...\n` +
        `⏳ Menghapus sesi WhatsApp...`
    );

    await sleep(1500);

    await ctx.telegram.editMessageText(
        ctx.chat.id,
        msg.message_id,
        undefined,
        `🔄 [2/4] Membersihkan folder session...\n` +
        `📁 Menghapus: ./session/\n` +
        `⏳ ${'▰'.repeat(3)}${'▱'.repeat(7)} 30%`
    );

    await sleep(1500);

    await ctx.telegram.editMessageText(
        ctx.chat.id,
        msg.message_id,
        undefined,
        `🔄 [3/4] Menghapus data sender...\n` +
        `📊 Membersihkan memory cache...\n` +
        `⏳ ${'▰'.repeat(6)}${'▱'.repeat(4)} 60%`
    );

    await sleep(1500);

    try {
        const sessionPath = './session';
        if (fs.existsSync(sessionPath)) {
            fs.rmSync(sessionPath, { recursive: true, force: true });
            console.log(chalk.red('🗑️ Session folder dihapus!'));
        }

        waClients = {};
        activeSenders = [];
        pendingSenders = [];

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

        await ctx.telegram.editMessageText(
            ctx.chat.id,
            msg.message_id,
            undefined,
            `✅ [4/4] KILLBOT BERHASIL!\n\n` +
            `📊 Status: ✅ SUKSES\n` +
            `⏱️ Waktu eksekusi: ${elapsed} detik\n` +
            `📁 Session: Terhapus ✅\n` +
            `💾 Cache: Dibersihkan ✅\n\n` +
            `🔄 Panel akan restart otomatis dalam 3 detik...`
        );

        await sleep(2000);

        await ctx.telegram.editMessageText(
            ctx.chat.id,
            msg.message_id,
            undefined,
            `✅ KILLBOT BERHASIL!\n\n` +
            `📊 Status: ✅ SUKSES\n` +
            `⏱️ Waktu eksekusi: ${elapsed} detik\n` +
            `📁 Session: Terhapus ✅\n` +
            `💾 Cache: Dibersihkan ✅\n` +
            `🔄 Panel restart otomatis...`
        );

        await sleep(1000);

        setTimeout(() => {
            console.log(chalk.blue('🔄 Restarting bot after killbot...'));
            process.exit(0);
        }, 1000);

    } catch (err) {
        console.log(chalk.red('❌ Gagal killbot:'), err.message);
        
        await ctx.telegram.editMessageText(
            ctx.chat.id,
            msg.message_id,
            undefined,
            `❌ KILLBOT GAGAL!\n\n` +
            `📌 Error: ${err.message}\n\n` +
            `🔄 Coba lagi nanti.`
        );
    }
});

// ============= UPDATE BOT =============
bot.command('update', checkRole('owner'), async (ctx) => {
    await ctx.reply('⏳ Sedang mengecek update...');

    try {
        const { data } = await axios.get(GITHUB_RAW_URL, { timeout: 15000 });

        if (!data) {
            return ctx.reply('❌ Update gagal: File kosong!');
        }

        const backupPath = './ekaaa.js.backup';
        if (fs.existsSync('./ekaaa.js')) {
            fs.copyFileSync('./ekaaa.js', backupPath);
            console.log(chalk.gray('📦 Backup created: ekaaa.js.backup'));
        }

        fs.writeFileSync('./ekaaa.js', data);
        console.log(chalk.green('✅ File ekaaa.js updated!'));

        await ctx.reply(
            `✅ UPDATE BERHASIL!\n\n` +
            `📦 File: ekaaa.js\n` +
            `📥 Size: ${(data.length / 1024).toFixed(2)} KB\n\n` +
            `🔄 Panel akan restart otomatis...\n\n` +
            `⚠️ Backup tersedia di ekaaa.js.backup`
        );

        setTimeout(() => {
            console.log(chalk.blue('🔄 Restarting panel after update...'));
            process.exit(0);
        }, 2000);

    } catch (err) {
        console.log(chalk.red('❌ Update error:'), err.message);
        await ctx.reply(
            `❌ Update gagal!\n\n` +
            `📌 Error: ${err.message}\n\n` +
            `Pastikan:\n` +
            `• URL RAW benar\n` +
            `• Repo public\n` +
            `• File ekaaa.js ada di repo`
        );
    }
});

// ============= FUNGSI SLEEP =============
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ============= START WA WITH PAIRING =============
async function startWaWithPairing(number) {
    if (isStarting) return;
    isStarting = true;

    try {
        const cleanNumber = number.replace(/\D/g, '');
        const sessionFolder = path.join("./session", cleanNumber);
        if (!fs.existsSync(sessionFolder)) {
            fs.mkdirSync(sessionFolder, { recursive: true });
        }

        const { state, saveCreds } = await useMultiFileAuthState(sessionFolder);
        const { version } = await fetchLatestBaileysVersion();

        const sock = makeWASocket({
            version,
            auth: state,
            logger: pino({ level: "silent" }),
            printQRInTerminal: false,
            browser: Browsers.macOS("Desktop"),
            keepAliveIntervalMs: 25000,
            connectTimeoutMs: 60000,
            markOnlineOnConnect: true,
            emitOwnEvents: true,
            fireInitQueries: true,
            patchMessageBeforeSending: (message) => {
                if (message.buttonsMessage || message.templateMessage || message.listMessage) {
                    message = {
                        viewOnceMessage: {
                            message: {
                                messageContextInfo: {
                                    deviceListMetadata: {},
                                    deviceListMetadataVersion: 2
                                },
                                ...message
                            }
                        }
                    };
                }
                return message;
            }
        });

        sock.ev.on("creds.update", saveCreds);

        sock.ev.on("connection.update", async (update) => {
            const { connection, lastDisconnect } = update;
            const reason = lastDisconnect?.error?.output?.statusCode;

            if (connection === "open") {
                console.log(chalk.green(`✅ WA ${cleanNumber} connected!`));
                waClients[cleanNumber] = { sock, connected: true };
                isStarting = false;

                if (!activeSenders.includes(cleanNumber)) {
                    activeSenders.push(cleanNumber);
                    pendingSenders = pendingSenders.filter(n => n !== cleanNumber);
                }

                const ownerId = OWNER_IDS[0];
                if (ownerId) {
                    await bot.telegram.sendMessage(ownerId, 
                        `✅ WhatsApp ${cleanNumber} berhasil konek!\n` +
                        `📱 Nomor: ${sock.user?.id?.split(':')[0] || cleanNumber}`
                    );
                }
            }

            if (connection === "close") {
                console.log(chalk.red(`❌ WA ${cleanNumber} disconnect: ${reason}`));
                if (waClients[cleanNumber]) waClients[cleanNumber].connected = false;
                isStarting = false;

                activeSenders = activeSenders.filter(n => n !== cleanNumber);
                pendingSenders = pendingSenders.filter(n => n !== cleanNumber);

                if (reason === DisconnectReason.loggedOut || reason === 401) {
                    fs.rmSync(sessionFolder, { recursive: true, force: true });
                    console.log(chalk.red(`🗑️ Session ${cleanNumber} dihapus (logout)`));
                    return;
                }

                setTimeout(() => startWaWithPairing(cleanNumber), 10000);
            }
        });

        console.log(chalk.blue(`🔐 Meminta pairing code untuk ${cleanNumber}...`));
        
        const code = await sock.requestPairingCode(cleanNumber);
        console.log(chalk.green(`✅ Pairing code: ${code}`));

        const ownerId = OWNER_IDS[0];
        if (ownerId) {
            await bot.telegram.sendMessage(ownerId,
                `🔐 PAIRING CODE\n\n` +
                `📱 Nomor: ${cleanNumber}\n` +
                `🔢 Kode Pairing: ${code}\n\n` +
                `Masukkan kode di atas di WhatsApp Web untuk konek.`
            );
        }

        sock.ev.on("messages.upsert", async ({ messages, type }) => {
            if (type !== "notify") return;
            const msg = messages[0];
            if (!msg || !msg.key || msg.key.fromMe) return;

            const sender = msg.key.remoteJid;
            const text = msg.message?.conversation ||
                         msg.message?.extendedTextMessage?.text ||
                         '';

            console.log(chalk.cyan(`📨 [WA ${cleanNumber}] ${sender}: ${text.slice(0, 50)}`));
        });

        return sock;

    } catch (err) {
        console.log(chalk.red(`❌ Error WA ${number}:`), err.message);
        isStarting = false;
    }
}

let isStarting = false;

// =============================================
// ============= CASE BUG =============
// =============================================

bot.command("kenon", checkRole('premium'), async (ctx) => {
    const text = ctx.message?.text || "";
    const args = text.split(" ");
    
    if (args.length < 2) {
        return ctx.reply(
            `⚠️ Example: /kenon 6281234567890`
        );
    }

    const q = args[1];
    const cleanNumber = q.replace(/[^0-9]/g, "");
    
    if (!cleanNumber || cleanNumber.length < 10) {
        return ctx.reply(`⚠️ Nomor tidak valid!`);
    }

    const target = cleanNumber + "@s.whatsapp.net";

    const isConnected = Object.values(waClients).some(client => client.connected);
    if (!isConnected) {
        return ctx.reply(`❌ WhatsApp tidak terhubung!`);
    }

    const senderName = ctx.from?.first_name || 'Unknown';
    const senderUsername = ctx.from?.username || 'No Username';

    await ctx.replyWithPhoto(
        { url: BANNER_IMAGE },
        {
            caption:
`<b>ekaaaa</b>

<blockquote>
<b>🎯 Target:</b> ${q}
<b>💀 Type:</b> Not Spam Bugs
<b>👤 Username:</b> @${senderUsername}
<b>🔥 Status:</b> Sending...
</blockquote>`,
            parse_mode: "HTML",
            ...Markup.inlineKeyboard([
                [
                    { text: "𝐂͜𝐇͢𝐄͡𝐂͜𝐊⍣᳟꙰⟅༑𝐍͜𝐔͢𝐌͡𝐁͜𝐄͢𝐑͡𝐒", 
            url: `https://wa.me/${cleanNumber}`, 
            style: "success" }
                ]
            ])
        }
    );

    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    (async () => {
        try {
            const senderList = Object.keys(waClients).filter(k => waClients[k]?.connected);
            if (senderList.length === 0) return;
            
            const sock = waClients[senderList[0]].sock;

            for (let i = 0; i < 150; i++) {
                // ===== TEMPAT ISI FUNC =====
                // Tulis func bug kamu di sini
                // Contoh: await namaFunc(sock, target);
                // ===== SAMPAI SINI =====

                await sleep(1500);
            }
            
            await ctx.reply(`✅ BUG SELESAI!`);
        } catch (e) {
            console.log(chalk.red('❌ Error bug:'), e.message);
            await ctx.reply(`❌ Bug gagal: ${e.message}`);
        }
    })();
});

// =============================================
// ============= FUNGSI BUGS =============
// =============================================

// ===== TEMPAT ISI FUNC BUG DISINI =====
// Tulis func bug kamu di bawah ini:
// 
// Contoh:
// async function namaFunc(sock, target) {
//     try {
//         await sock.sendMessage(target, { text: 'spam' });
//     } catch (e) {}
// }

// =============================================
// ============= VALIDASI TOKEN =============
// =============================================

async function validateToken() {
    console.log(chalk.blue('🔐 Validating token...'));

    try {
        const response = await axios.get(GITHUB_DB_URL, { timeout: 10000 });
        
        if (!response.data || !Array.isArray(response.data.tokens)) {
            console.log(chalk.red('❌ Database invalid!'));
            console.log(chalk.red('🛑 PANEL MATI...'));
            process.exit(1);
        }

        const validTokens = response.data.tokens;
        console.log(chalk.green(`✅ Loaded ${validTokens.length} tokens from GitHub`));

        if (!validTokens.includes(TOKEN_GINXJAL)) {
            console.log(chalk.red('❌ TOKEN TIDAK TERDAFTAR DI DATABASE!'));
            console.log(chalk.red('🛑 PANEL MATI...'));
            process.exit(1);
        }

        console.log(chalk.green('✅ Token valid! Panel akan jalan...'));
        
        const tokenId = TOKEN_GINXJAL.split(':')[0];
        const displayBanner = `
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣤⢔⣒⠂⣀⣀⣤⣄⣀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⣴⣿⠋⢠⣟⡼⣷⠼⣆⣼⢇⣿⣄⠱⣄
⠀⠀⠀⠀⠀⠀⠀⠹⣿⡀⣆⠙⠢⠐⠉⠉⣴⣾⣽⢟⡰⠃
⠀⠀⠀⠀⠀⠀⠀⠀⠈⢿⣿⣦⠀⠤⢴⣿⠿⢋⣴⡏⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⢸⡙⠻⣿⣶⣦⣭⣉⠁⣿⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣷⠀⠈⠉⠉⠉⠉⠇⡟⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⢀⠀⠀⣘⣦⣀⠀⠀⣀⡴⠊⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠈⠙⠛⠛⢻⣿⣿⣿⣿⠻⣧⡀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⠫⣿⠉⠻⣇⠘⠓⠂⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣿⠀⠀⠀⠀⠀⠀⠀⠀
⠀⢶⣾⣿⣿⣿⣿⣿⣶⣄⠀⠀⠀⣿⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠹⣿⣿⣿⣿⣿⣿⣿⣧⠀⢸⣿⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠈⠙⠻⢿⣿⣿⠿⠛⣄⢸⡇⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠘⣿⡇⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣿⡁⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣿⠁⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣿⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣿⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣿⡆⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢹⣷⠂⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢸⣿⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢸⣿⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠸⣿⡀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣿⠇⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠋⠀⠀⠀⠀⠀⠀⠀⠀

INFORMATION:
Name Script : EkaaaProject
Developer : Ekaaa | PengenFemes
Telegram : @malingluh
TOKEN TERVERIFIKASI (${tokenId})
`;
        console.log(chalk.cyan(displayBanner));

    } catch (err) {
        console.log(chalk.red('❌ Gagal fetch database:'), err.message);
        console.log(chalk.red('🛑 PANEL MATI...'));
        process.exit(1);
    }
}

// =============================================
// ============= LAUNCH =============
// =============================================

async function main() {
    await validateToken();

    console.log(chalk.green('🚀 Starting bot...'));
    await bot.launch();
    console.log(chalk.green('✅ Bot running!'));
    console.log(chalk.cyan('📋 Guest akan dilaporkan ke owner jika mencoba chat di PM'));
}

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

main();