// ============================================================
// 🔧 FONCTIONS UTILITAIRES
// ============================================================

const db = require('./db');
const { getChannelName, channelOverrides, LEVELUP_CHANNEL_NAME, COMMAND_CHANNEL_NAME, SUGGESTIONS_CHANNEL_NAME, ADMIN_ROLE_NAME, YOUR_USER_ID, rewards } = require('./config');

function getLevelUpChannel(guild) {
    const name = getChannelName(guild.id, 'levelup', LEVELUP_CHANNEL_NAME);
    return guild.channels.cache.find(c => c.name === name && c.isTextBased());
}

function getCommandChannel(guild) {
    const name = getChannelName(guild.id, 'commande', COMMAND_CHANNEL_NAME);
    return guild.channels.cache.find(c => c.name === name && c.isTextBased());
}

function getLogsChannel(guild) {
    const name = getChannelName(guild.id, 'logs', 'logs');
    return guild.channels.cache.find(c => c.name === name && c.isTextBased());
}

function getSuggestionsChannel(guild) {
    const name = getChannelName(guild.id, 'suggestions', SUGGESTIONS_CHANNEL_NAME);
    return guild.channels.cache.find(c => c.name === name && c.isTextBased());
}

function sendLog(guild, msg) {
    const ch = getLogsChannel(guild);
    if (ch) ch.send(msg);
    console.log(msg);
}

function sendStartupLog(client, msg) {
    console.log(msg);
    client.guilds.cache.forEach(guild => {
        const ch = getLogsChannel(guild);
        if (ch) ch.send(msg);
    });
}

function recordActivity(userId, guildId) {

    const now = new Date();

    // Heure locale du serveur
    const hour = new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris', hour: 'numeric', hour12: false });
    console.log(`📊 recordActivity appelé pour ${userId} à ${hour}h`);

    // Jour de la semaine
    // 0 = dimanche ... 6 = samedi
    const day = now.getDay();

    // Exemple : 2026-06
    const month =
        `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    // Activité par heure
    db.run(
        `INSERT INTO activity
        (userId, guildId, hour, count)
        VALUES (?, ?, ?, 1)
        ON CONFLICT(userId, guildId, hour)
        DO UPDATE SET count = count + 1`,
        [userId, guildId, hour]
    );

    // Activité par jour
    db.run(
        `INSERT INTO daily_activity
        (userId, guildId, day, count)
        VALUES (?, ?, ?, 1)
        ON CONFLICT(userId, guildId, day)
        DO UPDATE SET count = count + 1`,
        [userId, guildId, day]
    );

    // Activité mensuelle
    db.run(
        `INSERT INTO monthly_activity
        (userId, guildId, month, count)
        VALUES (?, ?, ?, 1)
        ON CONFLICT(userId, guildId, month)
        DO UPDATE SET count = count + 1`,
        [userId, guildId, month]
    );

}

function getActivityRange(userId, guildId, callback) {
    db.all(`SELECT hour, count FROM activity WHERE userId = ? AND guildId = ? ORDER BY count DESC`,
        [userId, guildId], (err, rows) => {
        console.log(`📊 getActivityRange pour ${userId} : ${rows?.length ?? 0} entrées`);
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

function getSuggestionsChannel(guild) {
    return guild.channels.cache.find(c => c.name === "suggestions-idées" && c.isTextBased());
}

async function applyRankRoles(member, level) {
    const guildRoles = member.guild.roles.cache;
    for (const r of rewards) {
        const role = guildRoles.find(x => x.name === r.role);
        if (!role) { sendLog(member.guild, `❌ Rôle introuvable : "${r.role}"`); continue; }

        const shouldHave = level >= r.minLevel && level <= r.maxLevel;
        const hasRole    = member.roles.cache.has(role.id);

        if (shouldHave && !hasRole)
            await member.roles.add(role).catch(err => sendLog(member.guild, `❌ ERREUR ajout ${r.role} : ${err.message}`));
        if (!shouldHave && hasRole)
            await member.roles.remove(role).catch(err => sendLog(member.guild, `❌ ERREUR retrait ${r.role} : ${err.message}`));
    }
}

module.exports = {
    getLevelUpChannel,
    getCommandChannel,
    getLogsChannel,
    sendLog,
    sendStartupLog,
    recordActivity,
    getActivityRange,
    isAdmin,
    getMultiplier,
    applyRankRoles,
    getSuggestionsChannel
};
