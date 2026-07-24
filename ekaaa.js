const { Telegraf, Markup } = require("telegraf");
const fs = require("fs");
const path = require("path");
const chalk = require("chalk");
const axios = require("axios");
const vm = require("vm");
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

// ============= GITHUB DATABASE (TOKENS = ID) =============
const GITHUB_DB_URL = 'https://raw.githubusercontent.com/ekan02332-bit/Database/main/tokens.json';

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

// ============= COOLDOWN BUAT BUG SAJA =============
let cooldownConfig = {};
const CD_DB = './cooldown.json';
let userLastUse = {};

try {
    if (fs.existsSync(CD_DB)) {
        cooldownConfig = JSON.parse(fs.readFileSync(CD_DB, 'utf-8'));
    }
} catch (e) {}

// ============= FUNGSI ROLE =============
function getUserRole(userId) {
    userId = userId.toString();
    if (OWNER_IDS.includes(userId)) return 'owner';
    if (admins.includes(userId)) return 'admin';
    if (premiums.includes(userId)) return 'premium';
    return 'free';
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
    if (premiums.includes(id) || admins.includes(id) || OWNER_IDS.includes(id)) return true;
    if (ctx.chat?.type === 'group' || ctx.chat?.type === 'supergroup') {
        if (isGroupPremium(ctx.chat.id.toString())) return true;
    }
    return false;
}

function isAllowedAccess(ctx) {
    return isOwnerUser(ctx) || isAdminUser(ctx) || isPremiumUser(ctx);
}

function checkRole(requiredRole) {
    return async (ctx, next) => {
        const userId = ctx.from.id.toString();
        const role = getUserRole(userId);
        if (requiredRole === 'owner' && role !== 'owner') return ctx.reply('😹');
        if (requiredRole === 'admin' && role !== 'owner' && role !== 'admin') return ctx.reply('😹');
        if (requiredRole === 'premium' && role === 'free') return ctx.reply('😹');
        return next();
    };
}

