require('dotenv').config();

const fs   = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, REST, Routes } = require('discord.js');
const db = require('./db');
const { sendStartupLog, getLevelUpChannel, sendLog } = require('./utils');
const { startVoiceXP, stopVoiceXP } = require('./voice');
const { handleMessage } = require('./commands');
const { handleInteraction } = require('./slashHandler');
const slashCommands = require('./slashCommands');

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

// ============================================================
// 🔊 EVENTS VOCAL
// ============================================================
client.on('voiceStateUpdate', (oldState, newState) => {
    const userId = newState.id;
    const guild  = newState.guild;
    const member = guild.members.cache.get(userId);
    if (!member || member.user.bot) return;

    if (!oldState.channelId && newState.channelId) startVoiceXP(member, guild);
    if (oldState.channelId && !newState.channelId) stopVoiceXP(member, guild);
});

// ============================================================
// ⏰ VÉRIFICATION RÔLES EXPIRÉS (toutes les minutes)
// ============================================================
setInterval(() => {
    const now = Date.now();
    db.all(`SELECT * FROM role_expirations WHERE expiresAt > 0 AND expiresAt <= ?`, [now], async (err, rows) => {
        if (!rows || rows.length === 0) return;

        for (const row of rows) {
            const guild = client.guilds.cache.get(row.guildId);
            if (!guild) continue;

            const member = guild.members.cache.get(row.userId);
            const role   = guild.roles.cache.get(row.roleId);

            if (member && role && member.roles.cache.has(role.id)) {
                await member.roles.remove(role).catch(err => sendLog(guild, `❌ ERREUR retrait rôle expiré : ${err.message}`));
                const ch = getLevelUpChannel(guild);
                if (ch) ch.send(`⏰ Le rôle **${role.name}** de <@${row.userId}> a expiré et a été retiré.`);
            }

            db.run(`DELETE FROM role_expirations WHERE userId = ? AND guildId = ? AND roleId = ?`,
                [row.userId, row.guildId, row.roleId]);
        }
    });
}, 60000);

// ============================================================
// 💬 MESSAGES (XP + anti-spam, bridge)
// ============================================================
client.on('messageCreate', handleMessage);

// ============================================================
// 🌉 BRIDGE
// ============================================================
const BRIDGE = {
    '1528782200953241822': '1528066039806689431',
    '1528066039806689431': '1528782200953241822'
};

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    const target = BRIDGE[message.channelId];
    if (!target) return;
    const ch = await client.channels.fetch(target).catch(() => null);
    if (ch) ch.send(`**${message.author.username}** : ${message.content}`);
});

// ============================================================
// ⚡ SLASH COMMANDS
// ============================================================
client.on('interactionCreate', handleInteraction);

// ============================================================
// 💾 SAUVEGARDE AUTOMATIQUE
// ============================================================
setInterval(() => {
    const backupDir = "./backups";
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir);

    const now      = new Date();
    const filename = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}_${String(now.getHours()).padStart(2,'0')}h.db`;

    fs.copyFile("./levels.db", path.join(backupDir, filename), err => {
        if (err) { console.error("Erreur backup :", err); return; }
        console.log("💾 Backup créé :", filename);
    });
}, 1000 * 60 * 60 * 24);

// ============================================================
// 🚀 DÉMARRAGE
// ============================================================
client.once('clientReady', async () => {
    console.log("RLFR Bot v2.0-dev4");
    sendStartupLog(client, `✅ Bot connecté en tant que ${client.user.tag}`);

    // Enregistrement des slash commands sur chaque serveur
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

    for (const guild of client.guilds.cache.values()) {
        try {
            await rest.put(
                Routes.applicationGuildCommands(client.user.id, guild.id),
                { body: slashCommands }
            );
            console.log(`✅ Slash commands enregistrées sur ${guild.name}`);
        } catch (err) {
            console.error(`❌ Erreur slash commands sur ${guild.name} :`, err.message);
        }
    }

    // Scan des vocaux existants
    client.guilds.cache.forEach(guild => {
        guild.channels.cache
            .filter(c => c.isVoiceBased())
            .forEach(channel => {
                channel.members
                    .filter(m => !m.user.bot)
                    .forEach(member => startVoiceXP(member, guild));
            });
    });

    sendStartupLog(client, "🔊 Scan des vocaux terminé.");
});

client.login(process.env.DISCORD_TOKEN);
