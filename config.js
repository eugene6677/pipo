// ============================================================
// ⚙️ CONFIG
// ============================================================

const LEVELUP_CHANNEL_NAME = "🔆niveau🔆";
const COMMAND_CHANNEL_NAME = "commande";
const ADMIN_ROLE_NAME      = "OP";
const YOUR_USER_ID         = "1108924859632848989";
const SUGGESTIONS_CHANNEL_NAME = "suggestions-idées";

const rewards = [
    { minLevel: 1,  maxLevel: 2,        role: "Nouveau" },
    { minLevel: 3,  maxLevel: 4,        role: "Actif"   },
    { minLevel: 5,  maxLevel: 9,        role: "Cool"    },
    { minLevel: 10, maxLevel: 19,       role: "OG"      },
    { minLevel: 20, maxLevel: Infinity, role: "Dieu"    }
];

module.exports = {
    LEVELUP_CHANNEL_NAME,
    COMMAND_CHANNEL_NAME,
    ADMIN_ROLE_NAME,
    YOUR_USER_ID,
    rewards
};