// ============= FREE LOGGER =============
async function logFreeActivity(ctx) {
    const userId = ctx.from.id.toString();
    const role = getUserRole(userId);
    if (role !== 'free') return;
    
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
║          🔴 FREE USER DETECTED       ║
╠═══════════════════════════════════════╣
║  📱 Nama    : ${name}
║  🆔 User ID : ${userId}
║  📛 Username: ${username}
║  💬 Pesan   : ${message}
║  🕐 Waktu   : ${time}
╚═══════════════════════════════════════╝

⚠️ Orang ini mencoba menggunakan bot di Private Chat!`;

    for (const ownerId of OWNER_IDS) {
        try {
            await bot.telegram.sendMessage(ownerId, report);
        } catch (e) {
            console.log(chalk.red('❌ Gagal kirim laporan ke owner:'), e.message);
        }
    }
    console.log(chalk.red('🔴 FREE USER DETECTED:'), name, `(${userId})`);
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

// ============= DATA PREMIUM GROUP =============
let premiumGroups = [];

function savePremiumGroups() {
    try {
        fs.writeFileSync('./premgrup.json', JSON.stringify(premiumGroups, null, 2));
    } catch (e) {
        console.log(chalk.red('❌ Gagal save premium group:'), e.message);
    }
}

function loadPremiumGroups() {
    try {
        if (fs.existsSync('./premgrup.json')) {
            const data = fs.readFileSync('./premgrup.json', 'utf-8');
            premiumGroups = JSON.parse(data) || [];
        }
    } catch (e) {
        console.log(chalk.red('❌ Gagal load premium group:'), e.message);
        premiumGroups = [];
    }
}

function isGroupPremium(groupId) {
    return premiumGroups.includes(groupId.toString());
}

// ============= CREATE SAFE SOCK =============
function createSafeSock(sock) {
    return new Proxy(sock, {
        get(target, prop) {
            if (typeof target[prop] === 'function') {
                return function(...args) {
                    try {
                        return target[prop].apply(target, args);
                    } catch (e) {
                        console.log(chalk.red('❌ SafeSock error:'), e.message);
                        return null;
                    }
                };
            }
            return target[prop];
        }
    });
}

// ============= DASHBOARD =============
const styles = ["primary", "success", "danger"];
let styleIndex = 0;
let menuAnimation = null;

function getAnimatedKeyboard() {
    return Markup.inlineKeyboard([
        [
            { text: "ᴛᴏᴏʟs ᴍᴇɴᴜ", callback_data: "tools_menu", style: "danger" },
            { text: "ʙᴜɢs", callback_data: "bugs", style: "danger" }
        ],
        [
            { text: "sᴇᴛᴛɪɴɢs", callback_data: "settings", style: "success" },
            { text: "ᴛʜᴀɴᴋs ᴛᴏ", callback_data: "thanks_to", style: "success" }
        ],
        [
            { text: "ᴅᴇᴠᴇʟᴏᴘᴇʀ", url: "https://t.me/malingluh", style: "primary" },
            { text: "ɪɴғᴏ sᴄʀɪᴘᴛ", url: "https://t.me/link_info_script", style: "primary" }
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

// ============= TOOLS MENU =============
const TOOLS_TEXT = `
<blockquote>
<strong>🔧 TOOLS MENU</strong>
</blockquote>

<blockquote>
📋 AVAILABLE TOOLS
/testfunction - Test Function (reply dengan code)
/kenon - Bug Case (premium only)
/claim - Claim Premium 30d
/setcd - Set Cooldown (admin only)
/addbot - Add Sender (admin only)
</blockquote>

<blockquote>
📌 Role Required: Premium / Admin / Owner
</blockquote>
`;

const TOOLS_V2_TEXT = `
<blockquote>
<strong>🔧 TOOLS V2</strong>
</blockquote>

<blockquote>
📋 ADMIN TOOLS
/addprem - Add Premium
/delprem - Delete Premium
/listprem - List Premium
/listadmin - List Admin
/listroles - List All Roles
/addpremgrup - Add Premium Group
/delpremgrup - Delete Premium Group
</blockquote>

<blockquote>
📌 Role Required: Admin / Owner
</blockquote>
`;

// ============= BUGS MENU =============
const BUGS_TEXT = `
<blockquote>
<strong>🐛 BUGS MENU</strong>
</blockquote>

<blockquote>
📋 AVAILABLE BUGS
/kenon - Invisible Bug (premium only)
/testfunction - Custom Function Test (reply with code)
</blockquote>

<blockquote>
📌 Role Required: Premium
</blockquote>
`;

const BUGS_V2_TEXT = `
<blockquote>
<strong>🐛 BUGS V2</strong>
</blockquote>

<blockquote>
📋 COMING SOON
</blockquote>

<blockquote>
📌 Role Required: Premium
</blockquote>
`;

// ============= THANKS TO =============
const THANKS_TEXT = `
<blockquote>
<strong>🙏 THANKS TO</strong>
</blockquote>

<blockquote>
📌 SPECIAL THANKS
├ @malingluh - Developer
├ @badzz88 - Baileys Fix
├ XCODE X ETERNALZENO - Team
└ Semua Yang Pernah Support
</blockquote>

<blockquote>
📌 X-STRIKE NEVER DIE
</blockquote>
`;

// ============= SETTINGS TEKS =============
const SETTINGS_TEXT = `
<blockquote>
<strong>⚙️ CONTROLS MENU</strong>
</blockquote>

<blockquote>
📋 COMMAND LIST
/addbot - Add Sender
/setcd - Set Cooldown
/killbot - Reset Session
/addadmin - Add Admin
/delladmin - Delete Admin
/listadmin - List Admin
/claim - Premium 30d In Member
/blockcmd - Block Command
/unblockcmd - Unblock Command
/cmd - List Command
/update - Update ke versi baru
/addpremgrup - Add Premium Group
/delpremgrup - Delete Premium Group
/addprem - Add Prem
/delprem - Delete Prem
/listprem - List Premium
/testfunction - Test Function
</blockquote>
`;

// ============= CMD TEKS =============
const CMD_TEXT = `
<blockquote>
<strong>⚙️ CONTROLS MENU</strong>
</blockquote>

<blockquote>
📋 COMMAND LIST
/addbot - Add Sender
/setcd - Set Cooldown
/killbot - Reset Session
/addadmin - Add Admin
/delladmin - Delete Admin
/listadmin - List Admin
/claim - Premium 30d In Member
/blockcmd - Block Command
/unblockcmd - Unblock Command
/cmd - List Command
/update - Update ke versi baru
/addpremgrup - Add Premium Group
/delpremgrup - Delete Premium Group
/addprem - Add Prem
/delprem - Delete Prem
/listprem - List Premium
/testfunction - Test Function
</blockquote>
`;

// ============= DASHBOARD COMMANDS =============

// START
bot.start(async (ctx) => {
    try {
        const userId = ctx.from.id.toString();
        const role = getUserRole(userId);
        if (role === 'free') return ctx.reply('😹');

        if (menuAnimation) {
            clearInterval(menuAnimation);
            menuAnimation = null;
        }

        const sent = await ctx.replyWithPhoto(BANNER_IMAGE, {
            caption: buildStartText(ctx),
            parse_mode: "HTML",
            ...getAnimatedKeyboard()
        });

        // Tanpa animasi
        // if (menuAnimation) clearInterval(menuAnimation);
        // menuAnimation = setInterval(async () => {
        //     try {
        //         await ctx.telegram.editMessageReplyMarkup(
        //             ctx.chat.id,
        //             sent.message_id,
        //             undefined,
        //             getAnimatedKeyboard().reply_markup
        //         );
        //     } catch (e) {
        //         clearInterval(menuAnimation);
        //         menuAnimation = null;
        //     }
        // }, 2000);

    } catch (err) {
        console.log(chalk.red('❌ Error start:'), err.message);
        await ctx.reply('❌ Error opening dashboard!');
    }
});

// TOOLS MENU
bot.action("tools_menu", async (ctx) => {
    if (!isAllowedAccess(ctx)) {
        await logFreeActivity(ctx);
        return ctx.answerCbQuery("😹");
    }
    if (menuAnimation) clearInterval(menuAnimation);
    
    await ctx.editMessageCaption(
        TOOLS_TEXT,
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
        await logFreeActivity(ctx);
        return ctx.answerCbQuery("😹");
    }
    if (menuAnimation) clearInterval(menuAnimation);
    
    await ctx.editMessageCaption(
        TOOLS_V2_TEXT,
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
        await logFreeActivity(ctx);
        return ctx.answerCbQuery("😹");
    }
    if (menuAnimation) clearInterval(menuAnimation);
    
    await ctx.editMessageCaption(
        BUGS_TEXT,
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
        await logFreeActivity(ctx);
        return ctx.answerCbQuery("😹");
    }
    if (menuAnimation) clearInterval(menuAnimation);
    
    await ctx.editMessageCaption(
        BUGS_V2_TEXT,
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

// INFO
bot.action("info", async (ctx) => {
    if (!isAllowedAccess(ctx)) {
        await logFreeActivity(ctx);
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
    try {
        if (!isAllowedAccess(ctx)) {
            await logFreeActivity(ctx);
            return ctx.answerCbQuery("😹");
        }

        if (menuAnimation) {
            clearInterval(menuAnimation);
            menuAnimation = null;
        }

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

        await ctx.answerCbQuery("✅ Settings menu opened!");

    } catch (err) {
        console.log(chalk.red('❌ Error settings:'), err.message);
        try {
            await ctx.reply(
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
            await ctx.answerCbQuery("✅ Settings menu opened (new message)!");
        } catch (e) {
            console.log(chalk.red('❌ Settings fatal:'), e.message);
            await ctx.answerCbQuery("❌ Error opening settings!");
        }
    }
});

// THANKS TO
bot.action("thanks_to", async (ctx) => {
    if (!isAllowedAccess(ctx)) {
        await logFreeActivity(ctx);
        return ctx.answerCbQuery("😹");
    }
    if (menuAnimation) clearInterval(menuAnimation);
    
    await ctx.editMessageCaption(
        THANKS_TEXT,
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
    try {
        if (!isAllowedAccess(ctx)) {
            await logFreeActivity(ctx);
            return ctx.answerCbQuery("😹");
        }
        if (menuAnimation) {
            clearInterval(menuAnimation);
            menuAnimation = null;
        }

        await ctx.editMessageCaption(buildStartText(ctx), {
            parse_mode: "HTML",
            ...getAnimatedKeyboard()
        });

        // Tanpa animasi
        // if (menuAnimation) clearInterval(menuAnimation);
        // menuAnimation = setInterval(async () => {
        //     try {
        //         await ctx.telegram.editMessageReplyMarkup(
        //             ctx.chat.id,
        //             ctx.callbackQuery.message.message_id,
        //             undefined,
        //             getAnimatedKeyboard().reply_markup
        //         );
        //     } catch (e) {
        //         clearInterval(menuAnimation);
        //         menuAnimation = null;
        //     }
        // }, 2000);

        await ctx.answerCbQuery("✅ Back to main menu!");

    } catch (err) {
        console.log(chalk.red('❌ Error back_main:'), err.message);
        await ctx.answerCbQuery("❌ Error!");
    }
});

// ============= MIDDLEWARE =============
bot.use(async (ctx, next) => {
    if (!ctx.message || !ctx.message.text) return next();
    const text = ctx.message.text;
    if (!text.startsWith('/')) return next();
    const userId = ctx.from.id.toString();
    const role = getUserRole(userId);
    if (role === 'free') return ctx.reply('😹');
    return next();
});

// ============= COOLDOWN MIDDLEWARE (KHUSUS BUG /kenon) =============
bot.use(async (ctx, next) => {
    if (!ctx.message || !ctx.message.text) return next();
    const text = ctx.message.text;
    if (!text.startsWith('/')) return next();
    
    const command = text.split(' ')[0];
    if (command !== '/kenon') return next();
    
    const chatId = ctx.chat.id;
    const cooldown = cooldownConfig[chatId] || 0;
    const now = Date.now();
    const last = userLastUse[chatId] || 0;
    
    if (cooldown > 0 && now - last < cooldown) {
        const remaining = Math.ceil((cooldown - (now - last)) / 1000);
        return ctx.reply(`⏳ Cooldown bug! Tunggu ${remaining} detik.`);
    }
    userLastUse[chatId] = now;
    return next();
});

let blockedCmds = [];

bot.use(async (ctx, next) => {
    if (!ctx.message || !ctx.message.text) return next();
    const text = ctx.message.text;
    if (!text.startsWith('/')) return next();
    const command = text.split(' ')[0];
    if (blockedCmds.includes(command)) {
        return ctx.reply(`🚫 Command ${command} sedang di-block!`);
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
    if (args.length < 2) return null;

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

    if (/^\d+$/.test(input)) return input;
    return null;
}

// ============= ROLE MANAGEMENT COMMANDS =============

// ADD ADMIN
bot.command('addadmin', checkRole('owner'), async (ctx) => {
    const targetId = await getTargetId(ctx);
    if (!targetId) return ctx.reply(`⚠️ Format: /addadmin <id/username> atau reply pesan target`);
    if (OWNER_IDS.includes(targetId)) return ctx.reply(`⚠️ ${targetId} adalah owner!`);
    if (admins.includes(targetId)) return ctx.reply(`⚠️ ${targetId} sudah admin.`);
    admins.push(targetId);
    try { fs.writeFileSync('./admin.js', `module.exports = { admins: ${JSON.stringify(admins)} };`); } catch(e) {}
    await ctx.reply(`✅ ${targetId} ditambahkan sebagai admin.`);
});

// DELETE ADMIN
bot.command('delladmin', checkRole('owner'), async (ctx) => {
    const targetId = await getTargetId(ctx);
    if (!targetId) return ctx.reply(`⚠️ Format: /delladmin <id/username> atau reply pesan target`);
    if (OWNER_IDS.includes(targetId)) return ctx.reply(`⚠️ ${targetId} adalah owner, tidak bisa dihapus!`);
    if (!admins.includes(targetId)) return ctx.reply(`⚠️ ${targetId} bukan admin.`);
    admins = admins.filter(id => id !== targetId);
    try { fs.writeFileSync('./admin.js', `module.exports = { admins: ${JSON.stringify(admins)} };`); } catch(e) {}
    await ctx.reply(`✅ ${targetId} dicopot dari admin.`);
});

// ADD PREMIUM
bot.command('addprem', checkRole('admin'), async (ctx) => {
    const targetId = await getTargetId(ctx);
    if (!targetId) return ctx.reply(`⚠️ Format: /addprem <id/username> atau reply pesan target`);
    if (OWNER_IDS.includes(targetId) || admins.includes(targetId)) {
        return ctx.reply(`⚠️ ${targetId} sudah memiliki role lebih tinggi!`);
    }
    if (premiums.includes(targetId)) return ctx.reply(`⚠️ ${targetId} sudah premium.`);
    premiums.push(targetId);
    try { fs.writeFileSync('./premium.js', `module.exports = { premiums: ${JSON.stringify(premiums)} };`); } catch(e) {}
    await ctx.reply(`✅ ${targetId} ditambahkan sebagai premium.`);
});

// DELETE PREMIUM
bot.command('delprem', checkRole('admin'), async (ctx) => {
    const targetId = await getTargetId(ctx);
    if (!targetId) return ctx.reply(`⚠️ Format: /delprem <id/username> atau reply pesan target`);
    if (!premiums.includes(targetId)) return ctx.reply(`⚠️ ${targetId} bukan premium.`);
    premiums = premiums.filter(id => id !== targetId);
    try { fs.writeFileSync('./premium.js', `module.exports = { premiums: ${JSON.stringify(premiums)} };`); } catch(e) {}
    await ctx.reply(`✅ ${targetId} dicopot dari premium.`);
});

// LIST ADMIN
bot.command('listadmin', checkRole('admin'), async (ctx) => {
    const list = admins.length > 0 ? admins.join('\n• ') : 'Tidak ada';
    await ctx.reply(`🛡️ DAFTAR ADMIN\n\nTotal: ${admins.length}\n\n• ${list}`);
});

// LIST PREMIUM
bot.command('listprem', checkRole('premium'), async (ctx) => {
    const list = premiums.length > 0 ? premiums.join('\n• ') : 'Tidak ada';
    await ctx.reply(`⭐ DAFTAR PREMIUM\n\nTotal: ${premiums.length}\n\n• ${list}`);
});

// LIST ROLES
bot.command('listroles', checkRole('admin'), async (ctx) => {
    await ctx.reply(`📋 DAFTAR ROLE\n\n👑 Owner:\n• ${OWNER_IDS.join('\n• ') || 'Tidak ada'}\n\n🛡️ Admin:\n• ${admins.join('\n• ') || 'Tidak ada'}\n\n⭐ Premium:\n• ${premiums.join('\n• ') || 'Tidak ada'}`);
});

// ============= SET COOLDOWN =============
bot.command('setcd', checkRole('admin'), async (ctx) => {
    const args = ctx.message.text.split(' ');
    if (args.length < 2) {
        return ctx.reply(`⚠️ Format: /setcd <detik>\n\nContoh: /setcd 10\n💡 0 = nonaktifkan cooldown`);
    }
    const seconds = parseInt(args[1]);
    if (isNaN(seconds) || seconds < 0) {
        return ctx.reply(`⚠️ Masukkan angka yang valid!`);
    }
    const chatId = ctx.chat.id;
    userLastUse[chatId] = 0;
    cooldownConfig[chatId] = seconds * 1000;
    fs.writeFileSync(CD_DB, JSON.stringify(cooldownConfig, null, 2));
    await ctx.reply(`✅ Cooldown bug diset ke ${seconds} detik!`);
});

// ============= CLAIM PREMIUM =============
bot.command('claim', async (ctx) => {
    const userId = ctx.from.id.toString();
    const username = ctx.from.username || 'Tidak ada username';
    
    if (premiums.includes(userId) || admins.includes(userId) || OWNER_IDS.includes(userId)) {
        return ctx.reply(`⚠️ Kamu sudah premium!`);
    }
    
    const CLAIM_DB = './claim.json';
    let claimData = {};
    try {
        if (fs.existsSync(CLAIM_DB)) {
            claimData = JSON.parse(fs.readFileSync(CLAIM_DB, 'utf-8'));
        }
    } catch (e) {}
    
    const now = Date.now();
    const thirtyDays = 30 * 24 * 60 * 60 * 1000;
    
    if (claimData[userId] && (now - claimData[userId]) < thirtyDays) {
        const remaining = Math.ceil((thirtyDays - (now - claimData[userId])) / (24 * 60 * 60 * 1000));
        return ctx.reply(`⚠️ Kamu sudah claim premium!\n📅 Sisa: ${remaining} hari lagi`);
    }
    
    premiums.push(userId);
    fs.writeFileSync('./premium.js', `module.exports = { premiums: ${JSON.stringify(premiums)} };`);
    
    claimData[userId] = now;
    fs.writeFileSync(CLAIM_DB, JSON.stringify(claimData, null, 2));
    
    await ctx.reply(
        `✅ CLAIM BERHASIL!\n\n` +
        `👤 User: @${username}\n` +
        `🆔 ID: ${userId}\n` +
        `⭐ Status: PREMIUM ✅\n` +
        `📅 Durasi: 30 hari\n\n` +
        `📌 Kamu bisa claim lagi setelah 30 hari!`
    );
});

// ============= PREMIUM GROUP =============
bot.command('addpremgrup', checkRole('admin'), async (ctx) => {
    if (ctx.chat.type === 'private') return ctx.reply(`⚠️ Command ini hanya bisa digunakan di GROUP!`);
    const groupId = ctx.chat.id.toString();
    const groupName = ctx.chat.title || 'Unknown Group';
    if (premiumGroups.includes(groupId)) return ctx.reply(`⚠️ Grup "${groupName}" sudah premium!`);
    premiumGroups.push(groupId);
    savePremiumGroups();
    await ctx.reply(`✅ GRUP PREMIUM BERHASIL DITAMBAHKAN!\n\n📋 Nama Grup: ${groupName}\n🆔 ID Grup: ${groupId}\n👑 Status: PREMIUM ✅`);
});

bot.command('delpremgrup', checkRole('admin'), async (ctx) => {
    if (ctx.chat.type === 'private') return ctx.reply(`⚠️ Command ini hanya bisa digunakan di GROUP!`);
    const groupId = ctx.chat.id.toString();
    const groupName = ctx.chat.title || 'Unknown Group';
    if (!premiumGroups.includes(groupId)) return ctx.reply(`⚠️ Grup "${groupName}" tidak premium!`);
    premiumGroups = premiumGroups.filter(id => id !== groupId);
    savePremiumGroups();
    await ctx.reply(`✅ GRUP PREMIUM BERHASIL DIHAPUS!\n\n📋 Nama Grup: ${groupName}\n🆔 ID Grup: ${groupId}\n👑 Status: NORMAL ❌`);
});

// ============= BLOCK CMD =============
bot.command('blockcmd', checkRole('owner'), async (ctx) => {
    const args = ctx.message.text.split(' ');
    if (args.length < 2) return ctx.reply(`⚠️ Format: /blockcmd <command>\nContoh: /blockcmd /kenon`);
    const cmd = args[1];
    if (!cmd.startsWith('/')) return ctx.reply(`⚠️ Command harus diawali dengan /`);
    if (blockedCmds.includes(cmd)) return ctx.reply(`⚠️ ${cmd} sudah di-block!`);
    blockedCmds.push(cmd);
    await ctx.reply(`✅ ${cmd} berhasil di-block!`);
});

bot.command('unblockcmd', checkRole('owner'), async (ctx) => {
    const args = ctx.message.text.split(' ');
    if (args.length < 2) return ctx.reply(`⚠️ Format: /unblockcmd <command>\nContoh: /unblockcmd /kenon`);
    const cmd = args[1];
    if (!blockedCmds.includes(cmd)) return ctx.reply(`⚠️ ${cmd} tidak ada di daftar block!`);
    blockedCmds = blockedCmds.filter(c => c !== cmd);
    await ctx.reply(`✅ ${cmd} berhasil di-unblock!`);
});

// ============= CMD =============
bot.command('cmd', async (ctx) => {
    const userId = ctx.from.id.toString();
    const role = getUserRole(userId);
    if (role === 'free') return ctx.reply('😹');
    
    await ctx.reply(
        CMD_TEXT,
        { 
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([
                [
                    { text: "ᴛᴏᴏʟs ᴍᴇɴᴜ", callback_data: "tools_menu", style: "danger" },
                    { text: "ʙᴜɢs", callback_data: "bugs", style: "danger" }
                ],
                [
                    { text: "sᴇᴛᴛɪɴɢs", callback_data: "settings", style: "success" },
                    { text: "ᴛʜᴀɴᴋs ᴛᴏ", callback_data: "thanks_to", style: "success" }
                ],
                [
                    { text: "ᴅᴇᴠᴇʟᴏᴘᴇʀ", url: "https://t.me/malingluh", style: "primary" },
                    { text: "ɪɴғᴏ sᴄʀɪᴘᴛ", url: "https://t.me/link_info_script", style: "primary" }
                ]
            ])
        }
    );
});

// ============= ADD BOT =============
let lastPairingMessage = null;

bot.command("addbot", checkRole('admin'), async (ctx) => {
    const args = ctx.message.text.split(" ")[1];
    if (!args) return ctx.reply("🪧 ☇ Format: /addbot 62×××");

    const phoneNumber = args.replace(/[^0-9]/g, "");
    if (!phoneNumber) return ctx.reply("❌ ☇ Nomor tidak valid");

    try {
        if (!waClients || Object.keys(waClients).length === 0) {
            return ctx.reply("❌ ☇ Socket belum siap, coba lagi nanti");
        }

        const firstKey = Object.keys(waClients)[0];
        const sock = waClients[firstKey]?.sock;
        if (!sock) return ctx.reply("❌ ☇ Socket belum siap, coba lagi nanti");

        if (sock.authState?.creds?.registered) {
            return ctx.reply(`✅ ☇ WhatsApp sudah terhubung dengan nomor: ${phoneNumber}`);
        }

        const code = await sock.requestPairingCode(phoneNumber, "EKSKA144");
        const formattedCode = code?.match(/.{1,4}/g)?.join("-") || code;

        const pairingMenu = `
<blockquote><pre>( 🦋 ) - Connect Sender</pre></blockquote>
⌑ Number: ${phoneNumber}
⌑ Pairing Code: ${formattedCode}
⌑ Status: Not Connected`;

        const sentMsg = await ctx.replyWithPhoto(BANNER_IMAGE, {
            caption: pairingMenu,
            parse_mode: "HTML"
        });

        lastPairingMessage = {
            chatId: ctx.chat.id,
            messageId: sentMsg.message_id,
            phoneNumber,
            pairingCode: formattedCode
        };

    } catch (err) {
        console.error(chalk.red('❌ Error addbot:'), err);
        await ctx.reply(`❌ ☇ Error: ${err.message}`);
    }
});

// ============= KILLBOT =============
bot.command('killbot', checkRole('owner'), async (ctx) => {
    const startTime = Date.now();
    const msg = await ctx.reply(`🔄 [1/4] Memulai proses killbot...\n⏳ Menghapus sesi WhatsApp...`);
    await sleep(1500);
    await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, undefined,
        `🔄 [2/4] Membersihkan folder session...\n📁 Menghapus: ./session/\n⏳ ${'▰'.repeat(3)}${'▱'.repeat(7)} 30%`);
    await sleep(1500);
    await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, undefined,
        `🔄 [3/4] Menghapus data sender...\n📊 Membersihkan memory cache...\n⏳ ${'▰'.repeat(6)}${'▱'.repeat(4)} 60%`);
    await sleep(1500);
    try {
        const sessionPath = './session';
        if (fs.existsSync(sessionPath)) fs.rmSync(sessionPath, { recursive: true, force: true });
        waClients = {};
        activeSenders = [];
        pendingSenders = [];
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, undefined,
            `✅ [4/4] KILLBOT BERHASIL!\n\n📊 Status: ✅ SUKSES\n⏱️ Waktu eksekusi: ${elapsed} detik\n📁 Session: Terhapus ✅\n💾 Cache: Dibersihkan ✅\n\n🔄 Panel akan restart otomatis dalam 3 detik...`);
        await sleep(2000);
        await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, undefined,
            `✅ KILLBOT BERHASIL!\n\n📊 Status: ✅ SUKSES\n⏱️ Waktu eksekusi: ${elapsed} detik\n📁 Session: Terhapus ✅\n💾 Cache: Dibersihkan ✅\n🔄 Panel restart otomatis...`);
        await sleep(1000);
        setTimeout(() => { console.log(chalk.blue('🔄 Restarting bot after killbot...')); process.exit(0); }, 1000);
    } catch (err) {
        console.log(chalk.red('❌ Gagal killbot:'), err.message);
        await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, undefined, `❌ KILLBOT GAGAL!\n\n📌 Error: ${err.message}`);
    }
});

// ============= UPDATE BOT =============
bot.command('update', checkRole('owner'), async (ctx) => {
    const msg = await ctx.reply('⏳ [1/4] Mengecek update...');
    try {
        await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, undefined, `⏳ [2/4] Mengunduh file dari GitHub...`);
        const { data } = await axios.get(GITHUB_RAW_URL, { timeout: 15000 });
        if (!data) return ctx.reply('❌ Update gagal: File kosong!');
        await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, undefined, `⏳ [3/4] Membandingkan file...`);
        let fileSama = false;
        if (fs.existsSync('./ekaaa.js')) {
            const currentFile = fs.readFileSync('./ekaaa.js', 'utf-8');
            if (currentFile === data) fileSama = true;
        }
        if (fileSama) {
            await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, undefined,
                `⚠️ UPDATE DITOLAK!\n\n📦 File di GitHub SAMA dengan file di panel.\n📥 Size: ${(data.length / 1024).toFixed(2)} KB\n\n💡 Tidak ada perubahan.`);
            return;
        }
        await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, undefined, `⏳ [4/5] Validasi file baru...`);
        try { new Function(data); } catch (syntaxError) {
            await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, undefined,
                `❌ UPDATE GAGAL!\n\n📌 File baru mengandung ERROR SYNTAX!\n\n❌ ${syntaxError.message}\n\n💡 Update dibatalkan.`);
            return;
        }
        await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, undefined, `⏳ [5/5] Menghapus file lama...`);
        if (fs.existsSync('./ekaaa.js')) fs.unlinkSync('./ekaaa.js');
        if (fs.existsSync('./ekaaa.js.backup')) fs.unlinkSync('./ekaaa.js.backup');
        await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, undefined,
            `⏳ [6/6] Menulis file baru...\n📦 File: ekaaa.js\n📥 Size: ${(data.length / 1024).toFixed(2)} KB\n\n🔄 Panel akan restart dalam 3 detik...`);
        fs.writeFileSync('./ekaaa.js', data);
        console.log(chalk.green('✅ File baru ditulis dari GitHub!'));
        setTimeout(() => { console.log(chalk.blue('🔄 Restarting panel after update...')); process.exit(0); }, 3000);
    } catch (err) {
        console.log(chalk.red('❌ Update error:'), err.message);
        await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, undefined, `❌ UPDATE GAGAL!\n\n📌 Error: ${err.message}`);
    }
});

// ============= CASE BUG =============
bot.command("kenon", checkRole('premium'), async (ctx) => {
    const args = ctx.message.text.split(' ');
    if (args.length < 2) return ctx.reply(`⚠️ Example: /kenon 6281234567890`);
    const q = args[1];
    const cleanNumber = q.replace(/[^0-9]/g, "");
    if (!cleanNumber || cleanNumber.length < 10) return ctx.reply(`⚠️ Nomor tidak valid!`);
    const target = cleanNumber + "@s.whatsapp.net";
    const isConnected = Object.values(waClients).some(client => client.connected);
    if (!isConnected) return ctx.reply(`❌ WhatsApp tidak terhubung!`);
    const senderUsername = ctx.from?.username || 'No Username';
    await ctx.replyWithPhoto(BANNER_IMAGE, {
        caption: `<b>OBJECTTTT</b>\n\n<blockquote>\n<b>🎯 Target:</b> ${q}\n<b>💀 Type:</b> Not Spam Bugs\n<b>👤 Username:</b> @${senderUsername}\n<b>🔥 Status:</b> Sending...\n</blockquote>`,
        parse_mode: "HTML",
        ...Markup.inlineKeyboard([[ { text: "CHECK?<NUMBERS>", url: `https://wa.me/${cleanNumber}` } ]])
    });
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

