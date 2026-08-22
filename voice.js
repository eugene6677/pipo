// ============================================================
// 🔊 XP VOCAL
// ============================================================

const db = require('./db');
const { sendLog, getLevelUpChannel, recordActivity, getMultiplier, applyRankRoles } = require('./utils');

const voiceUsers = new Map();

function startVoiceXP(member, guild) {
    const userId  = member.id;
    const guildId = guild.id;
    if (voiceUsers.has(`${guildId}-${userId}`)) return;

    const interval = setInterval(() => {
        const freshMember  = guild.members.cache.get(userId);
        const voiceChannel = freshMember?.voice.channel;

        if (!voiceChannel) {
            clearInterval(interval);
            voiceUsers.delete(`${guildId}-${userId}`);
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
        recordActivity(userId, guildId);

        db.get(`SELECT * FROM users WHERE userId = ? AND guildId = ?`, [userId, guildId], (err, row) => {
            if (!row) {
                db.run(`INSERT INTO users (userId, guildId, xp, level, coins) VALUES (?, ?, ?, 0, 0)`,
                    [userId, guildId, xpGained]);
                return;
            }

            let newXP    = row.xp + xpGained;
            let newLevel = row.level;
            let newCoins = row.coins;
            let leveledUp = false;

            while (newXP >= (newLevel + 1) * 100) {
                newXP -= (newLevel + 1) * 100;
                newLevel++;
                newCoins += 1;
                leveledUp = true;
            }

            db.run(`UPDATE users SET xp = ?, level = ?, coins = ? WHERE userId = ? AND guildId = ?`,
                [newXP, newLevel, newCoins, userId, guildId]);

            if (leveledUp) {
                applyRankRoles(freshMember, newLevel);
                const ch = getLevelUpChannel(guild);
                if (ch) ch.send(`<@${userId}> est passé niveau **${newLevel}** ! 🎉 (+1 🪙)`);
            }
        });

    }, 30000);

    voiceUsers.set(`${guildId}-${userId}`, interval);
    sendLog(guild, `▶️ XP vocal démarré pour ${member.user.tag}`);
}

function stopVoiceXP(member, guild) {
    const key = `${guild.id}-${member.id}`;
    if (voiceUsers.has(key)) {
        clearInterval(voiceUsers.get(key));
        voiceUsers.delete(key);
        sendLog(guild, `⏹️ XP vocal arrêté pour ${member.user.tag}`);
    }
}

const streamUsers = new Map();

function startStreamXP(member, guild) {
    const userId  = member.id;
    const guildId = guild.id;
    if (streamUsers.has(`${guildId}-${userId}`)) return;

    const interval = setInterval(() => {
        const freshMember  = guild.members.cache.get(userId);
        const voiceChannel = freshMember?.voice.channel;

        if (!voiceChannel || !freshMember.voice.streaming) {
            clearInterval(interval);
            streamUsers.delete(`${guildId}-${userId}`);
            return;
        }

        // Compte les observateurs (membres dans le canal qui regardent le stream)
        const viewers = voiceChannel.members.filter(m =>
            !m.user.bot &&
            m.id !== userId &&
            !m.voice.selfDeaf &&
            !m.voice.serverDeaf
        );

        if (viewers.size < 1) return;

        const viewerMultiplier = viewers.size * 0.1 + 1; // 1 viewer = x1.1, 2 = x1.2, etc.
        const xpGained = Math.floor(5 * getMultiplier(freshMember, guild) * viewerMultiplier);

        sendLog(guild, `📺 +${xpGained} XP stream pour ${freshMember.user.tag} (${viewers.size} viewers)`);
        recordActivity(userId, guildId);

        db.get(`SELECT * FROM users WHERE userId = ? AND guildId = ?`, [userId, guildId], (err, row) => {
            if (!row) {
                db.run(`INSERT INTO users (userId, guildId, xp, level, coins) VALUES (?, ?, ?, 0, 0)`,
                    [userId, guildId, xpGained]);
                return;
            }

            let newXP    = row.xp + xpGained;
            let newLevel = row.level;
            let newCoins = row.coins;
            let leveledUp = false;

            while (newXP >= (newLevel + 1) * 100) {
                newXP -= (newLevel + 1) * 100;
                newLevel++;
                newCoins += 10;
                leveledUp = true;
            }

            db.run(`UPDATE users SET xp = ?, level = ?, coins = ? WHERE userId = ? AND guildId = ?`,
                [newXP, newLevel, newCoins, userId, guildId]);

            if (leveledUp) {
                applyRankRoles(freshMember, newLevel);
                const ch = getLevelUpChannel(guild);
                if (ch) ch.send(`<@${userId}> est passé niveau **${newLevel}** ! 🎉 (+10 🪙)`);
            }
        });

    }, 30000);

    streamUsers.set(`${guildId}-${userId}`, interval);
    sendLog(guild, `📺 XP stream démarré pour ${member.user.tag}`);
}

function stopStreamXP(member, guild) {
    const key = `${guild.id}-${member.id}`;
    if (streamUsers.has(key)) {
        clearInterval(streamUsers.get(key));
        streamUsers.delete(key);
        sendLog(guild, `⏹️ XP stream arrêté pour ${member.user.tag}`);
    }
}

module.exports = { startVoiceXP, stopVoiceXP, startStreamXP, stopStreamXP };
