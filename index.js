require('dotenv').config();

const { Client, GatewayIntentBits } = require('discord.js');
const sqlite3 = require('sqlite3').verbose();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

const db = new sqlite3.Database('./levels.db');

db.run(`CREATE TABLE IF NOT EXISTS users (
    userId TEXT PRIMARY KEY,
    xp INTEGER DEFAULT 0,
    level INTEGER DEFAULT 0
)`);

// ============================================================
// 🎁 RECOMPENSES — roles attribués selon le niveau
// ============================================================
const rewards = [
    { minLevel: 1,  maxLevel: 2,  role: "Nouveau" },
    { minLevel: 3,  maxLevel: 4,  role: "Actif"   },
    { minLevel: 5,  maxLevel: 9,  role: "Cool"    },
    { minLevel: 10, maxLevel: Infinity, role: "OG" }
];

// Donne le bon rôle selon le niveau, retire les autres
async function applyRankRoles(member, level) {
    const guildRoles = member.guild.roles.cache;

    for (const r of rewards) {
        const role = guildRoles.find(x => x.name === r.role);
        if (!role) {
            console.log(`❌ Rôle introuvable sur le serveur : "${r.role}"`);
            continue;
        }

        const shouldHave = level >= r.minLevel && level <= r.maxLevel;
        const hasRole    = member.roles.cache.has(role.id);

        if (shouldHave && !hasRole) {
            await member.roles.add(role).catch(err =>
                console.log(`ERREUR ajout rôle ${r.role} :`, err.message)
            );
            console.log(`✅ Rôle "${r.role}" donné à ${member.user.tag}`);
        }

        if (!shouldHave && hasRole) {
            await member.roles.remove(role).catch(err =>
                console.log(`ERREUR retrait rôle ${r.role} :`, err.message)
            );
            console.log(`🗑️ Rôle "${r.role}" retiré à ${member.user.tag}`);
        }
    }
}

// ============================================================
// 🔢 Calcul de l'XP selon les multiplicateurs
// ============================================================
function getMultiplier(member, guild) {
    let multiplier = 1;

    if (member.id === guild.ownerId) multiplier *= 1.5;

    const opRole = guild.roles.cache.find(r => r.name === "OP");
    if (opRole && member.roles.cache.has(opRole.id)) multiplier *= 1.25;

    return multiplier;
}

// ============================================================
// 🔊 XP VOCAL — intervalle toutes les 30 secondes
// ============================================================
const voiceUsers = new Map(); // userId -> intervalId

client.on('voiceStateUpdate', (oldState, newState) => {
    const userId  = newState.id;
    const guild   = newState.guild;
    const member  = guild.members.cache.get(userId);
    if (!member || member.user.bot) return;

    const joinedVoice = !oldState.channelId && newState.channelId;
    const leftVoice   = oldState.channelId  && !newState.channelId;
    const changedState = oldState.channelId === newState.channelId; // mute/sourdine

    // Démarrer l'intervalle quand on rejoint un vocal
    if (joinedVoice) {
        if (voiceUsers.has(userId)) return; // déjà enregistré

        const interval = setInterval(() => {
            const freshMember  = guild.members.cache.get(userId);
            const voiceChannel = freshMember?.voice.channel;

            if (!voiceChannel) {
                clearInterval(interval);
                voiceUsers.delete(userId);
                return;
            }

            // Vérif : membre muet ou en sourdine → pas d'XP
            const voiceState = freshMember.voice;
            if (voiceState.selfMute || voiceState.selfDeaf || voiceState.serverMute || voiceState.serverDeaf) {
                console.log(`🔇 ${freshMember.user.tag} est mute/sourdine → pas d'XP`);
                return;
            }

            // Vérif : au moins 2 humains non-muet dans le canal
            const activeUsers = voiceChannel.members.filter(m =>
                !m.user.bot &&
                !m.voice.selfMute &&
                !m.voice.selfDeaf &&
                !m.voice.serverMute &&
                !m.voice.serverDeaf
            );

            if (activeUsers.size < 2) {
                console.log(`👥 Moins de 2 humains actifs dans ${voiceChannel.name} → pas d'XP`);
                return;
            }

            // Multiplicateur selon le nombre de personnes dans le vocal
	    const peopleCount = activeUsers.size;
	    const peopleMultiplier = peopleCount >= 2 ? 1 + (peopleCount - 2) * 0.1 : 0;
	    const xpGained = Math.floor(5 * getMultiplier(freshMember, guild) * peopleMultiplier);

            console.log(`🎤 XP vocal : +${xpGained} pour ${freshMember.user.tag}`);

            db.get(`SELECT * FROM users WHERE userId = ?`, [userId], (err, row) => {
                if (!row) {
                    db.run(`INSERT INTO users (userId, xp, level) VALUES (?, ?, ?)`,
                        [userId, xpGained, 0]);
                    return;
                }

                let newXP    = row.xp + xpGained;
                let newLevel = row.level;

                while (newXP >= (newLevel + 1) * 100) {
                    newXP -= (newLevel + 1) * 100;
                    newLevel++;

                    console.log(`🏆 LEVEL UP ${freshMember.user.tag} → niveau ${newLevel}`);
                    applyRankRoles(freshMember, newLevel);

                    guild.systemChannel?.send(
                        `<@${userId}> est passé niveau **${newLevel}** 🎉`
                    );
                }

                db.run(`UPDATE users SET xp = ?, level = ? WHERE userId = ?`,
                    [newXP, newLevel, userId]);
            });

        }, 30000); // toutes les 30 secondes

        voiceUsers.set(userId, interval);
        console.log(`▶️ Intervalle XP démarré pour ${member.user.tag}`);
    }

    // Arrêter l'intervalle quand on quitte le vocal
    if (leftVoice) {
        if (voiceUsers.has(userId)) {
            clearInterval(voiceUsers.get(userId));
            voiceUsers.delete(userId);
            console.log(`⏹️ Intervalle XP arrêté pour ${member.user.tag}`);
        }
    }
});