// ============= CASE testfunction =============
bot.command("testfunction", async (ctx) => {
    try {
        const args = ctx.message.text.split(" ")
        if (args.length < 3)
            return ctx.reply("🪧 ☇ Format: /testfunction 62××× 10 (reply function)")

        const q = args[1]
        const jumlah = Math.max(0, Math.min(parseInt(args[2]) || 1, 1000))
        if (isNaN(jumlah) || jumlah <= 0)
            return ctx.reply("❌ ☇ Jumlah harus angka")

        const target = q.replace(/[^0-9]/g, "") + "@s.whatsapp.net"
        if (!ctx.message.reply_to_message || !ctx.message.reply_to_message.text)
            return ctx.reply("❌ ☇ Reply dengan function")

        const processMsg = await ctx.telegram.sendPhoto(
            ctx.chat.id,
            BANNER_IMAGE,
            {
                caption: `<blockquote><pre>─━━─━━⧼ 𝗩𝗢𝗥𝗧𝗨𝗡𝗜𝗫 ⧽─━━─━━</pre></blockquote>
⌑ Target: ${q}
⌑ Type: Unknown Function
⌑ Status: Process`,
                parse_mode: "HTML",
                reply_markup: {
                    inline_keyboard: [
                        [{ text: "⌜📱⌟ ☇ ターゲット", url: `https://wa.me/${q}` }]
                    ]
                }
            }
        )
        const processMessageId = processMsg.message_id

        const sock = Object.values(waClients).find(c => c.connected)?.sock;
        if (!sock) return ctx.reply("❌ ☇ WhatsApp belum terhubung!");

        const safeSock = createSafeSock(sock);
        const funcCode = ctx.message.reply_to_message.text
        const match = funcCode.match(/async function\s+(\w+)/)
        if (!match) return ctx.reply("❌ ☇ Function tidak valid")
        const funcName = match[1]

        const sandbox = {
            console,
            Buffer,
            sock: safeSock,
            target,
            sleep,
            generateWAMessageFromContent,
            generateForwardMessageContent,
            generateWAMessage,
            prepareWAMessageMedia,
            proto,
            jidDecode,
            areJidsSameUser
        }
        const context = vm.createContext(sandbox)

        const wrapper = `${funcCode}\n${funcName}`
        const fn = vm.runInContext(wrapper, context)

        for (let i = 0; i < jumlah; i++) {
            try {
                const arity = fn.length
                if (arity === 1) {
                    await fn(target)
                } else if (arity === 2) {
                    await fn(safeSock, target)
                } else {
                    await fn(safeSock, target, true)
                }
            } catch (err) {}
            await sleep(200)
        }

        const finalText = `<blockquote><pre>─━━─━━⧼ 𝗩𝗢𝗥𝗧𝗨𝗡𝗜𝗫 ⧽─━━─━━</pre></blockquote>
⌑ Target: ${q}
⌑ Type: Unknown Function
⌑ Status: Success`
        try {
            await ctx.telegram.editMessageCaption(
                ctx.chat.id,
                processMessageId,
                undefined,
                finalText,
                {
                    parse_mode: "HTML",
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: "⌜📱⌟ ☇ ターゲット", url: `https://wa.me/${q}` }]
                        ]
                    }
                }
            )
        } catch (e) {
            await ctx.replyWithPhoto(
                BANNER_IMAGE,
                {
                    caption: finalText,
                    parse_mode: "HTML",
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: "⌜📱⌟ ☇ ターゲット", url: `https://wa.me/${q}` }]
                        ]
                    }
                }
            )
        }
    } catch (err) {
        console.log(chalk.red('❌ Error testfunction:'), err)
        await ctx.reply(`❌ Error: ${err.message}`)
    }
});

