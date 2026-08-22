// ============================================================
// ⚙️ CONFIG
// ============================================================

const LEVELUP_CHANNEL_NAME = "🔆niveau🔆";
const COMMAND_CHANNEL_NAME = "commande";
const ADMIN_ROLE_NAME      = "OP";
const YOUR_USER_ID         = "1108924859632848989";
const SUGGESTIONS_CHANNEL_NAME = "suggestions-idées";
const channelOverrides = new Map();

const db = require('./db');

function setChannelOverride(guildId, type, channelName) {
    channelOverrides.has(guildId)
        ? channelOverrides.get(guildId)[type] = channelName
        : channelOverrides.set(guildId, { [type]: channelName });

    db.run(`INSERT OR REPLACE INTO channel_overrides (guildId, type, channelName) VALUES (?, ?, ?)`,
        [guildId, type, channelName]);
}

function loadChannelOverrides(callback) {
    db.all(`SELECT * FROM channel_overrides`, [], (err, rows) => {
        if (rows) rows.forEach(r => {
            if (!channelOverrides.has(r.guildId)) channelOverrides.set(r.guildId, {});
            channelOverrides.get(r.guildId)[r.type] = r.channelName;
        });
        if (callback) callback();
    });
}

const rewards = [
    { minLevel: 1,  maxLevel: 2,        role: "Nouveau" },
    { minLevel: 3,  maxLevel: 4,        role: "Actif"   },
    { minLevel: 5,  maxLevel: 9,        role: "Cool"    },
    { minLevel: 10, maxLevel: 19,       role: "OG"      },
    { minLevel: 20, maxLevel: Infinity, role: "Dieu"    }
];

function getChannelName(guildId, type, defaultName) {
    return channelOverrides.get(guildId)?.[type] ?? defaultName;
}

module.exports = {
    LEVELUP_CHANNEL_NAME,
    COMMAND_CHANNEL_NAME,
    ADMIN_ROLE_NAME,
    YOUR_USER_ID,
    SUGGESTIONS_CHANNEL_NAME,
    rewards,
    channelOverrides,
    getChannelName,
    setChannelOverride,
    loadChannelOverrides
};