// ============================================================
// 💬 XP MESSAGE + COMMANDES + ANTI-SPAM
// ============================================================
const msgCooldown = new Map(); // userId -> timestamp dernier message
const spamData    = new Map(); // userId -> { count, last }

client.on('messageCreate', (message) => {
    if (message.author.bot) return;

    const userId = message.author.id;
    const now    = Date.now();
    const isCommand = message.content.startsWith('!');

    // ---------- ANTI-SPAM ----------
    if (!spamData.has(userId)) spamData.set(userId, { count: 0, last: now });
    const spam = spamData.get(userId);

    if (now - spam.last > 5000) spam.count = 0; // reset après 5 sec sans message
    spam.last = now;
    spam.count++;

    if (spam.count === 2) {
        message.reply("⚠️ Arrête de spam !");
        return;
    }
    if (spam.count === 3) {
        db.run(`UPDATE users SET xp = MAX(xp - 20, 0) WHERE userId = ?`, [userId]);
        message.reply("❌ Spam détecté : **-20 XP** !");
        return;
    }
    if (spam.count >= 4) {
        message.reply("⛔ Spam excessif, tu es ignoré.");
        return;
    }

    // ---------- COMMANDES ----------
    if (isCommand) {
        if (message.content === '!rank') {
            db.get(`SELECT * FROM users WHERE userId = ?`, [userId], (err, row) => {
                if (!row) return message.reply("Tu n'as pas encore d'XP.");
                message.reply(`📊 Niveau : **${row.level}** | XP : **${row.xp}** / ${(row.level + 1) * 100}`);
            });
        }

        if (message.content === '!top') {
            db.all(`SELECT * FROM users ORDER BY level DESC, xp DESC LIMIT 10`, [], (err, rows) => {
                if (!rows || rows.length === 0) return message.reply("Aucun joueur classé.");

                let msg = "🏆 **Classement du serveur** 🏆\n\n";
                rows.forEach((u, i) => {
                    msg += `#${i + 1} <@${u.userId}> — Niveau ${u.level} (${u.xp} XP)\n`;
                });
                message.reply(msg);
            });
        }

        return; // les commandes ne donnent pas d'XP
    }

    // ---------- XP NORMAL ----------
    // Cooldown 2 secondes entre deux messages qui donnent de l'XP
    if (msgCooldown.has(userId) && now - msgCooldown.get(userId) < 2000) return;
    msgCooldown.set(userId, now);

    const member     = message.guild.members.cache.get(userId);
    const totalLetters = message.content.replace(/\s/g, '').length;
    if (totalLetters < 5) return;

    const wordCount = message.content.trim().split(/\s+/).length;
    const xpGained = Math.floor(wordCount * (member ? getMultiplier(member, message.guild) : 1));

    db.get(`SELECT * FROM users WHERE userId = ?`, [userId], (err, row) => {
        if (!row) {
            db.run(`INSERT INTO users (userId, xp, level) VALUES (?, ?, ?)`,
                [userId, xpGained, 0]);
            return;
        }

        let newXP    = row.xp + xpGained;
        let newLevel = row.level;

        while (newXP >= (newLevel + 1) * 100) {
            newXP -= (newLevel + 1) * 100;
            newLevel++;

            message.channel.send(`<@${userId}> est passé niveau **${newLevel}** 🎉`);
            if (member) applyRankRoles(member, newLevel);
        }

        db.run(`UPDATE users SET xp = ?, level = ? WHERE userId = ?`,
            [newXP, newLevel, userId]);
    });
});

// ============================================================
// 🚀 DÉMARRAGE
// ============================================================
client.once('clientReady', () => {
    console.log(`✅ Bot connecté en tant que ${client.user.tag}`);
});

client.login(process.env.DISCORD_TOKEN);