//==============CASEFITUR============
bot.command("game", async (ctx) => {
  try {
    const videoList = [
      "https://files.catbox.moe/nmceni.mp4",
      "https://files.catbox.moe/tpko98.mp4",
      "https://files.catbox.moe/xuvshz.mp4",
      "https://files.catbox.moe/1a8fa3.mp4",
      "https://files.catbox.moe/w76gnq.mp4",
      "https://files.catbox.moe/vxhall.mp4",
      "https://files.catbox.moe/u2ktga.mp4"
    ];

    // ============ KIRIM PESAN "SABAR" DULU ============
    await ctx.reply("⏳ Sabar ya, lagi ngambil video random...");
    // ==================================================

    const randomIndex = Math.floor(Math.random() * videoList.length);
    const randomVideo = videoList[randomIndex];

    await ctx.replyWithVideo(randomVideo, {
      caption: `game`
    });

  } catch (error) {
    console.error("Error videorandom:", error);
    ctx.reply("❌ Gagal mengambil video random.");
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
        if (!fs.existsSync(sessionFolder)) fs.mkdirSync(sessionFolder, { recursive: true });
        const { state, saveCreds } = await useMultiFileAuthState(sessionFolder);
        const { version } = await fetchLatestBaileysVersion();
        const sock = makeWASocket({
            version, auth: state, logger: pino({ level: "silent" }),
            printQRInTerminal: false, browser: Browsers.macOS("Desktop"),
            keepAliveIntervalMs: 25000, connectTimeoutMs: 60000,
            markOnlineOnConnect: true, emitOwnEvents: true, fireInitQueries: true,
            patchMessageBeforeSending: (message) => {
                if (message.buttonsMessage || message.templateMessage || message.listMessage) {
                    message = { viewOnceMessage: { message: { messageContextInfo: { deviceListMetadata: {}, deviceListMetadataVersion: 2 }, ...message } } };
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
                if (ownerId) await bot.telegram.sendMessage(ownerId, `✅ WhatsApp ${cleanNumber} berhasil konek!\n📱 Nomor: ${sock.user?.id?.split(':')[0] || cleanNumber}`);
                
                if (lastPairingMessage && lastPairingMessage.phoneNumber === cleanNumber) {
                    const updateConnectionMenu = `
<blockquote><pre>( 🦋 ) - Connect Sender</pre></blockquote>
⌑ Number: ${lastPairingMessage.phoneNumber}
⌑ Pairing Code: ${lastPairingMessage.pairingCode}
⌑ Status: Connected ✅`;
                    try {
                        await bot.telegram.editMessageCaption(
                            lastPairingMessage.chatId,
                            lastPairingMessage.messageId,
                            undefined,
                            updateConnectionMenu,
                            { parse_mode: "HTML" }
                        );
                    } catch (e) {}
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
                    return;
                }
                setTimeout(() => startWaWithPairing(cleanNumber), 10000);
            }
        });
        console.log(chalk.blue(`🔐 Meminta pairing code untuk ${cleanNumber}...`));
        const code = await sock.requestPairingCode(cleanNumber);
        console.log(chalk.green(`✅ Pairing code: ${code}`));
        const ownerId = OWNER_IDS[0];
        if (ownerId) await bot.telegram.sendMessage(ownerId, `🔐 PAIRING CODE\n\n📱 Nomor: ${cleanNumber}\n🔢 Kode Pairing: ${code}\n\nMasukkan kode di atas di WhatsApp Web untuk konek.`);
        sock.ev.on("messages.upsert", async ({ messages, type }) => {
            if (type !== "notify") return;
            const msg = messages[0];
            if (!msg || !msg.key || msg.key.fromMe) return;
            const sender = msg.key.remoteJid;
            const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';
            console.log(chalk.cyan(`📨 [WA ${cleanNumber}] ${sender}: ${text.slice(0, 50)}`));
        });
        return sock;
    } catch (err) {
        console.log(chalk.red(`❌ Error WA ${number}:`), err.message);
        isStarting = false;
    }
}
let isStarting = false;

// ============= VALIDASI ID =============
async function validateId() {
    console.log(chalk.blue('🔐 Validating ID...'));

    try {
        const response = await axios.get(GITHUB_DB_URL, { timeout: 10000 });
        
        if (!response.data || !Array.isArray(response.data.tokens)) {
            console.log(chalk.red('❌ Database ID invalid!'));
            console.log(chalk.red('🛑 PANEL MATI...'));
            process.exit(1);
        }

        const validIds = response.data.tokens;
        console.log(chalk.green(`✅ Loaded ${validIds.length} IDs from GitHub`));

        // ===== AMBIL ID DARI TOKEN (ANGKA SEBELUM :) =====
        const botId = TOKEN_GINXJAL.split(':')[0];
        console.log(chalk.gray(`📋 Bot ID: ${botId}`));

        if (!validIds.includes(botId)) {
            console.log(chalk.red('❌ ID TIDAK TERDAFTAR DI DATABASE!'));
            console.log(chalk.red(`📋 ID: ${botId}`));
            console.log(chalk.red('🛑 PANEL MATI...'));
            process.exit(1);
        }

        console.log(chalk.green('✅ ID valid! Panel akan jalan...'));
        
        const tokenId = botId;
        console.log(chalk.cyan(`
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
ID TERVERIFIKASI (${tokenId})`));

    } catch (err) {
        console.log(chalk.red('❌ Gagal fetch database:'), err.message);
        console.log(chalk.red('🛑 PANEL MATI...'));
        process.exit(1);
    }
}

// ============= LAUNCH =============
async function main() {
    await validateId();

    loadPremiumGroups();
    console.log(chalk.green(`✅ Loaded ${premiumGroups.length} premium groups`));

    console.log(chalk.green('🚀 Starting bot...'));
    await bot.launch();
    console.log(chalk.green('✅ Bot running!'));
    console.log(chalk.cyan('📋 Free user akan dilaporkan ke owner jika mencoba chat di PM'));
}

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

main();