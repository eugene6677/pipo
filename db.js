// ============================================================
// 🗄️ BASE DE DONNÉES
// RLFR Bot v2.0-dev1
// ============================================================

const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database('./levels.db');

db.serialize(() => {

    // ============================================================
    // 👤 UTILISATEURS
    // ============================================================

    db.run(`CREATE TABLE IF NOT EXISTS users (
        userId TEXT,
        guildId TEXT,
        xp INTEGER DEFAULT 0,
        level INTEGER DEFAULT 0,
        coins INTEGER DEFAULT 0,
        PRIMARY KEY (userId, guildId)
    )`);

    // ============================================================
    // 🛒 SHOP
    // ============================================================

    db.run(`CREATE TABLE IF NOT EXISTS shop (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guildId TEXT,
        roleId TEXT,
        roleName TEXT,
        price INTEGER,
        duration INTEGER DEFAULT 0,
        description TEXT DEFAULT '',
        category TEXT DEFAULT 'deco'
    )`);

    // ============================================================
    // ⏰ RÔLES TEMPORAIRES
    // ============================================================

    db.run(`CREATE TABLE IF NOT EXISTS role_expirations (
        userId TEXT,
        guildId TEXT,
        roleId TEXT,
        expiresAt INTEGER,
        PRIMARY KEY (userId, guildId, roleId)
    )`);

    // ============================================================
    // 🔨 TEMPBANS (NOUVEAU)
    // ============================================================

    db.run(`CREATE TABLE IF NOT EXISTS temp_bans (
        userId TEXT,
        guildId TEXT,
        expiresAt INTEGER,
        PRIMARY KEY (userId, guildId)
    )`);

    // ============================================================
    // 💬 MESSAGES RÉCENTS
    // ============================================================

    db.run(`CREATE TABLE IF NOT EXISTS recent_messages (
        userId TEXT,
        guildId TEXT,
        content TEXT,
        timestamp INTEGER
    )`);

    // ============================================================
    // 🕒 ACTIVITÉ PAR HEURE
    // ============================================================

    db.run(`CREATE TABLE IF NOT EXISTS activity (
        userId TEXT,
        guildId TEXT,
        hour INTEGER,
        count INTEGER DEFAULT 0,
        PRIMARY KEY (userId, guildId, hour)
    )`);

    // ============================================================
    // 📅 ACTIVITÉ PAR JOUR (NOUVEAU)
    // ============================================================

    db.run(`CREATE TABLE IF NOT EXISTS daily_activity (
        userId TEXT,
        guildId TEXT,
        day INTEGER,
        count INTEGER DEFAULT 0,
        PRIMARY KEY (userId, guildId, day)
    )`);

    // ============================================================
    // 📆 ACTIVITÉ MENSUELLE (NOUVEAU)
    // ============================================================

    db.run(`CREATE TABLE IF NOT EXISTS monthly_activity (
        userId TEXT,
        guildId TEXT,
        month TEXT,
        count INTEGER DEFAULT 0,
        PRIMARY KEY (userId, guildId, month)
    )`);

    // ============================================================
    // 💡 IDÉES
    // ============================================================

    db.run(`CREATE TABLE IF NOT EXISTS ideas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guildId TEXT,
        userId TEXT,
        idea TEXT,
        timestamp INTEGER
    )`);

    // ============================================================
    // 🚫 IDEAS BANNIES
    // ============================================================

    db.run(`CREATE TABLE IF NOT EXISTS banned_ideas (
        userId TEXT,
        guildId TEXT,
        PRIMARY KEY (userId, guildId)
    )`);

});

module.exports = db;