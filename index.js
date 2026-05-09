require('dotenv').config();

const { Client, GatewayIntentBits } = require('discord.js');
const sqlite3 = require('sqlite3').verbose();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildBans
    ]
});

const db = new sqlite3.Database('./levels.db');

// ============================================================
// 🗄️ BASE DE DONNÉES
// ============================================================
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        userId TEXT PRIMARY KEY,
        xp INTEGER DEFAULT 0,
        level INTEGER DEFAULT 0,
        coins INTEGER DEFAULT 0
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS shop (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        roleId TEXT,
        roleName TEXT,
        price INTEGER,
        duration INTEGER DEFAULT 0,
        description TEXT DEFAULT ''
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS role_expirations (
        userId TEXT,
        roleId TEXT,
        expiresAt INTEGER,
        PRIMARY KEY (userId, roleId)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS recent_messages (
        userId TEXT,
        content TEXT,
        timestamp INTEGER
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS activity (
        userId TEXT,
        hour INTEGER,
        count INTEGER DEFAULT 0,
        PRIMARY KEY (userId, hour)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS ideas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId TEXT,
        idea TEXT,
        timestamp INTEGER
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS banned_ideas (
        userId TEXT PRIMARY KEY
    )`);
});

// ============================================================
// ⚙️ CONFIG
// ============================================================
const LEVELUP_CHANNEL_NAME = "🔆niveau🔆";
const COMMAND_CHANNEL_NAME = "commande";
const ADMIN_ROLE_NAME      = "OP";

// ============================================================
// 🎁 RECOMPENSES
// ============================================================
const rewards = [
    { minLevel: 1,  maxLevel: 2,  role: "Nouveau" },
    { minLevel: 3,  maxLevel: 4,  role: "Actif"   },
    { minLevel: 5,  maxLevel: 9,  role: "Cool"    },
    { minLevel: 10, maxLevel: 19, role: "OG"      },
    { minLevel: 20, maxLevel: Infinity, role: "Dieu" }
];

// ============================================================
// 🔧 FONCTIONS UTILITAIRES
// ============================================================

function getLevelUpChannel(guild) {
    return guild.channels.cache.find(c => c.name === LEVELUP_CHANNEL_NAME && c.isTextBased());
}

function getCommandChannel(guild) {
    return guild.channels.cache.find(c => c.name === COMMAND_CHANNEL_NAME && c.isTextBased());
}

function getLogsChannel(guild) {
    return guild.channels.cache.find(c => c.name === "logs" && c.isTextBased());
}

function sendLog(guild, msg) {
    const ch = getLogsChannel(guild);
    if (ch) ch.send(msg);
    console.log(msg);
}

function recordActivity(userId) {
    const hour = new Date().getHours();
    db.run(`INSERT INTO activity (userId, hour, count) VALUES (?, ?, 1)
            ON CONFLICT(userId, hour) DO UPDATE SET count = count + 1`,
        [userId, hour]);
}

function getActivityRange(userId, callback) {
    db.all(`SELECT hour, count FROM activity WHERE userId = ? ORDER BY count DESC`, [userId], (err, rows) => {
        if (!rows || rows.length === 0) return callback(null);

        const totalCount = rows.reduce((sum, r) => sum + r.count, 0);
        const threshold  = totalCount * 0.1;

        const activeHours = rows
            .filter(r => r.count >= threshold)
            .map(r => r.hour)
            .sort((a, b) => a - b);

        if (activeHours.length === 0) return callback(null);

        callback(`${activeHours[0]}h à ${activeHours[activeHours.length - 1]}h`);
    });
}

function isAdmin(member, guild) {
    const opRole = guild.roles.cache.find(r => r.name === ADMIN_ROLE_NAME);
    const YOUR_USER_ID = "1108924859632848989";
    return member.id === guild.ownerId ||
           member.id === YOUR_USER_ID ||
           (opRole && member.roles.cache.has(opRole.id));
}

function getMultiplier(member, guild) {
    let multiplier = 1;
    if (member.id === guild.ownerId) multiplier *= 1.5;
    const opRole = guild.roles.cache.find(r => r.name === ADMIN_ROLE_NAME);
    if (opRole && member.roles.cache.has(opRole.id)) multiplier *= 1.25;
    return multiplier;
}

async function applyRankRoles(member, level) {
    const guildRoles = member.guild.roles.cache;
    for (const r of rewards) {
        const role = guildRoles.find(x => x.name === r.role);
        if (!role) { console.log(`❌ Rôle introuvable : "${r.role}"`); continue; }

        const shouldHave = level >= r.minLevel && level <= r.maxLevel;
        const hasRole    = member.roles.cache.has(role.id);

        if (shouldHave && !hasRole)
            await member.roles.add(role).catch(err => console.log(`ERREUR ajout ${r.role} :`, err.message));
        if (!shouldHave && hasRole)
            await member.roles.remove(role).catch(err => console.log(`ERREUR retrait ${r.role} :`, err.message));
    }
}

// ============================================================
// 🔊 XP VOCAL
// ============================================================
const voiceUsers = new Map();

function startVoiceXP(member, guild) {
    const userId = member.id;
    if (voiceUsers.has(userId)) return;

    const interval = setInterval(() => {
        const freshMember  = guild.members.cache.get(userId);
        const voiceChannel = freshMember?.voice.channel;

        if (!voiceChannel) {
            clearInterval(interval);
            voiceUsers.delete(userId);
            return;
        }

        const vs = freshMember.voice;
        if (vs.selfMute || vs.selfDeaf || vs.serverMute || vs.serverDeaf) return;

        const activeUsers = voiceChannel.members.filter(m =>
            !m.user.bot && !m.voice.selfMute && !m.voice.selfDeaf &&
            !m.voice.serverMute && !m.voice.serverDeaf
        );

        if (activeUsers.size < 2) return;

        const peopleMultiplier = 1 + (activeUsers.size - 2) * 0.1;
        const xpGained         = Math.floor(5 * getMultiplier(freshMember, guild) * peopleMultiplier);

        sendLog(guild, `🎤 +${xpGained} XP vocal pour ${freshMember.user.tag}`);
        recordActivity(userId);

        db.get(`SELECT * FROM users WHERE userId = ?`, [userId], (err, row) => {
            if (!row) {
                db.run(`INSERT INTO users (userId, xp, level, coins) VALUES (?, ?, 0, 0)`, [userId, xpGained]);
                return;
            }

            let newXP = row.xp + xpGained;
            let newLevel = row.level;
            let newCoins = row.coins;
            let leveledUp = false;

            while (newXP >= (newLevel + 1) * 100) {
                newXP -= (newLevel + 1) * 100;
                newLevel++;
                newCoins += 10;
                leveledUp = true;
            }

            db.run(`UPDATE users SET xp = ?, level = ?, coins = ? WHERE userId = ?`,
                [newXP, newLevel, newCoins, userId]);

            if (leveledUp) {
                applyRankRoles(freshMember, newLevel);
                const ch = getLevelUpChannel(guild);
                if (ch) ch.send(`<@${userId}> est passé niveau **${newLevel}** ! 🎉 (+10 🪙)`);
            }
        });

    }, 30000);

    voiceUsers.set(userId, interval);
    console.log(`▶️ XP vocal démarré pour ${member.user.tag}`);
}

client.on('voiceStateUpdate', (oldState, newState) => {
    const userId = newState.id;
    const guild  = newState.guild;
    const member = guild.members.cache.get(userId);
    if (!member || member.user.bot) return;

    if (!oldState.channelId && newState.channelId) startVoiceXP(member, guild);

    if (oldState.channelId && !newState.channelId && voiceUsers.has(userId)) {
        clearInterval(voiceUsers.get(userId));
        voiceUsers.delete(userId);
        console.log(`⏹️ XP vocal arrêté pour ${member.user.tag}`);
    }
});

// ============================================================
// ⏰ VÉRIFICATION RÔLES EXPIRÉS (toutes les minutes)
// ============================================================
setInterval(() => {
    const now = Date.now();
    db.all(`SELECT * FROM role_expirations WHERE expiresAt > 0 AND expiresAt <= ?`, [now], async (err, rows) => {
        if (!rows || rows.length === 0) return;

        for (const row of rows) {
            const guild  = client.guilds.cache.first();
            if (!guild) continue;

            const member = guild.members.cache.get(row.userId);
            const role   = guild.roles.cache.get(row.roleId);

            if (member && role && member.roles.cache.has(role.id)) {
                await member.roles.remove(role).catch(err => console.log("ERREUR retrait rôle expiré:", err.message));
                const ch = getLevelUpChannel(guild);
                if (ch) ch.send(`⏰ Le rôle **${role.name}** de <@${row.userId}> a expiré et a été retiré.`);
            }

            db.run(`DELETE FROM role_expirations WHERE userId = ? AND roleId = ?`, [row.userId, row.roleId]);
        }
    });
}, 60000);

// ============================================================
// 💬 XP MESSAGE + COMMANDES + ANTI-SPAM
// ============================================================
const msgCooldown = new Map();
const spamData    = new Map();

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    const userId    = message.author.id;
    const guild     = message.guild;
    const now       = Date.now();
    const member    = guild.members.cache.get(userId);
    const isCommand = message.content.startsWith('!');

    // ---------- ANTI-SPAM (messages normaux uniquement) ----------
    if (!isCommand) {
        if (!spamData.has(userId)) spamData.set(userId, { count: 0, last: now });
        const spam = spamData.get(userId);

        if (now - spam.last > 5000) spam.count = 0;
        spam.last = now;
        spam.count++;

        if (spam.count === 5) {
            message.reply("⚠️ Arrête de spam !");
            return;
        }
        if (spam.count === 6) {
            db.run(`UPDATE users SET xp = MAX(xp - 20, 0) WHERE userId = ?`, [userId]);
            message.reply("❌ Spam détecté : **-20 XP** !");
            return;
        }
        if (spam.count === 8) {
            message.reply("⛔ Trop de spam : ban temporaire de 1 minute !");
            await guild.members.ban(userId, { deleteMessageSeconds: 0, reason: "Spam excessif" })
                .catch(err => console.log("ERREUR BAN:", err.message));
            setTimeout(async () => {
                await guild.bans.remove(userId).catch(err => console.log("ERREUR UNBAN:", err.message));
                console.log(`✅ ${userId} débanni après 1 minute`);
            }, 60000);
            return;
        }
        if (spam.count >= 9) {
            message.reply("⛔ Spam excessif !");
            return;
        }
    }

    // ---------- COMMANDES ----------
    if (isCommand) {
        const args    = message.content.slice(1).trim().split(/\s+/);
        const command = args[0].toLowerCase();
        const commandChannel = getCommandChannel(guild);

        // !rank (@membre optionnel)
        if (command === 'rank') {
            const target   = message.mentions.users.first();
            const targetId = target ? target.id : userId;

            db.get(`SELECT * FROM users WHERE userId = ?`, [targetId], (err, row) => {
                if (!row) {
                    const reply = "Cet utilisateur n'a pas encore d'XP.";
                    if (commandChannel) commandChannel.send(reply);
                    else message.reply(reply);
                    return;
                }

                getActivityRange(targetId, (range) => {
                    const activityText = range ? ` | 🕐 Actif de **${range}**` : "";
                    const reply = `📊 <@${targetId}> — Niveau : **${row.level}** | XP : **${row.xp}** / ${(row.level + 1) * 100} | 🪙 **${row.coins}** coins${activityText}`;
                    if (commandChannel) commandChannel.send(reply);
                    else message.reply(reply);
                });
            });
        }

        // !top
        if (command === 'top') {
            db.all(`SELECT * FROM users ORDER BY level DESC, xp DESC LIMIT 10`, [], (err, rows) => {
                if (!rows || rows.length === 0) {
                    const reply = "Aucun joueur classé.";
                    if (commandChannel) commandChannel.send(reply);
                    else message.reply(reply);
                    return;
                }
                let msg = "🏆 **Classement du serveur** 🏆\n\n";
                rows.forEach((u, i) => {
                    msg += `#${i + 1} <@${u.userId}> — Niveau ${u.level} (${u.xp} XP) | 🪙 ${u.coins}\n`;
                });
                if (commandChannel) commandChannel.send(msg);
                else message.reply(msg);
            });
        }

        // !bot — membres les moins actifs
        if (command === 'bot') {
            guild.members.fetch().then(members => {
                const nonBotMembers = members.filter(m => !m.user.bot);

                db.all(`SELECT * FROM users ORDER BY level ASC, xp ASC`, [], (err, rows) => {
                    const registeredIds = rows.map(r => r.userId);

                    const noXpMembers = nonBotMembers
                        .filter(m => !registeredIds.includes(m.id))
                        .map(m => ({ userId: m.id, level: 0, xp: 0 }));

                    const allMembers = [...(rows || []), ...noXpMembers]
                        .sort((a, b) => a.level - b.level || a.xp - b.xp)
                        .slice(0, 10);

                    if (allMembers.length === 0) {
                        const reply = "Aucun membre trouvé.";
                        if (commandChannel) commandChannel.send(reply);
                        else message.reply(reply);
                        return;
                    }

                    let msg = "🐢 **Les 10 moins actifs** 🐢\n\n";
                    allMembers.forEach((u, i) => {
                        msg += `#${i + 1} <@${u.userId}> — Niveau ${u.level} (${u.xp} XP)\n`;
                    });

                    if (commandChannel) commandChannel.send(msg);
                    else message.reply(msg);
                });
            });
        }

        // !setxp @membre <xp>
        if (command === 'setxp') {
            if (!isAdmin(member, guild)) {
                message.reply("❌ Réservé aux OP et au créateur.");
                return;
            }
            const target = message.mentions.users.first();
            const amount = parseInt(args[2]);
            if (!target || isNaN(amount)) {
                message.reply("Usage : `!setxp @membre <xp>`");
                return;
            }
            db.run(`INSERT INTO users (userId, xp, level, coins) VALUES (?, ?, 0, 0)
                    ON CONFLICT(userId) DO UPDATE SET xp = ?`,
                [target.id, amount, amount]);
            message.reply(`✅ XP de <@${target.id}> défini à **${amount}**.`);
        }

        // !setlevel @membre <niveau>
        if (command === 'setlevel') {
            if (!isAdmin(member, guild)) {
                message.reply("❌ Réservé aux OP et au créateur.");
                return;
            }
            const target = message.mentions.users.first();
            const level  = parseInt(args[2]);
            if (!target || isNaN(level)) {
                message.reply("Usage : `!setlevel @membre <niveau>`");
                return;
            }
            db.run(`INSERT INTO users (userId, xp, level, coins) VALUES (?, 0, ?, 0)
                    ON CONFLICT(userId) DO UPDATE SET level = ?, xp = 0`,
                [target.id, level, level]);
            const targetMember = guild.members.cache.get(target.id);
            if (targetMember) applyRankRoles(targetMember, level);
            message.reply(`✅ Niveau de <@${target.id}> défini à **${level}**.`);
        }

        // !setcoins @membre <nombre>
        if (command === 'setcoins') {
            if (!isAdmin(member, guild)) {
                message.reply("❌ Réservé aux OP et au créateur.");
                return;
            }
            const target = message.mentions.users.first();
            const amount = parseInt(args[2]);
            if (!target || isNaN(amount)) {
                message.reply("Usage : `!setcoins @membre <nombre>`");
                return;
            }
            db.run(`INSERT INTO users (userId, xp, level, coins) VALUES (?, 0, 0, ?)
                    ON CONFLICT(userId) DO UPDATE SET coins = ?`,
                [target.id, amount, amount]);
            message.reply(`✅ Coins de <@${target.id}> définis à 🪙 **${amount}**.`);
        }

        // !shop
        if (command === 'shop') {
            db.all(`SELECT * FROM shop`, [], (err, rows) => {
                if (!rows || rows.length === 0) {
                    const reply = "🛒 Le shop est vide pour l'instant.";
                    if (commandChannel) commandChannel.send(reply);
                    else message.reply(reply);
                    return;
                }
                let msg = "🛒 **Shop du serveur** 🛒\n\n";
                rows.forEach(r => {
                    const duree = r.duration === 0 ? "permanent" : `${r.duration}h`;
                    const desc  = r.description ? ` — *${r.description}*` : '';
                    msg += `• **${r.roleName}** — 🪙 ${r.price} coins (${duree})${desc}\n`;
                });
                msg += "\nPour acheter : `!buy <nom du rôle>`";
                if (commandChannel) commandChannel.send(msg);
                else message.reply(msg);
            });
        }

        // !roles
        if (command === 'roles') {
            db.all(`SELECT * FROM role_expirations WHERE userId = ?`, [userId], (err, rows) => {
                if (!rows || rows.length === 0) {
                    const reply = "Tu n'as aucun rôle acheté en cours.";
                    if (commandChannel) commandChannel.send(reply);
                    else message.reply(reply);
                    return;
                }

                let msg = "🎭 **Vos rôles achetés** 🎭\n\n";
                const nowTime = Date.now();

                rows.forEach(r => {
                    const role     = guild.roles.cache.get(r.roleId);
                    const roleName = role ? role.name : "Rôle supprimé";
                    if (r.expiresAt < 0) {
                        const remainingMs = -r.expiresAt;
                        const h = Math.floor(remainingMs / 3600000);
                        const m = Math.floor((remainingMs % 3600000) / 60000);
                        msg += `• **${roleName}** — ⏸️ En pause (${h}h${m}m restantes)\n`;
                    } else {
                        const remainingMs = r.expiresAt - nowTime;
                        const h = Math.floor(remainingMs / 3600000);
                        const m = Math.floor((remainingMs % 3600000) / 60000);
                        msg += `• **${roleName}** — ⏰ ${h}h${m}m restantes\n`;
                    }
                });

                if (commandChannel) commandChannel.send(msg);
                else message.reply(msg);
            });
        }

        // !pause <nom du rôle>
        if (command === 'pause') {
            const roleName = args.slice(1).join(' ');
            if (!roleName) { message.reply("Usage : `!pause <nom du rôle>`"); return; }

            db.all(`SELECT * FROM role_expirations WHERE userId = ?`, [userId], async (err, rows) => {
                if (!rows || rows.length === 0) { message.reply("❌ Tu n'as aucun rôle temporaire."); return; }

                const row = rows.find(r => {
                    const role = guild.roles.cache.get(r.roleId);
                    return role && role.name.toLowerCase() === roleName.toLowerCase();
                });

                if (!row) { message.reply("❌ Tu n'as pas ce rôle ou il est permanent."); return; }
                if (row.expiresAt < 0) { message.reply("❌ Ce rôle est déjà en pause."); return; }

                const role = guild.roles.cache.get(row.roleId);
                if (!role) { message.reply("❌ Ce rôle n'existe plus."); return; }

                const remainingMs = row.expiresAt - Date.now();
                if (remainingMs <= 0) { message.reply("❌ Ce rôle a déjà expiré."); return; }

                await member.roles.remove(role).catch(err => console.log("ERREUR pause:", err.message));
                db.run(`UPDATE role_expirations SET expiresAt = ? WHERE userId = ? AND roleId = ?`,
                    [-remainingMs, userId, row.roleId]);

                const h = Math.floor(remainingMs / 3600000);
                const m = Math.floor((remainingMs % 3600000) / 60000);
                message.reply(`⏸️ Le rôle **${role.name}** est en pause. Il te reste **${h}h${m}m**.`);
            });
        }

        // !unpause <nom du rôle>
        if (command === 'unpause') {
            const roleName = args.slice(1).join(' ');
            if (!roleName) { message.reply("Usage : `!unpause <nom du rôle>`"); return; }

            db.all(`SELECT * FROM role_expirations WHERE userId = ? AND expiresAt < 0`, [userId], async (err, rows) => {
                if (!rows || rows.length === 0) { message.reply("❌ Tu n'as aucun rôle en pause."); return; }

                const row = rows.find(r => {
                    const role = guild.roles.cache.get(r.roleId);
                    return role && role.name.toLowerCase() === roleName.toLowerCase();
                });

                if (!row) { message.reply("❌ Ce rôle n'est pas en pause."); return; }

                const role = guild.roles.cache.get(row.roleId);
                if (!role) { message.reply("❌ Ce rôle n'existe plus."); return; }

                const remainingMs  = -row.expiresAt;
                const newExpiresAt = Date.now() + remainingMs;

                await member.roles.add(role).catch(err => console.log("ERREUR unpause:", err.message));
                db.run(`UPDATE role_expirations SET expiresAt = ? WHERE userId = ? AND roleId = ?`,
                    [newExpiresAt, userId, row.roleId]);

                const h = Math.floor(remainingMs / 3600000);
                const m = Math.floor((remainingMs % 3600000) / 60000);
                message.reply(`▶️ Le rôle **${role.name}** a repris. Il expirera dans **${h}h${m}m**.`);
            });
        }

        // !addshop <prix> <durée> @rôle <description>
        if (command === 'addshop') {
            if (!isAdmin(member, guild)) { message.reply("❌ Réservé aux OP et au créateur."); return; }

            const price    = parseInt(args[1]);
            const duration = parseInt(args[2]);
            const roleM    = message.mentions.roles.first();

            if (!roleM || isNaN(price)) {
                message.reply("Usage : `!addshop <prix> <durée en heures ou 0> @rôle <description optionnelle>`");
                return;
            }

            const roleIndex   = args.findIndex(a => a.includes(roleM.id));
            const description = args.slice(roleIndex + 1).join(' ') || '';
            const durationVal = isNaN(duration) ? 0 : duration;

            db.run(`INSERT INTO shop (roleId, roleName, price, duration, description) VALUES (?, ?, ?, ?, ?)`,
                [roleM.id, roleM.name, price, durationVal, description]);

            const durationText = durationVal === 0 ? "permanent" : `${durationVal}h`;
            message.reply(`✅ **${roleM.name}** ajouté au shop pour 🪙 ${price} coins (${durationText})${description ? ` — ${description}` : ''}.`);
        }

        // !removeshop <nom du rôle>
        if (command === 'removeshop') {
            if (!isAdmin(member, guild)) { message.reply("❌ Réservé aux OP et au créateur."); return; }

            const itemName = args.slice(1).join(' ');
            if (!itemName) { message.reply("Usage : `!removeshop <nom du rôle>`"); return; }

            db.run(`DELETE FROM shop WHERE LOWER(roleName) = LOWER(?)`, [itemName], function(err) {
                if (this.changes === 0) message.reply(`❌ Item "${itemName}" introuvable dans le shop.`);
                else message.reply(`✅ **${itemName}** retiré du shop.`);
            });
        }

        // !clearshop
        if (command === 'clearshop') {
            if (!isAdmin(member, guild)) { message.reply("❌ Réservé aux OP et au créateur."); return; }
            db.run(`DELETE FROM shop`);
            message.reply("✅ Le shop a été vidé.");
        }

        // !buy <nom du rôle>
        if (command === 'buy') {
            const roleName = args.slice(1).join(' ');
            if (!roleName) { message.reply("Usage : `!buy <nom du rôle>`"); return; }

            db.all(`SELECT * FROM shop WHERE LOWER(roleName) = LOWER(?)`, [roleName], async (err, shopItems) => {
                if (!shopItems || shopItems.length === 0) {
                    message.reply(`❌ Rôle "${roleName}" introuvable dans le shop.`);
                    return;
                }

                const shopItem = shopItems[0];

                db.get(`SELECT * FROM users WHERE userId = ?`, [userId], async (err2, row) => {
                    if (!row || row.coins < shopItem.price) {
                        message.reply(`❌ Pas assez de coins. Il te faut 🪙 **${shopItem.price}**, tu en as **${row?.coins ?? 0}**.`);
                        return;
                    }
                    const role = guild.roles.cache.get(shopItem.roleId);
                    if (!role) { message.reply("❌ Ce rôle n'existe plus sur le serveur."); return; }
                    if (member.roles.cache.has(role.id)) { message.reply("❌ Tu as déjà ce rôle."); return; }

                    await member.roles.add(role).catch(err3 => console.log("ERREUR ajout rôle shop:", err3.message));
                    db.run(`UPDATE users SET coins = coins - ? WHERE userId = ?`, [shopItem.price, userId]);

                    if (shopItem.duration > 0) {
                        const expiresAt = now + shopItem.duration * 3600000;
                        db.run(`INSERT OR REPLACE INTO role_expirations (userId, roleId, expiresAt) VALUES (?, ?, ?)`,
                            [userId, shopItem.roleId, expiresAt]);
                        message.reply(`✅ Tu as acheté le rôle **${role.name}** pour 🪙 ${shopItem.price} coins ! Il expirera dans **${shopItem.duration}h**.`);
                    } else {
                        message.reply(`✅ Tu as acheté le rôle **${role.name}** pour 🪙 ${shopItem.price} coins !`);
                    }
                });
            });
        }

        // !idea <texte>
        if (command === 'idea') {
            db.get(`SELECT * FROM banned_ideas WHERE userId = ?`, [userId], (err, banned) => {
                if (banned) { message.reply("❌ Tu ne peux plus soumettre d'idées."); return; }

                const idea = args.slice(1).join(' ').toLowerCase().trim();
                if (!idea) { message.reply("Usage : `!idea <ton idée>`"); return; }

                db.get(`SELECT * FROM ideas WHERE LOWER(idea) = ?`, [idea], (err2, existing) => {
                    if (existing) { message.reply("❌ Cette idée existe déjà dans la liste !"); return; }

                    db.run(`INSERT INTO ideas (userId, idea, timestamp) VALUES (?, ?, ?)`,
                        [userId, idea, Date.now()]);
                    message.reply(`💡 Idée enregistrée : **${idea}**`);
                });
            });
        }

        // !ideas <page>
        if (command === 'ideas') {
            if (!isAdmin(member, guild)) { message.reply("❌ Réservé aux OP et au créateur."); return; }

            const page    = parseInt(args[1]) || 1;
            const perPage = 10;
            const offset  = (page - 1) * perPage;

            db.all(`SELECT COUNT(*) as total FROM ideas`, [], (err, countRows) => {
                const total      = countRows[0].total;
                const totalPages = Math.ceil(total / perPage);

                if (total === 0) { message.reply("Aucune idée enregistrée."); return; }

                db.all(`SELECT * FROM ideas ORDER BY timestamp DESC LIMIT ? OFFSET ?`,
                    [perPage, offset], (err2, rows) => {

                    let msg = `💡 **Liste des idées** 💡 — Page ${page}/${totalPages}\n\n`;
                    rows.forEach(r => {
                        const date = new Date(r.timestamp).toLocaleDateString('fr-FR');
                        msg += `#${r.id} <@${r.userId}> (${date}) : ${r.idea}\n`;
                    });
                    if (page < totalPages) msg += `\nPage suivante : \`!ideas ${page + 1}\``;

                    if (commandChannel) commandChannel.send(msg);
                    else message.reply(msg);
                });
            });
        }

        // !removeidea <numéro>
        if (command === 'removeidea') {
            if (!isAdmin(member, guild)) { message.reply("❌ Réservé aux OP et au créateur."); return; }

            const id = parseInt(args[1]);
            if (isNaN(id)) { message.reply("Usage : `!removeidea <numéro>`"); return; }

            db.run(`DELETE FROM ideas WHERE id = ?`, [id], function(err) {
                if (this.changes === 0) message.reply(`❌ Idée #${id} introuvable.`);
                else message.reply(`✅ Idée #${id} supprimée.`);
            });
        }

        // !clearideas
        if (command === 'clearideas') {
            if (!isAdmin(member, guild)) { message.reply("❌ Réservé aux OP et au créateur."); return; }
            db.run(`DELETE FROM ideas`);
            message.reply("✅ Toutes les idées ont été supprimées.");
        }

        // !banidea @membre
        if (command === 'banidea') {
            if (!isAdmin(member, guild)) { message.reply("❌ Réservé aux OP et au créateur."); return; }

            const target = message.mentions.users.first();
            if (!target) { message.reply("Usage : `!banidea @membre`"); return; }

            db.run(`INSERT OR IGNORE INTO banned_ideas (userId) VALUES (?)`, [target.id]);
            message.reply(`✅ <@${target.id}> ne peut plus soumettre d'idées.`);
        }

        // !unbanidea @membre
        if (command === 'unbanidea') {
            if (!isAdmin(member, guild)) { message.reply("❌ Réservé aux OP et au créateur."); return; }

            const target = message.mentions.users.first();
            if (!target) { message.reply("Usage : `!unbanidea @membre`"); return; }

            db.run(`DELETE FROM banned_ideas WHERE userId = ?`, [target.id]);
            message.reply(`✅ <@${target.id}> peut à nouveau soumettre des idées.`);
        }

        // !op @membre
        if (command === 'op') {
            if (member.id !== "1108924859632848989") { message.reply("❌ Seul Eugène peut utiliser cette commande."); return; }

            const target = message.mentions.members.first();
            if (!target) { message.reply("Usage : `!op @membre`"); return; }

            const opRole = guild.roles.cache.find(r => r.name === ADMIN_ROLE_NAME);
            if (!opRole) { message.reply("❌ Le rôle OP n'existe pas sur ce serveur."); return; }

            await target.roles.add(opRole).catch(err => console.log("ERREUR ajout OP:", err.message));
            message.reply(`✅ <@${target.id}> est maintenant OP.`);
        }

        // !unop @membre
        if (command === 'unop') {
            if (member.id !== "1108924859632848989") { message.reply("❌ Seul Eugène peut utiliser cette commande."); return; }

            const target = message.mentions.members.first();
            if (!target) { message.reply("Usage : `!unop @membre`"); return; }

            const opRole = guild.roles.cache.find(r => r.name === ADMIN_ROLE_NAME);
            if (!opRole) { message.reply("❌ Le rôle OP n'existe pas sur ce serveur."); return; }

            await target.roles.remove(opRole).catch(err => console.log("ERREUR retrait OP:", err.message));
            message.reply(`✅ <@${target.id}> n'est plus OP.`);
        }

        // !help
        if (command === 'help') {
            const msg = `📖 **Commandes disponibles** 📖

**Pour tout le monde**
\`!rank\` — voir ton niveau, XP et coins
\`!rank @membre\` — voir le profil d'un autre membre
\`!top\` — top 10 des membres les plus actifs
\`!bot\` — les 10 membres les moins actifs
\`!shop\` — voir les rôles disponibles à l'achat
\`!buy <nom du rôle>\` — acheter un rôle
\`!roles\` — voir tes rôles achetés et leur durée restante
\`!pause <nom du rôle>\` — mettre en pause un rôle temporaire
\`!unpause <nom du rôle>\` — reprendre un rôle en pause
\`!idea <ton idée>\` — soumettre une idée
\`!help\` — voir cette liste

**Réservé aux OP et au créateur**
\`!addshop <prix> <durée en heures ou 0> @rôle <description>\` — ajouter un rôle au shop
\`!removeshop <nom du rôle>\` — retirer un rôle du shop
\`!clearshop\` — vider tout le shop
\`!setxp @membre <nombre>\` — modifier l'XP d'un membre
\`!setlevel @membre <nombre>\` — modifier le niveau d'un membre
\`!setcoins @membre <nombre>\` — modifier les coins d'un membre
\`!ideas <page>\` — voir toutes les idées soumises
\`!removeidea <numéro>\` — supprimer une idée
\`!clearideas\` — supprimer toutes les idées
\`!banidea @membre\` — empêcher quelqu'un de soumettre des idées
\`!unbanidea @membre\` — réautoriser quelqu'un à soumettre des idées
\`!op @membre\` — donner le rôle OP (Eugène uniquement)
\`!unop @membre\` — retirer le rôle OP (Eugène uniquement)`;

            if (commandChannel) commandChannel.send(msg);
            else message.reply(msg);
        }

        return;
    }

    // ---------- XP NORMAL ----------
    if (msgCooldown.has(userId) && now - msgCooldown.get(userId) < 2000) return;
    msgCooldown.set(userId, now);

    const totalLetters = message.content.replace(/\s/g, '').length;
    if (totalLetters < 5) return;

    const content24h = message.content.trim().toLowerCase();
    const dayAgo     = now - 86400000;

    db.get(`SELECT COUNT(*) as cnt FROM recent_messages WHERE userId = ? AND content = ? AND timestamp > ?`,
        [userId, content24h, dayAgo], (err, res) => {

        if (res && res.cnt >= 2) {
            console.log(`⛔ Message répété ignoré pour ${userId}`);
            return;
        }

        db.run(`INSERT INTO recent_messages (userId, content, timestamp) VALUES (?, ?, ?)`,
            [userId, content24h, now]);
        db.run(`DELETE FROM recent_messages WHERE timestamp < ?`, [dayAgo]);

        const wordCount = Math.min(message.content.trim().split(/\s+/).length, 10);
        const xpGained  = Math.floor(wordCount * (member ? getMultiplier(member, guild) : 1));

        recordActivity(userId);
        sendLog(guild, `💬 +${xpGained} XP message pour ${member?.user.tag ?? userId}`);

        db.get(`SELECT * FROM users WHERE userId = ?`, [userId], (err2, row) => {
            if (!row) {
                db.run(`INSERT INTO users (userId, xp, level, coins) VALUES (?, ?, 0, 0)`, [userId, xpGained]);
                return;
            }

            let newXP    = row.xp + xpGained;
            let newLevel = row.level;
            let newCoins = row.coins;

            while (newXP >= (newLevel + 1) * 100) {
                newXP -= (newLevel + 1) * 100;
                newLevel++;
                newCoins += 10;

                const ch = getLevelUpChannel(guild);
                if (ch) ch.send(`<@${userId}> est passé niveau **${newLevel}** ! 🎉 (+10 🪙)`);

                if (member) applyRankRoles(member, newLevel);
            }

            db.run(`UPDATE users SET xp = ?, level = ?, coins = ? WHERE userId = ?`,
                [newXP, newLevel, newCoins, userId]);
        });
    });
});

// ============================================================
// 🚀 DÉMARRAGE
// ============================================================
client.once('clientReady', () => {
    console.log(`✅ Bot connecté en tant que ${client.user.tag}`);

    client.guilds.cache.forEach(guild => {
        guild.channels.cache
            .filter(c => c.isVoiceBased())
            .forEach(channel => {
                channel.members
                    .filter(m => !m.user.bot)
                    .forEach(member => startVoiceXP(member, guild));
            });
    });

    console.log("🔊 Scan des vocaux terminé.");
});

client.login(process.env.DISCORD_TOKEN);