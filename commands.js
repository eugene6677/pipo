// ============================================================
// 💬 COMMANDES
// ============================================================

const db = require('./db');
const { ADMIN_ROLE_NAME, YOUR_USER_ID } = require('./config');
const {
    getCommandChannel, getLevelUpChannel, sendLog,
    isAdmin, getMultiplier, applyRankRoles, getActivityRange, recordActivity
} = require('./utils');

const msgCooldown = new Map();
const spamData    = new Map();

async function handleMessage(message) {
    if (message.author.bot) return;

    const userId    = message.author.id;
    const guild     = message.guild;
    const guildId   = guild.id;
    const now       = Date.now();
    const member    = guild.members.cache.get(userId);
    const isCommand = message.content.startsWith('!');

    // ---------- ANTI-SPAM ----------
    if (!isCommand) {
        const spamKey = `${guildId}-${userId}`;
        if (!spamData.has(spamKey)) spamData.set(spamKey, { count: 0, last: now });
        const spam = spamData.get(spamKey);

        if (now - spam.last > 5000) spam.count = 0;
        spam.last = now;
        spam.count++;

        if (spam.count === 5) { message.reply("⚠️ Arrête de spam !"); return; }
        if (spam.count === 6) {
            db.run(`UPDATE users SET xp = MAX(xp - 20, 0) WHERE userId = ? AND guildId = ?`, [userId, guildId]);
            message.reply("❌ Spam détecté : **-20 XP** !");
            return;
        }
        if (spam.count === 8) {
            message.reply("⛔ Trop de spam : ban temporaire de 1 minute !");
            await guild.members.ban(userId, { deleteMessageSeconds: 0, reason: "Spam excessif" })
                .catch(err => sendLog(guild, `❌ ERREUR BAN : ${err.message}`));
            setTimeout(async () => {
                await guild.bans.remove(userId).catch(err => sendLog(guild, `❌ ERREUR UNBAN : ${err.message}`));
                sendLog(guild, `✅ ${userId} débanni après 1 minute`);
            }, 60000);
            return;
        }
        if (spam.count >= 9) { message.reply("⛔ Spam excessif !"); return; }
    }

    // ---------- COMMANDES ----------
    if (isCommand) {
        const args           = message.content.slice(1).trim().split(/\s+/);
        const command        = args[0].toLowerCase();
        const commandChannel = getCommandChannel(guild);

        // !rank
        if (command === 'rank') {
            const target   = message.mentions.users.first();
            const targetId = target ? target.id : userId;

            db.get(`SELECT * FROM users WHERE userId = ? AND guildId = ?`, [targetId, guildId], (err, row) => {
                if (!row) {
                    const reply = "Cet utilisateur n'a pas encore d'XP.";
                    if (commandChannel) commandChannel.send(reply);
                    else message.reply(reply);
                    return;
                }

                getActivityRange(targetId, guildId, (range) => {
                    const activityText = range ? ` | 🕐 Actif de **${range}**` : "";
                    const reply = `📊 <@${targetId}> — Niveau : **${row.level}** | XP : **${row.xp}** / ${(row.level + 1) * 100} | 🪙 **${row.coins}** coins${activityText}`;
                    if (commandChannel) commandChannel.send(reply);
                    else message.reply(reply);
                });
            });
        }

        // !top
        if (command === 'top') {
            db.all(`SELECT * FROM users WHERE guildId = ? ORDER BY level DESC, xp DESC LIMIT 10`,
                [guildId], (err, rows) => {
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

        // !bot
        if (command === 'bot') {
            guild.members.fetch().then(members => {
                const nonBotMembers = members.filter(m => !m.user.bot);

                db.all(`SELECT * FROM users WHERE guildId = ? ORDER BY level ASC, xp ASC`,
                    [guildId], (err, rows) => {
                    const registeredIds = (rows || []).map(r => r.userId);

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

        // !setxp
        if (command === 'setxp') {
            if (!isAdmin(member, guild)) { message.reply("❌ Réservé aux OP et au créateur."); return; }
            const target = message.mentions.users.first();
            const amount = parseInt(args[2]);
            if (!target || isNaN(amount)) { message.reply("Usage : `!setxp @membre <xp>`"); return; }
            db.run(`INSERT INTO users (userId, guildId, xp, level, coins) VALUES (?, ?, ?, 0, 0)
                    ON CONFLICT(userId, guildId) DO UPDATE SET xp = ?`,
                [target.id, guildId, amount, amount]);
            message.reply(`✅ XP de <@${target.id}> défini à **${amount}**.`);
        }

        // !setlevel
        if (command === 'setlevel') {
            if (!isAdmin(member, guild)) { message.reply("❌ Réservé aux OP et au créateur."); return; }
            const target = message.mentions.users.first();
            const level  = parseInt(args[2]);
            if (!target || isNaN(level)) { message.reply("Usage : `!setlevel @membre <niveau>`"); return; }
            db.run(`INSERT INTO users (userId, guildId, xp, level, coins) VALUES (?, ?, 0, ?, 0)
                    ON CONFLICT(userId, guildId) DO UPDATE SET level = ?, xp = 0`,
                [target.id, guildId, level, level]);
            const targetMember = guild.members.cache.get(target.id);
            if (targetMember) applyRankRoles(targetMember, level);
            message.reply(`✅ Niveau de <@${target.id}> défini à **${level}**.`);
        }

        // !setcoins
        if (command === 'setcoins') {
            if (!isAdmin(member, guild)) { message.reply("❌ Réservé aux OP et au créateur."); return; }
            const target = message.mentions.users.first();
            const amount = parseInt(args[2]);
            if (!target || isNaN(amount)) { message.reply("Usage : `!setcoins @membre <nombre>`"); return; }
            db.run(`INSERT INTO users (userId, guildId, xp, level, coins) VALUES (?, ?, 0, 0, ?)
                    ON CONFLICT(userId, guildId) DO UPDATE SET coins = ?`,
                [target.id, guildId, amount, amount]);
            message.reply(`✅ Coins de <@${target.id}> définis à 🪙 **${amount}**.`);
        }

        // !shop
        if (command === 'shop') {
            db.all(`SELECT * FROM shop WHERE guildId = ? ORDER BY category, roleName`, [guildId], (err, rows) => {
                const categories = { deco: {}, demande: {}, perms: {} };
                (rows || []).forEach(r => {
                    const cat = r.category || 'deco';
                    if (!categories[cat]) categories[cat] = {};
                    if (!categories[cat][r.roleName]) categories[cat][r.roleName] = [];
                    categories[cat][r.roleName].push(r);
                });

                const categoryNames = {
                    deco:    "🎨 Rôles de déco",
                    demande: "📋 Rôles de demande",
                    perms:   "🔧 Rôles de perms"
                };

                let msg = "🛒 **Shop du serveur** 🛒\n";

                Object.entries(categories).forEach(([cat, roles]) => {
                    msg += `\n**${categoryNames[cat]}**\n`;
                    if (Object.keys(roles).length === 0) {
                        msg += `*Aucun rôle disponible dans cette catégorie actuellement.*\n`;
                        return;
                    }
                    Object.entries(roles).forEach(([roleName, items]) => {
                        if (items.length === 1) {
                            const r     = items[0];
                            const duree = r.duration === 0 ? "permanent" : `${r.duration}h`;
                            const desc  = r.description ? ` — *${r.description}*` : '';
                            msg += `• **${roleName}** — 🪙 ${r.price} coins (${duree})${desc}\n`;
                        } else {
                            msg += `• **${roleName}**\n`;
                            items.forEach(r => {
                                const duree = r.duration === 0 ? "permanent" : `${r.duration}h`;
                                const desc  = r.description ? ` — *${r.description}*` : '';
                                msg += `   ↳ 🪙 ${r.price} coins (${duree})${desc}\n`;
                            });
                        }
                    });
                });

                msg += "\nPour acheter : `!buy <nom du rôle>`";
                if (commandChannel) commandChannel.send(msg);
                else message.reply(msg);
            });
        }

        // !roles
        if (command === 'roles') {
            db.all(`SELECT * FROM role_expirations WHERE userId = ? AND guildId = ?`,
                [userId, guildId], (err, rows) => {
                if (!rows || rows.length === 0) {
                    const reply = "Tu n'as aucun rôle acheté en cours.";
                    if (commandChannel) commandChannel.send(reply);
                    else message.reply(reply);
                    return;
                }

                let msg      = "🎭 **Vos rôles achetés** 🎭\n\n";
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

        // !pause
        if (command === 'pause') {
            const roleName = args.slice(1).join(' ');
            if (!roleName) { message.reply("Usage : `!pause <nom du rôle>`"); return; }

            db.all(`SELECT * FROM role_expirations WHERE userId = ? AND guildId = ?`,
                [userId, guildId], async (err, rows) => {
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

                await member.roles.remove(role).catch(err => sendLog(guild, `❌ ERREUR pause : ${err.message}`));
                db.run(`UPDATE role_expirations SET expiresAt = ? WHERE userId = ? AND guildId = ? AND roleId = ?`,
                    [-remainingMs, userId, guildId, row.roleId]);

                const h = Math.floor(remainingMs / 3600000);
                const m = Math.floor((remainingMs % 3600000) / 60000);
                message.reply(`⏸️ Le rôle **${role.name}** est en pause. Il te reste **${h}h${m}m**.`);
            });
        }

        // !unpause
        if (command === 'unpause') {
            const roleName = args.slice(1).join(' ');
            if (!roleName) { message.reply("Usage : `!unpause <nom du rôle>`"); return; }

            db.all(`SELECT * FROM role_expirations WHERE userId = ? AND guildId = ? AND expiresAt < 0`,
                [userId, guildId], async (err, rows) => {
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

                await member.roles.add(role).catch(err => sendLog(guild, `❌ ERREUR unpause : ${err.message}`));
                db.run(`UPDATE role_expirations SET expiresAt = ? WHERE userId = ? AND guildId = ? AND roleId = ?`,
                    [newExpiresAt, userId, guildId, row.roleId]);

                const h = Math.floor(remainingMs / 3600000);
                const m = Math.floor((remainingMs % 3600000) / 60000);
                message.reply(`▶️ Le rôle **${role.name}** a repris. Il expirera dans **${h}h${m}m**.`);
            });
        }

        // !addshop
        if (command === 'addshop') {
            if (!isAdmin(member, guild)) { message.reply("❌ Réservé aux OP et au créateur."); return; }

            const price    = parseInt(args[1]);
            const duration = parseInt(args[2]);
            const category = args[3]?.toLowerCase();
            const roleM    = message.mentions.roles.first();
            const validCategories = ['deco', 'demande', 'perms'];

            if (!roleM || isNaN(price) || !validCategories.includes(category)) {
                message.reply("Usage : `!addshop <prix> <durée ou 0> <deco/demande/perms> @rôle <description optionnelle>`");
                return;
            }

            const roleIndex   = args.findIndex(a => a.includes(roleM.id));
            const description = args.slice(roleIndex + 1).join(' ') || '';
            const durationVal = isNaN(duration) ? 0 : duration;

            db.run(`INSERT INTO shop (guildId, roleId, roleName, price, duration, description, category) VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [guildId, roleM.id, roleM.name, price, durationVal, description, category]);

            const durationText = durationVal === 0 ? "permanent" : `${durationVal}h`;
            message.reply(`✅ **${roleM.name}** ajouté au shop (${category}) pour 🪙 ${price} coins (${durationText})${description ? ` — ${description}` : ''}.`);
        }

        // !removeshop
        if (command === 'removeshop') {
            if (!isAdmin(member, guild)) { message.reply("❌ Réservé aux OP et au créateur."); return; }

            const itemName = args.slice(1).join(' ');
            if (!itemName) { message.reply("Usage : `!removeshop <nom du rôle>`"); return; }

            db.run(`DELETE FROM shop WHERE guildId = ? AND LOWER(roleName) = LOWER(?)`,
                [guildId, itemName], function(err) {
                if (this.changes === 0) message.reply(`❌ Item "${itemName}" introuvable dans le shop.`);
                else message.reply(`✅ **${itemName}** retiré du shop.`);
            });
        }

        // !clearshop
        if (command === 'clearshop') {
            if (!isAdmin(member, guild)) { message.reply("❌ Réservé aux OP et au créateur."); return; }
            db.run(`DELETE FROM shop WHERE guildId = ?`, [guildId]);
            message.reply("✅ Le shop a été vidé.");
        }

        // !buy
        if (command === 'buy') {
            const roleName = args.slice(1).join(' ');
            if (!roleName) { message.reply("Usage : `!buy <nom du rôle>`"); return; }

            db.all(`SELECT * FROM shop WHERE guildId = ? AND LOWER(roleName) = LOWER(?)`,
                [guildId, roleName], async (err, shopItems) => {
                if (!shopItems || shopItems.length === 0) {
                    message.reply(`❌ Rôle "${roleName}" introuvable dans le shop.`);
                    return;
                }

                const shopItem = shopItems[0];

                db.get(`SELECT * FROM users WHERE userId = ? AND guildId = ?`, [userId, guildId], async (err2, row) => {
                    if (!row || row.coins < shopItem.price) {
                        message.reply(`❌ Pas assez de coins. Il te faut 🪙 **${shopItem.price}**, tu en as **${row?.coins ?? 0}**.`);
                        return;
                    }

                    const role = guild.roles.cache.get(shopItem.roleId);
                    if (!role) { message.reply("❌ Ce rôle n'existe plus sur le serveur."); return; }
                    if (member.roles.cache.has(role.id)) { message.reply("❌ Tu as déjà ce rôle."); return; }

                    await member.roles.add(role).catch(err3 => sendLog(guild, `❌ ERREUR ajout rôle shop : ${err3.message}`));
                    db.run(`UPDATE users SET coins = coins - ? WHERE userId = ? AND guildId = ?`,
                        [shopItem.price, userId, guildId]);

                    if (shopItem.duration > 0) {
                        const expiresAt = now + shopItem.duration * 3600000;
                        db.run(`INSERT OR REPLACE INTO role_expirations (userId, guildId, roleId, expiresAt) VALUES (?, ?, ?, ?)`,
                            [userId, guildId, shopItem.roleId, expiresAt]);
                        message.reply(`✅ Tu as acheté le rôle **${role.name}** pour 🪙 ${shopItem.price} coins ! Il expirera dans **${shopItem.duration}h**.`);
                    } else {
                        message.reply(`✅ Tu as acheté le rôle **${role.name}** pour 🪙 ${shopItem.price} coins !`);
                    }

                    if (shopItem.category === 'demande') {
                        const ticketCategory = guild.channels.cache.find(
                            c => c.name.toLowerCase() === 'tickets' && c.type === 4
                        );
                        const opRole = guild.roles.cache.find(r => r.name === ADMIN_ROLE_NAME);

                        const ticketChannel = await guild.channels.create({
                            name: `ticket-${member.user.username}`,
                            type: 0,
                            parent: ticketCategory?.id ?? null,
                            permissionOverwrites: [
                                { id: guild.roles.everyone, deny: ['ViewChannel'] },
                                { id: userId, allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory'] },
                                ...(opRole ? [{ id: opRole.id, allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory'] }] : [])
                            ]
                        }).catch(err => { sendLog(guild, `❌ ERREUR création ticket : ${err.message}`); return null; });

                        if (ticketChannel) {
                            ticketChannel.send(
                                `👋 <@${userId}> a acheté le rôle **${role.name}**.\n` +
                                `Un OP va traiter ta demande ici.${opRole ? ` <@&${opRole.id}>` : ''}`
                            );
                            sendLog(guild, `🎫 Ticket créé : ${ticketChannel.name} pour ${member.user.tag}`);
                        }
                    }
                });
            });
        }

        // !idea
        if (command === 'idea') {
            db.get(`SELECT * FROM banned_ideas WHERE userId = ? AND guildId = ?`, [userId, guildId], (err, banned) => {
                if (banned) { message.reply("❌ Tu ne peux plus soumettre d'idées."); return; }

                const idea = args.slice(1).join(' ').toLowerCase().trim();
                if (!idea) { message.reply("Usage : `!idea <ton idée>`"); return; }

                db.get(`SELECT * FROM ideas WHERE guildId = ? AND LOWER(idea) = ?`, [guildId, idea], (err2, existing) => {
                    if (existing) { message.reply("❌ Cette idée existe déjà dans la liste !"); return; }

                    db.run(`INSERT INTO ideas (guildId, userId, idea, timestamp) VALUES (?, ?, ?, ?)`,
                        [guildId, userId, idea, Date.now()]);
                    message.reply(`💡 Idée enregistrée : **${idea}**`);
                });
            });
        }

        // !ideas
        if (command === 'ideas') {
            if (!isAdmin(member, guild)) { message.reply("❌ Réservé aux OP et au créateur."); return; }

            const page    = parseInt(args[1]) || 1;
            const perPage = 10;
            const offset  = (page - 1) * perPage;

            db.all(`SELECT COUNT(*) as total FROM ideas WHERE guildId = ?`, [guildId], (err, countRows) => {
                const total      = countRows[0].total;
                const totalPages = Math.ceil(total / perPage);

                if (total === 0) { message.reply("Aucune idée enregistrée."); return; }

                db.all(`SELECT * FROM ideas WHERE guildId = ? ORDER BY timestamp DESC LIMIT ? OFFSET ?`,
                    [guildId, perPage, offset], (err2, rows) => {

                    let msg = `💡 **Liste des idées** 💡 — Page ${page}/${totalPages}\n\n`;
                    rows.forEach(r => {
                        const date = new Date(r.timestamp).toLocaleDateString('fr-FR');
                        msg += `* #${r.id} <@${r.userId}> (${date}) : ${r.idea}\n`;
                    });
                    if (page < totalPages) msg += `\nPage suivante : \`!ideas ${page + 1}\``;

                    if (commandChannel) commandChannel.send(msg);
                    else message.reply(msg);
                });
            });
        }

        // !removeidea
        if (command === 'removeidea') {
            if (!isAdmin(member, guild)) { message.reply("❌ Réservé aux OP et au créateur."); return; }

            const id = parseInt(args[1]);
            if (isNaN(id)) { message.reply("Usage : `!removeidea <numéro>`"); return; }

            db.run(`DELETE FROM ideas WHERE id = ? AND guildId = ?`, [id, guildId], function(err) {
                if (this.changes === 0) message.reply(`❌ Idée #${id} introuvable.`);
                else message.reply(`✅ Idée #${id} supprimée.`);
            });
        }

        // !clearideas
        if (command === 'clearideas') {
            if (!isAdmin(member, guild)) { message.reply("❌ Réservé aux OP et au créateur."); return; }
            db.run(`DELETE FROM ideas WHERE guildId = ?`, [guildId]);
            message.reply("✅ Toutes les idées ont été supprimées.");
        }

        // !banidea
        if (command === 'banidea') {
            if (!isAdmin(member, guild)) { message.reply("❌ Réservé aux OP et au créateur."); return; }
            const target = message.mentions.users.first();
            if (!target) { message.reply("Usage : `!banidea @membre`"); return; }
            db.run(`INSERT OR IGNORE INTO banned_ideas (userId, guildId) VALUES (?, ?)`, [target.id, guildId]);
            message.reply(`✅ <@${target.id}> ne peut plus soumettre d'idées.`);
        }

        // !unbanidea
        if (command === 'unbanidea') {
            if (!isAdmin(member, guild)) { message.reply("❌ Réservé aux OP et au créateur."); return; }
            const target = message.mentions.users.first();
            if (!target) { message.reply("Usage : `!unbanidea @membre`"); return; }
            db.run(`DELETE FROM banned_ideas WHERE userId = ? AND guildId = ?`, [target.id, guildId]);
            message.reply(`✅ <@${target.id}> peut à nouveau soumettre des idées.`);
        }

        // !op
        if (command === 'op') {
            if (member.id !== YOUR_USER_ID) { message.reply("❌ Seul Eugène peut utiliser cette commande."); return; }
            const targetUser = message.mentions.users.first();
            if (!targetUser) { message.reply("Usage : `!op @membre`"); return; }
            const opRole = guild.roles.cache.find(r => r.name === ADMIN_ROLE_NAME);
            if (!opRole) { message.reply("❌ Le rôle OP n'existe pas sur ce serveur."); return; }
            const targetMember = await guild.members.fetch(targetUser.id).catch(() => null);
            if (!targetMember) { message.reply("❌ Membre introuvable."); return; }
            await targetMember.roles.add(opRole).catch(err => sendLog(guild, `❌ ERREUR ajout OP : ${err.message}`));
            message.reply(`✅ <@${targetUser.id}> est maintenant OP.`);
        }

        // !unop
        if (command === 'unop') {
            if (member.id !== YOUR_USER_ID) { message.reply("❌ Seul Eugène peut utiliser cette commande."); return; }
            const targetUser = message.mentions.users.first();
            if (!targetUser) { message.reply("Usage : `!unop @membre`"); return; }
            const opRole = guild.roles.cache.find(r => r.name === ADMIN_ROLE_NAME);
            if (!opRole) { message.reply("❌ Le rôle OP n'existe pas sur ce serveur."); return; }
            const targetMember = await guild.members.fetch(targetUser.id).catch(() => null);
            if (!targetMember) { message.reply("❌ Membre introuvable."); return; }
            await targetMember.roles.remove(opRole).catch(err => sendLog(guild, `❌ ERREUR retrait OP : ${err.message}`));
            message.reply(`✅ <@${targetUser.id}> n'est plus OP.`);
        }

        // !help
        if (command === 'help') {
            const msg =
                "📖 **Commandes disponibles** 📖\n\n" +
                "**Pour tout le monde**\n" +
                "`!rank` — voir ton niveau, XP et coins\n" +
                "`!rank @membre` — voir le profil d'un autre membre\n" +
                "`!top` — top 10 des membres les plus actifs\n" +
                "`!bot` — les 10 membres les moins actifs\n" +
                "`!shop` — voir les rôles disponibles à l'achat\n" +
                "`!buy <nom du rôle>` — acheter un rôle\n" +
                "`!roles` — voir tes rôles achetés et leur durée restante\n" +
                "`!pause <nom du rôle>` — mettre en pause un rôle temporaire\n" +
                "`!unpause <nom du rôle>` — reprendre un rôle en pause\n" +
                "`!idea <ton idée>` — soumettre une idée\n" +
                "`!help` — voir cette liste\n\n" +
                "**Réservé aux OP et au créateur**\n" +
                "`!addshop <prix> <durée ou 0> <deco/demande/perms> @rôle <description>` — ajouter un rôle au shop\n" +
                "`!removeshop <nom du rôle>` — retirer un rôle du shop\n" +
                "`!clearshop` — vider tout le shop\n" +
                "`!setxp @membre <nombre>` — modifier l'XP d'un membre\n" +
                "`!setlevel @membre <nombre>` — modifier le niveau d'un membre\n" +
                "`!setcoins @membre <nombre>` — modifier les coins d'un membre\n" +
                "`!ideas <page>` — voir toutes les idées soumises\n" +
                "`!removeidea <numéro>` — supprimer une idée\n" +
                "`!clearideas` — supprimer toutes les idées\n" +
                "`!banidea @membre` — empêcher quelqu'un de soumettre des idées\n" +
                "`!unbanidea @membre` — réautoriser quelqu'un à soumettre des idées\n" +
                "`!op @membre` — donner le rôle OP (Eugène uniquement)\n" +
                "`!unop @membre` — retirer le rôle OP (Eugène uniquement)";

            if (commandChannel) commandChannel.send(msg);
            else message.reply(msg);
        }

        return;
    }

    // ---------- XP NORMAL ----------
    if (msgCooldown.has(`${guildId}-${userId}`) && now - msgCooldown.get(`${guildId}-${userId}`) < 2000) return;
    msgCooldown.set(`${guildId}-${userId}`, now);

    const totalLetters = message.content.replace(/\s/g, '').length;
    if (totalLetters < 5) return;

    const content24h = message.content.trim().toLowerCase();
    const dayAgo     = now - 86400000;

    db.get(`SELECT COUNT(*) as cnt FROM recent_messages WHERE userId = ? AND guildId = ? AND content = ? AND timestamp > ?`,
        [userId, guildId, content24h, dayAgo], (err, res) => {

        if (res && res.cnt >= 2) {
            console.log(`⛔ Message répété ignoré pour ${userId}`);
            return;
        }

        db.run(`INSERT INTO recent_messages (userId, guildId, content, timestamp) VALUES (?, ?, ?, ?)`,
            [userId, guildId, content24h, now]);
        db.run(`DELETE FROM recent_messages WHERE timestamp < ?`, [dayAgo]);

        const wordCount = Math.min(message.content.trim().split(/\s+/).length, 10);
        const xpGained  = Math.floor(wordCount * (member ? getMultiplier(member, guild) : 1));

        recordActivity(userId, guildId);
        sendLog(guild, `💬 +${xpGained} XP message pour ${member?.user.tag ?? userId}`);

        db.get(`SELECT * FROM users WHERE userId = ? AND guildId = ?`, [userId, guildId], (err2, row) => {
            if (!row) {
                db.run(`INSERT INTO users (userId, guildId, xp, level, coins) VALUES (?, ?, ?, 0, 0)`,
                    [userId, guildId, xpGained]);
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

            db.run(`UPDATE users SET xp = ?, level = ?, coins = ? WHERE userId = ? AND guildId = ?`,
                [newXP, newLevel, newCoins, userId, guildId]);
        });
    });
}

module.exports = { handleMessage };
