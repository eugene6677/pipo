// ============================================================
// 📋 DÉFINITION DES SLASH COMMANDS
// ============================================================

const { SlashCommandBuilder } = require('discord.js');

const commands = [

    new SlashCommandBuilder()
        .setName('rank')
        .setDescription('Voir ton niveau, XP et coins')
        .addUserOption(o => o.setName('membre').setDescription('Membre à consulter')),

    new SlashCommandBuilder()
        .setName('top')
        .setDescription('Top 10 des membres les plus actifs'),

    new SlashCommandBuilder()
        .setName('bot')
        .setDescription('Les 10 membres les moins actifs'),

    new SlashCommandBuilder()
        .setName('shop')
        .setDescription('Voir les rôles disponibles à l\'achat'),

    new SlashCommandBuilder()
        .setName('buy')
        .setDescription('Acheter un rôle dans le shop')
        .addStringOption(o => o.setName('role').setDescription('Nom du rôle').setRequired(true))
        .addIntegerOption(o => o.setName('numero').setDescription('Numéro si plusieurs options')),

    new SlashCommandBuilder()
        .setName('roles')
        .setDescription('Voir tes rôles achetés et leur durée restante'),

    new SlashCommandBuilder()
        .setName('pause')
        .setDescription('Mettre en pause un rôle temporaire')
        .addStringOption(o => o.setName('role').setDescription('Nom du rôle').setRequired(true)),

    new SlashCommandBuilder()
        .setName('unpause')
        .setDescription('Reprendre un rôle en pause')
        .addStringOption(o => o.setName('role').setDescription('Nom du rôle').setRequired(true)),

    new SlashCommandBuilder()
        .setName('idea')
        .setDescription('Soumettre une idée')
        .addStringOption(o => o.setName('idee').setDescription('Ton idée').setRequired(true)),

    new SlashCommandBuilder()
        .setName('help')
        .setDescription('Voir toutes les commandes'),

    new SlashCommandBuilder()
        .setName('bouzelouf')
        .setDescription('👀'),

    new SlashCommandBuilder()
        .setName('svenladen')
        .setDescription('Envoie une photo aléatoire de Sven dans le général'),

    // OP et créateur
    new SlashCommandBuilder()
        .setName('addshop')
        .setDescription('Ajouter un rôle au shop')
        .addIntegerOption(o => o.setName('prix').setDescription('Prix en coins').setRequired(true))
        .addIntegerOption(o => o.setName('duree').setDescription('Durée en heures (0 = permanent)').setRequired(true))
        .addStringOption(o => o.setName('categorie').setDescription('Catégorie').setRequired(true)
            .addChoices(
                { name: 'Déco', value: 'deco' },
                { name: 'Demande', value: 'demande' },
                { name: 'Perms', value: 'perms' }
            ))
        .addRoleOption(o => o.setName('role').setDescription('Rôle à vendre').setRequired(true))
        .addStringOption(o => o.setName('description').setDescription('Description optionnelle')),

    new SlashCommandBuilder()
        .setName('removeshop')
        .setDescription('Retirer un rôle du shop')
        .addStringOption(o => o.setName('role').setDescription('Nom du rôle').setRequired(true)),

    new SlashCommandBuilder()
        .setName('clearshop')
        .setDescription('Vider tout le shop'),

    new SlashCommandBuilder()
        .setName('setxp')
        .setDescription('Modifier l\'XP d\'un membre')
        .addUserOption(o => o.setName('membre').setDescription('Membre').setRequired(true))
        .addIntegerOption(o => o.setName('xp').setDescription('Quantité d\'XP').setRequired(true)),

    new SlashCommandBuilder()
        .setName('setlevel')
        .setDescription('Modifier le niveau d\'un membre')
        .addUserOption(o => o.setName('membre').setDescription('Membre').setRequired(true))
        .addIntegerOption(o => o.setName('niveau').setDescription('Niveau').setRequired(true)),

    new SlashCommandBuilder()
        .setName('setcoins')
        .setDescription('Modifier les coins d\'un membre')
        .addUserOption(o => o.setName('membre').setDescription('Membre').setRequired(true))
        .addIntegerOption(o => o.setName('coins').setDescription('Quantité de coins').setRequired(true)),

    new SlashCommandBuilder()
        .setName('ideas')
        .setDescription('Voir toutes les idées soumises')
        .addIntegerOption(o => o.setName('page').setDescription('Numéro de page')),

    new SlashCommandBuilder()
        .setName('removeidea')
        .setDescription('Supprimer une idée')
        .addIntegerOption(o => o.setName('id').setDescription('ID de l\'idée').setRequired(true)),

    new SlashCommandBuilder()
        .setName('clearideas')
        .setDescription('Supprimer toutes les idées'),

    new SlashCommandBuilder()
        .setName('banidea')
        .setDescription('Empêcher quelqu\'un de soumettre des idées')
        .addUserOption(o => o.setName('membre').setDescription('Membre').setRequired(true)),

    new SlashCommandBuilder()
        .setName('unbanidea')
        .setDescription('Réautoriser quelqu\'un à soumettre des idées')
        .addUserOption(o => o.setName('membre').setDescription('Membre').setRequired(true)),

    new SlashCommandBuilder()
        .setName('op')
        .setDescription('Donner le rôle OP (Eugène uniquement)')
        .addUserOption(o => o.setName('membre').setDescription('Membre').setRequired(true)),

    new SlashCommandBuilder()
        .setName('unop')
        .setDescription('Retirer le rôle OP (Eugène uniquement)')
        .addUserOption(o => o.setName('membre').setDescription('Membre').setRequired(true)),

    new SlashCommandBuilder()
        .setName('deletemessage')
        .setDescription('Supprimer ton dernier message bridgé'),

    new SlashCommandBuilder()
        .setName('anonyme')
        .setDescription('Envoyer un message anonyme dans le bridge')
        .addStringOption(o => o.setName('message').setDescription('Ton message').setRequired(true)),

    new SlashCommandBuilder()
        .setName('tg')
        .setDescription('Fait taire un membre pendant 5 minutes (OP uniquement)')
        .addUserOption(o => o.setName('membre').setDescription('Membre').setRequired(true)),

    new SlashCommandBuilder()
        .setName('ping')
        .setDescription('Ping un membre 100 fois (OP uniquement)')
        .addUserOption(o => o.setName('membre').setDescription('Membre').setRequired(true)),

];

module.exports = commands.map(c => c.toJSON());
