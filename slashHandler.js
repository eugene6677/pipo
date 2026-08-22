// ============================================================
// ⚡ SLASH COMMAND HANDLER
// ============================================================

const db = require('./db');
const { ADMIN_ROLE_NAME, YOUR_USER_ID } = require('./config');
const {
    getCommandChannel, getLevelUpChannel, sendLog,
    isAdmin, applyRankRoles, getActivityRange, getSuggestionsChannel
} = require('./utils');

async function handleInteraction(interaction) {
    if (!interaction.isChatInputCommand()) return;

    const { commandName, guild, member, user } = interaction;
    const userId  = user.id;
    const guildId = guild.id;
    const now     = Date.now();
    const commandChannel = getCommandChannel(guild);

    // Fonction utilitaire pour répondre dans le bon salon
    const reply = async (msg, ephemeral = false) => {
        await interaction.reply({ content: msg, ephemeral });
        if (!ephemeral && commandChannel && interaction.channelId !== commandChannel.id) {
            commandChannel.send(msg);
        }
    };

    // ----------------------------------------------------------------

    if (commandName === 'rank') {
        const target   = interaction.options.getUser('membre');
        const targetId = target ? target.id : userId;

        db.get(`SELECT * FROM users WHERE userId = ? AND guildId = ?`, [targetId, guildId], (err, row) => {
            if (!row) { reply("Cet utilisateur n'a pas encore d'XP."); return; }

            getActivityRange(targetId, guildId, (range) => {
                const activityText = range ? ` | 🕐 Actif de **${range}**` : "";
                reply(`📊 <@${targetId}> — Niveau : **${row.level}** | XP : **${row.xp}** / ${(row.level + 1) * 100} | 🪙 **${row.coins}** coins${activityText}`);
            });
        });
    }

    else if (commandName === 'top') {
        db.all(`SELECT * FROM users WHERE guildId = ? ORDER BY level DESC, xp DESC LIMIT 10`, [guildId], async (err, rows) => {
            if (!rows || rows.length === 0) { reply("Aucun joueur classé."); return; }
            let msg  = "🏆 **Classement du serveur** 🏆\n\n";
            let rank = 1;
            for (const u of rows) {
                const m = await guild.members.fetch(u.userId).catch(() => null);
                if (!m) continue;
                msg += `#${rank} <@${u.userId}> — Niveau ${u.level} (${u.xp} XP) | 🪙 ${u.coins}\n`;
                rank++;
            }
            reply(msg);
        });
    }

    else if (commandName === 'bot') {
        guild.members.fetch().then(members => {
            const nonBotMembers = members.filter(m => !m.user.bot);

            db.all(`SELECT * FROM users WHERE guildId = ? ORDER BY level ASC, xp ASC`, [guildId], (err, rows) => {
                const registeredIds = (rows || []).map(r => r.userId);

                const noXpMembers = nonBotMembers
                    .filter(m => !registeredIds.includes(m.id))
                    .map(m => ({ userId: m.id, level: 0, xp: 0 }));

                const allMembers = [...(rows || []), ...noXpMembers]
                    .sort((a, b) => a.level - b.level || a.xp - b.xp)
                    .slice(0, 10);

                if (allMembers.length === 0) { reply("Aucun membre trouvé."); return; }

                let msg = "🐢 **Les 10 moins actifs** 🐢\n\n";
                allMembers.forEach((u, i) => {
                    msg += `#${i + 1} <@${u.userId}> — Niveau ${u.level} (${u.xp} XP)\n`;
                });
                reply(msg);
            });
        });
    }

    else if (commandName === 'shop') {
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
                        items.forEach((r, i) => {
                            const duree = r.duration === 0 ? "permanent" : `${r.duration}h`;
                            const desc  = r.description ? ` — *${r.description}*` : '';
                            msg += `   ↳ **${i + 1}.** 🪙 ${r.price} coins (${duree})${desc}\n`;
                        });
                    }
                });
            });

            msg += "\nPour acheter : `/buy <nom du rôle>` ou `/buy <nom du rôle> <numéro>` si plusieurs options";
            reply(msg);
        });
    }

    else if (commandName === 'buy') {
        const roleName  = interaction.options.getString('role');
        const choiceNum = interaction.options.getInteger('numero');

        db.all(`SELECT * FROM shop WHERE guildId = ? AND LOWER(roleName) = LOWER(?)`, [guildId, roleName], async (err, shopItems) => {
            if (!shopItems || shopItems.length === 0) { reply(`❌ Rôle "${roleName}" introuvable dans le shop.`); return; }

            if (shopItems.length > 1 && !choiceNum) {
                let msg = `🛒 Plusieurs options pour **${roleName}** :\n\n`;
                shopItems.forEach((item, i) => {
                    const duree = item.duration === 0 ? "permanent" : `${item.duration}h`;
                    msg += `**${i + 1}.** 🪙 ${item.price} coins (${duree})\n`;
                });
                msg += `\nPour choisir : \`/buy ${roleName} <numéro>\``;
                reply(msg);
                return;
            }

            const shopItem = choiceNum ? shopItems[choiceNum - 1] : shopItems[0];
            if (!shopItem) { reply(`❌ Numéro invalide, choisis entre 1 et ${shopItems.length}.`); return; }

            db.get(`SELECT * FROM users WHERE userId = ? AND guildId = ?`, [userId, guildId], async (err2, row) => {
                if (!row || row.coins < shopItem.price) {
                    reply(`❌ Pas assez de coins. Il te faut 🪙 **${shopItem.price}**, tu en as **${row?.coins ?? 0}**.`);
                    return;
                }

                const role = guild.roles.cache.get(shopItem.roleId);
                if (!role) { reply("❌ Ce rôle n'existe plus sur le serveur."); return; }
                if (member.roles.cache.has(role.id)) { reply("❌ Tu as déjà ce rôle."); return; }

                await member.roles.add(role).catch(err3 => sendLog(guild, `❌ ERREUR ajout rôle shop : ${err3.message}`));
                db.run(`UPDATE users SET coins = coins - ? WHERE userId = ? AND guildId = ?`, [shopItem.price, userId, guildId]);

                if (shopItem.duration > 0) {
                    const expiresAt = now + shopItem.duration * 3600000;
                    db.run(`INSERT OR REPLACE INTO role_expirations (userId, guildId, roleId, expiresAt) VALUES (?, ?, ?, ?)`,
                        [userId, guildId, shopItem.roleId, expiresAt]);
                    reply(`✅ Tu as acheté le rôle **${role.name}** pour 🪙 ${shopItem.price} coins ! Il expirera dans **${shopItem.duration}h**.`);
                } else {
                    reply(`✅ Tu as acheté le rôle **${role.name}** pour 🪙 ${shopItem.price} coins !`);
                }

                if (shopItem.category === 'demande') {
                    const ticketCategory = guild.channels.cache.find(c => c.name.toLowerCase() === 'tickets' && c.type === 4);
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
                        ticketChannel.send(`👋 <@${userId}> a acheté le rôle **${role.name}**.\nUn OP va traiter ta demande ici.${opRole ? ` <@&${opRole.id}>` : ''}`);
                        sendLog(guild, `🎫 Ticket créé : ${ticketChannel.name} pour ${member.user.tag}`);
                    }
                }
            });
        });
    }

    else if (commandName === 'roles') {
        db.all(`SELECT * FROM role_expirations WHERE userId = ? AND guildId = ?`, [userId, guildId], (err, rows) => {
            if (!rows || rows.length === 0) { reply("Tu n'as aucun rôle acheté en cours."); return; }

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

            reply(msg);
        });
    }

    else if (commandName === 'pause') {
        const roleName = interaction.options.getString('role');

        db.all(`SELECT * FROM role_expirations WHERE userId = ? AND guildId = ?`, [userId, guildId], async (err, rows) => {
            if (!rows || rows.length === 0) { reply("❌ Tu n'as aucun rôle temporaire."); return; }

            const row = rows.find(r => {
                const role = guild.roles.cache.get(r.roleId);
                return role && role.name.toLowerCase() === roleName.toLowerCase();
            });

            if (!row) { reply("❌ Tu n'as pas ce rôle ou il est permanent."); return; }
            if (row.expiresAt < 0) { reply("❌ Ce rôle est déjà en pause."); return; }

            const role = guild.roles.cache.get(row.roleId);
            if (!role) { reply("❌ Ce rôle n'existe plus."); return; }

            const remainingMs = row.expiresAt - Date.now();
            if (remainingMs <= 0) { reply("❌ Ce rôle a déjà expiré."); return; }

            await member.roles.remove(role).catch(err => sendLog(guild, `❌ ERREUR pause : ${err.message}`));
            db.run(`UPDATE role_expirations SET expiresAt = ? WHERE userId = ? AND guildId = ? AND roleId = ?`,
                [-remainingMs, userId, guildId, row.roleId]);

            const h = Math.floor(remainingMs / 3600000);
            const m = Math.floor((remainingMs % 3600000) / 60000);
            reply(`⏸️ Le rôle **${role.name}** est en pause. Il te reste **${h}h${m}m**.`);
        });
    }

    else if (commandName === 'unpause') {
        const roleName = interaction.options.getString('role');

        db.all(`SELECT * FROM role_expirations WHERE userId = ? AND guildId = ? AND expiresAt < 0`, [userId, guildId], async (err, rows) => {
            if (!rows || rows.length === 0) { reply("❌ Tu n'as aucun rôle en pause."); return; }

            const row = rows.find(r => {
                const role = guild.roles.cache.get(r.roleId);
                return role && role.name.toLowerCase() === roleName.toLowerCase();
            });

            if (!row) { reply("❌ Ce rôle n'est pas en pause."); return; }

            const role = guild.roles.cache.get(row.roleId);
            if (!role) { reply("❌ Ce rôle n'existe plus."); return; }

            const remainingMs  = -row.expiresAt;
            const newExpiresAt = Date.now() + remainingMs;

            await member.roles.add(role).catch(err => sendLog(guild, `❌ ERREUR unpause : ${err.message}`));
            db.run(`UPDATE role_expirations SET expiresAt = ? WHERE userId = ? AND guildId = ? AND roleId = ?`,
                [newExpiresAt, userId, guildId, row.roleId]);

            const h = Math.floor(remainingMs / 3600000);
            const m = Math.floor((remainingMs % 3600000) / 60000);
            reply(`▶️ Le rôle **${role.name}** a repris. Il expirera dans **${h}h${m}m**.`);
        });
    }

    else if (commandName === 'idea') {
        const idea = interaction.options.getString('idee').toLowerCase().trim();

        db.get(`SELECT * FROM banned_ideas WHERE userId = ? AND guildId = ?`, [userId, guildId], (err, banned) => {
            if (banned) { reply("❌ Tu ne peux plus soumettre d'idées.", true); return; }

            db.get(`SELECT * FROM ideas WHERE guildId = ? AND LOWER(idea) = ?`, [guildId, idea], (err2, existing) => {
                if (existing) { reply("❌ Cette idée existe déjà dans la liste !", true); return; }

                db.run(`INSERT INTO ideas (guildId, userId, idea, timestamp) VALUES (?, ?, ?, ?)`,
                    [guildId, userId, idea, Date.now()]);

                const suggestionsChannel = getSuggestionsChannel(guild);
                if (suggestionsChannel) suggestionsChannel.send(`💡 Idée enregistrée par <@${userId}> : **${idea}**`);

                reply("💡 Idée enregistrée !", true);
            });
        });
    }

    else if (commandName === 'addshop') {
        if (!isAdmin(member, guild)) { reply("❌ Réservé aux OP et au créateur.", true); return; }

        const price       = interaction.options.getInteger('prix');
        const duration    = interaction.options.getInteger('duree');
        const category    = interaction.options.getString('categorie');
        const roleM       = interaction.options.getRole('role');
        const description = interaction.options.getString('description') || '';

        db.run(`INSERT INTO shop (guildId, roleId, roleName, price, duration, description, category) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [guildId, roleM.id, roleM.name, price, duration, description, category]);

        const durationText = duration === 0 ? "permanent" : `${duration}h`;
        reply(`✅ **${roleM.name}** ajouté au shop (${category}) pour 🪙 ${price} coins (${durationText})${description ? ` — ${description}` : ''}.`);
    }

    else if (commandName === 'removeshop') {
        if (!isAdmin(member, guild)) { reply("❌ Réservé aux OP et au créateur.", true); return; }

        const itemName = interaction.options.getString('role');
        db.run(`DELETE FROM shop WHERE guildId = ? AND LOWER(roleName) = LOWER(?)`, [guildId, itemName], function(err) {
            if (this.changes === 0) reply(`❌ Item "${itemName}" introuvable dans le shop.`);
            else reply(`✅ **${itemName}** retiré du shop.`);
        });
    }

    else if (commandName === 'clearshop') {
        if (!isAdmin(member, guild)) { reply("❌ Réservé aux OP et au créateur.", true); return; }
        db.run(`DELETE FROM shop WHERE guildId = ?`, [guildId]);
        reply("✅ Le shop a été vidé.");
    }

    else if (commandName === 'setxp') {
        if (!isAdmin(member, guild)) { reply("❌ Réservé aux OP et au créateur.", true); return; }
        const target = interaction.options.getUser('membre');
        const amount = interaction.options.getInteger('xp');
        db.run(`INSERT INTO users (userId, guildId, xp, level, coins) VALUES (?, ?, ?, 0, 0)
                ON CONFLICT(userId, guildId) DO UPDATE SET xp = ?`,
            [target.id, guildId, amount, amount]);
        reply(`✅ XP de <@${target.id}> défini à **${amount}**.`);
    }

    else if (commandName === 'setlevel') {
        if (!isAdmin(member, guild)) { reply("❌ Réservé aux OP et au créateur.", true); return; }
        const target = interaction.options.getUser('membre');
        const level  = interaction.options.getInteger('niveau');
        db.run(`INSERT INTO users (userId, guildId, xp, level, coins) VALUES (?, ?, 0, ?, 0)
                ON CONFLICT(userId, guildId) DO UPDATE SET level = ?, xp = 0`,
            [target.id, guildId, level, level]);
        const targetMember = guild.members.cache.get(target.id);
        if (targetMember) applyRankRoles(targetMember, level);
        reply(`✅ Niveau de <@${target.id}> défini à **${level}**.`);
    }

    else if (commandName === 'setcoins') {
        if (!isAdmin(member, guild)) { reply("❌ Réservé aux OP et au créateur.", true); return; }
        const target = interaction.options.getUser('membre');
        const amount = interaction.options.getInteger('coins');
        db.run(`INSERT INTO users (userId, guildId, xp, level, coins) VALUES (?, ?, 0, 0, ?)
                ON CONFLICT(userId, guildId) DO UPDATE SET coins = ?`,
            [target.id, guildId, amount, amount]);
        reply(`✅ Coins de <@${target.id}> définis à 🪙 **${amount}**.`);
    }

    else if (commandName === 'ideas') {
        if (!isAdmin(member, guild)) { reply("❌ Réservé aux OP et au créateur.", true); return; }

        const page    = interaction.options.getInteger('page') || 1;
        const perPage = 10;
        const offset  = (page - 1) * perPage;

        db.all(`SELECT COUNT(*) as total FROM ideas WHERE guildId = ?`, [guildId], (err, countRows) => {
            const total      = countRows[0].total;
            const totalPages = Math.ceil(total / perPage);
            if (total === 0) { reply("Aucune idée enregistrée."); return; }

            db.all(`SELECT * FROM ideas WHERE guildId = ? ORDER BY timestamp DESC LIMIT ? OFFSET ?`,
                [guildId, perPage, offset], (err2, rows) => {
                let msg = `💡 **Liste des idées** 💡 — Page ${page}/${totalPages}\n\n`;
                rows.forEach(r => {
                    const date = new Date(r.timestamp).toLocaleDateString('fr-FR');
                    msg += `* #${r.id} <@${r.userId}> (${date}) : ${r.idea}\n`;
                });
                if (page < totalPages) msg += `\nPage suivante : \`/ideas ${page + 1}\``;
                reply(msg);
            });
        });
    }

    else if (commandName === 'removeidea') {
        if (!isAdmin(member, guild)) { reply("❌ Réservé aux OP et au créateur.", true); return; }
        const id = interaction.options.getInteger('id');
        db.run(`DELETE FROM ideas WHERE id = ? AND guildId = ?`, [id, guildId], function(err) {
            if (this.changes === 0) reply(`❌ Idée #${id} introuvable.`);
            else reply(`✅ Idée #${id} supprimée.`);
        });
    }

    else if (commandName === 'clearideas') {
        if (!isAdmin(member, guild)) { reply("❌ Réservé aux OP et au créateur.", true); return; }
        db.run(`DELETE FROM ideas WHERE guildId = ?`, [guildId]);
        reply("✅ Toutes les idées ont été supprimées.");
    }

    else if (commandName === 'banidea') {
        if (!isAdmin(member, guild)) { reply("❌ Réservé aux OP et au créateur.", true); return; }
        const target = interaction.options.getUser('membre');
        db.run(`INSERT OR IGNORE INTO banned_ideas (userId, guildId) VALUES (?, ?)`, [target.id, guildId]);
        reply(`✅ <@${target.id}> ne peut plus soumettre d'idées.`);
    }

    else if (commandName === 'unbanidea') {
        if (!isAdmin(member, guild)) { reply("❌ Réservé aux OP et au créateur.", true); return; }
        const target = interaction.options.getUser('membre');
        db.run(`DELETE FROM banned_ideas WHERE userId = ? AND guildId = ?`, [target.id, guildId]);
        reply(`✅ <@${target.id}> peut à nouveau soumettre des idées.`);
    }

    else if (commandName === 'op') {
        if (userId !== YOUR_USER_ID) { reply("❌ Seul Eugène peut utiliser cette commande.", true); return; }
        const target = interaction.options.getUser('membre');
        const opRole = guild.roles.cache.find(r => r.name === ADMIN_ROLE_NAME);
        if (!opRole) { reply("❌ Le rôle OP n'existe pas sur ce serveur."); return; }
        const targetMember = await guild.members.fetch(target.id).catch(() => null);
        if (!targetMember) { reply("❌ Membre introuvable."); return; }
        await targetMember.roles.add(opRole).catch(err => sendLog(guild, `❌ ERREUR ajout OP : ${err.message}`));
        reply(`✅ <@${target.id}> est maintenant OP.`);
    }

    else if (commandName === 'unop') {
        if (userId !== YOUR_USER_ID) { reply("❌ Seul Eugène peut utiliser cette commande.", true); return; }
        const target = interaction.options.getUser('membre');
        const opRole = guild.roles.cache.find(r => r.name === ADMIN_ROLE_NAME);
        if (!opRole) { reply("❌ Le rôle OP n'existe pas sur ce serveur."); return; }
        const targetMember = await guild.members.fetch(target.id).catch(() => null);
        if (!targetMember) { reply("❌ Membre introuvable."); return; }
        await targetMember.roles.remove(opRole).catch(err => sendLog(guild, `❌ ERREUR retrait OP : ${err.message}`));
        reply(`✅ <@${target.id}> n'est plus OP.`);
    }

    else if (commandName === 'svenladen') {
        const source = guild.channels.cache.find(c => c.name === 'photo-sven');
        if (!source) { reply("❌ Salon photo-sven introuvable."); return; }

        const target = guild.channels.cache.find(c => c.name === 'général' || c.name === 'general');
        if (!target) { reply("❌ Salon général introuvable."); return; }

        const messages = await source.messages.fetch({ limit: 100 });
        const valid    = messages.filter(m => m.attachments.size > 0);
        if (valid.size === 0) { reply("❌ Aucune photo trouvée."); return; }

        const random = valid.random();
        await target.send({ files: [...random.attachments.values()] });
        await interaction.reply({ content: "✅", ephemeral: true });
    }

    else if (commandName === 'bouzelouf') {
        await interaction.reply("https://vm.tiktok.com/znrgljpf9/");
    }

    else if (commandName === 'deletemessage') {
        const bridgeMap = interaction.client.bridgeMap;

        const entry = [...bridgeMap.entries()]
            .reverse()
            .find(([, data]) => data.userId === userId);

        if (!entry) { reply("❌ Aucun message bridgé trouvé.", true); return; }

        const [originalId, { channelId, messageId }] = entry;
        const ch = await interaction.client.channels.fetch(channelId).catch(() => null);
        if (!ch) { reply("❌ Salon introuvable.", true); return; }

        await ch.messages.delete(messageId).catch(() => {});
        bridgeMap.delete(originalId);
        reply("✅ Message supprimé.", true);
    }

    else if (commandName === 'anonyme') {
        const targetId = interaction.client.bridgeChannels?.[interaction.channelId];
        if (!targetId) { reply("❌ Ce salon n'est pas connecté au bridge.", true); return; }

        const texte = interaction.options.getString('message');
        const ch    = await interaction.client.channels.fetch(targetId).catch(() => null);
        if (!ch) { reply("❌ Salon cible introuvable.", true); return; }

        const sent = await ch.send(texte);
        interaction.client.bridgeMap.set(`anon-${Date.now()}`, { channelId: targetId, messageId: sent.id, userId: userId });
        reply("✅ Message envoyé anonymement.", true);
    }

    else if (commandName === 'help') {
        const msg =
            "📖 **Commandes disponibles** 📖\n\n" +
            "**Pour tout le monde**\n" +
            "`/rank` — voir ton niveau, XP et coins\n" +
            "`/rank @membre` — voir le profil d'un autre membre\n" +
            "`/top` — top 10 des membres les plus actifs\n" +
            "`/bot` — les 10 membres les moins actifs\n" +
            "`/shop` — voir les rôles disponibles à l'achat\n" +
            "`/buy <nom du rôle>` ou `/buy <nom du rôle> <numéro>` — acheter un rôle\n" +
            "`/roles` — voir tes rôles achetés et leur durée restante\n" +
            "`/pause <nom du rôle>` — mettre en pause un rôle temporaire\n" +
            "`/unpause <nom du rôle>` — reprendre un rôle en pause\n" +
            "`/idea <ton idée>` — soumettre une idée\n" +
            "`/bouzelouf` — 👀\n" +
            "`/svenladen` — photo aléatoire de Sven\n" +
            "`/help` — voir cette liste\n\n" +
            "**Réservé aux OP et au créateur**\n" +
            "`/addshop <prix> <durée> <catégorie> @rôle <description>` — ajouter un rôle au shop\n" +
            "`/removeshop <nom du rôle>` — retirer un rôle du shop\n" +
            "`/clearshop` — vider tout le shop\n" +
            "`/setxp @membre <nombre>` — modifier l'XP d'un membre\n" +
            "`/setlevel @membre <nombre>` — modifier le niveau d'un membre\n" +
            "`/setcoins @membre <nombre>` — modifier les coins d'un membre\n" +
            "`/ideas <page>` — voir toutes les idées soumises\n" +
            "`/removeidea <id>` — supprimer une idée\n" +
            "`/clearideas` — supprimer toutes les idées\n" +
            "`/banidea @membre` — empêcher quelqu'un de soumettre des idées\n" +
            "`/unbanidea @membre` — réautoriser quelqu'un à soumettre des idées\n" +
            "`/op @membre` — donner le rôle OP (Eugène uniquement)\n" +
            "`/unop @membre` — retirer le rôle OP (Eugène uniquement)";

        reply(msg);
    }

    else if (commandName === 'tg') {
        if (!isAdmin(member, guild)) { reply("❌ Réservé aux OP.", true); return; }
        const target = interaction.options.getUser('membre');

        const tgListener = async (msg) => {
            if (msg.author.id === target.id && msg.guildId === guildId) {
                msg.channel.send(`ta gueule <@${target.id}>`);
            }
        };

        interaction.client.on('messageCreate', tgListener);
        setTimeout(() => interaction.client.off('messageCreate', tgListener), 300000);
        reply(`✅ <@${target.id}> va se faire taire pendant 5 minutes.`);
    }

    else if (commandName === 'ping') {
        if (!isAdmin(member, guild)) { reply("❌ Réservé aux OP.", true); return; }
        const target = interaction.options.getUser('membre');

        await interaction.reply("✅ Ping en cours...");

        let msg = '';
        for (let i = 0; i < 100; i++) msg += `<@${target.id}> `;
        for (let i = 0; i < 100; i++) {
            await interaction.channel.send(`<@${target.id}>`);
        }
    }

    else if (commandName === 'topmonth') {
        const now   = new Date();
        const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

        db.all(`SELECT userId, SUM(count) as total FROM monthly_activity 
                WHERE guildId = ? AND month = ? 
                GROUP BY userId 
                ORDER BY total DESC LIMIT 10`,
            [guildId, month], async (err, rows) => {

            if (!rows || rows.length === 0) { reply("Aucun joueur actif ce mois-ci."); return; }

            let msg  = `🏆 **Top du mois (${month})** 🏆\n\n`;
            let rank = 1;

            for (const u of rows) {
                const m = await guild.members.fetch(u.userId).catch(() => null);
                if (!m) continue;
                msg += `#${rank} <@${u.userId}> — ${u.total} activités ce mois\n`;
                rank++;
            }

            reply(msg);
        });
    }

    else if (commandName === 'setchannel') {
        if (!isAdmin(member, guild)) { reply("❌ Réservé aux OP et au créateur.", true); return; }

        const type   = interaction.options.getString('type');
        const salon  = interaction.options.getChannel('salon');
        const { channelOverrides } = require('./config');

        if (!channelOverrides.has(guildId)) channelOverrides.set(guildId, {});
        channelOverrides.get(guildId)[type] = salon.name;

        const typeNames = {
            levelup:     'Level Up',
            commande:    'Commande',
            logs:        'Logs',
            suggestions: 'Suggestions idées'
        };

        reply(`✅ Salon **${typeNames[type]}** défini sur ${salon}.`);
    }

}

module.exports = { handleInteraction };
