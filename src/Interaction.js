import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, ContainerBuilder, EmbedBuilder, ModalBuilder, MessageFlags, OverwriteType, PermissionFlagsBits, SeparatorBuilder, SeparatorSpacingSize, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, TextInputBuilder, TextInputStyle, TextDisplayBuilder, UserSelectMenuBuilder, } from 'discord.js';
import { loadCommands } from './commands.js';
import { addMemberToRole, addGuildLoss, addGuildWin, acceptWar, canAddUserToRole, createWar, createInvite, dodgeWar, finishWar, getGuildById, getMembersByRole, getPendingInviteForTarget, getRoleLabel, isUserInRole, refreshGuildPanel, removeMemberFromRole, setInviteStatus, validateInviteForAction, getWarById, createWager, getWagerById, recordWagerAcceptance, markWagerAccepted, dodgeWager, closeWager, } from './database.js';
const ADD_ACTION_MAP = {
    ADD_CO_LEADER: 'CO_LEADER',
    ADD_MANAGER: 'MANAGER',
    ADD_MAIN: 'MAIN',
    ADD_SUB: 'SUB',
};
const FIXED_ROLE_IDS = {
    GUILD_LEADER: '1470554671944040605',
    GUILD_CO_LEADER: '1470554673038496018',
    MANAGER_GUILD: '1470554674435326146',
};
const PANEL_ADMIN_ROLE_IDS = [
    '1470554645364478016',
    '1470554652264108204',
    '1470554648568926219',
];
const WAR_ROLE_IDS = {
    GUILD_LEADER: '1470554671944040605',
    GUILD_CO_LEADER: '1470554673038496018',
    MANAGER_GUILD: '1470554674435326146',
    HOSTER: '1470554662687215741',
    JUNIOR_HOSTER: '1470554664238845962',
    EVENT_HOSTER: '1471561698556121122',
};
const WAR_LOGS_CHANNEL_ID = '1470554839447638088';
const WAR_DODGE_LOGS_CHANNEL_ID = '1473408078358642759';
const WAR_TICKET_PANEL_CHANNEL_ID = '1473103963112083466';
const WAR_TICKETS_CATEGORY_ID = '1485410543824277656';
const WAGER_TICKET_PANEL_CHANNEL_ID = '1470554825501704345';
const WAGER_LOGS_CHANNEL_ID = '1470554840814977247';
const WAGER_DODGE_LOGS_CHANNEL_ID = '1473407994535346177';
const WAGER_TICKETS_CATEGORY_ID = '1473059718250631420';
function getGuildForWarStarter(db, userId) {
    let guild = db
        .prepare('SELECT * FROM Guilds WHERE leaderId = ? OR coLeaderId = ? ORDER BY createdAt ASC LIMIT 1')
        .get(userId, userId);
    if (!guild) {
        guild = db
            .prepare(`SELECT g.*
         FROM Guilds g
         INNER JOIN Managers m ON m.guildId = g.id
         WHERE m.userId = ?
         ORDER BY g.createdAt ASC
         LIMIT 1`)
            .get(userId);
    }
    return guild || null;
}
function getGuildRoleInWar(guild, userId) {
    if (!guild)
        return null;
    if (guild.leaderId === userId)
        return 'LEADER';
    if (guild.coLeaderId === userId)
        return 'CO_LEADER';
    return null;
}
function getGuildRosterAndStaffIds(db, guildId) {
    const guild = getGuildById(db, guildId);
    if (!guild)
        return [];
    const ids = new Set();
    if (guild.leaderId)
        ids.add(guild.leaderId);
    if (guild.coLeaderId)
        ids.add(guild.coLeaderId);
    const managers = db.prepare('SELECT userId FROM Managers WHERE guildId = ?').all(guildId);
    const mains = db.prepare('SELECT userId FROM MainRosters WHERE guildId = ?').all(guildId);
    const subs = db.prepare('SELECT userId FROM SubRosters WHERE guildId = ?').all(guildId);
    for (const row of managers)
        if (row?.userId)
            ids.add(row.userId);
    for (const row of mains)
        if (row?.userId)
            ids.add(row.userId);
    for (const row of subs)
        if (row?.userId)
            ids.add(row.userId);
    return Array.from(ids);
}
function sanitizeWarChannelName(name) {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .slice(0, 80);
}
async function createWarTicketChannel(interaction, db, guildA, guildB) {
    const discordGuild = interaction.guild;
    if (!discordGuild)
        return null;
    const warCategory = await interaction.client.channels.fetch(WAR_TICKETS_CATEGORY_ID).catch(() => null);
    if (!warCategory || warCategory.type !== ChannelType.GuildCategory) {
        console.error(`War category ${WAR_TICKETS_CATEGORY_ID} not found or invalid.`);
        return null;
    }
    const memberIds = new Set([
        ...getGuildRosterAndStaffIds(db, guildA.id),
        ...getGuildRosterAndStaffIds(db, guildB.id),
    ]);
    const permissionOverwrites = [
        {
            id: discordGuild.roles.everyone.id,
            type: OverwriteType.Role,
            deny: [PermissionFlagsBits.ViewChannel],
        },
    ];
    const hosterRole = discordGuild.roles.cache.get(WAR_ROLE_IDS.HOSTER)
        || (await discordGuild.roles.fetch(WAR_ROLE_IDS.HOSTER).catch(() => null));
    if (hosterRole) {
        permissionOverwrites.push({
            id: hosterRole.id,
            type: OverwriteType.Role,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
        });
    }
    const juniorHosterRole = discordGuild.roles.cache.get(WAR_ROLE_IDS.JUNIOR_HOSTER)
        || (await discordGuild.roles.fetch(WAR_ROLE_IDS.JUNIOR_HOSTER).catch(() => null));
    if (juniorHosterRole) {
        permissionOverwrites.push({
            id: juniorHosterRole.id,
            type: OverwriteType.Role,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
        });
    }
    const eventHosterRole = discordGuild.roles.cache.get(WAR_ROLE_IDS.EVENT_HOSTER)
        || (await discordGuild.roles.fetch(WAR_ROLE_IDS.EVENT_HOSTER).catch(() => null));
    if (eventHosterRole) {
        permissionOverwrites.push({
            id: eventHosterRole.id,
            type: OverwriteType.Role,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
        });
    }
    for (const memberId of memberIds) {
        const member = await discordGuild.members.fetch(memberId).catch(() => null);
        if (!member)
            continue;
        permissionOverwrites.push({
            id: member.id,
            type: OverwriteType.Member,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
        });
    }
    const channelName = sanitizeWarChannelName(`${guildA.name} vs ${guildB.name}`);
    const channel = await discordGuild.channels
        .create({
        name: channelName,
        type: ChannelType.GuildText,
        parent: WAR_TICKETS_CATEGORY_ID,
        permissionOverwrites,
    })
        .catch((error) => {
        console.error('Failed to create war ticket channel:', error);
        return null;
    });
    if (!channel)
        return null;
    const warConfirmationContainer = new ContainerBuilder()
        .setAccentColor(40192)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# <:deepwoken:1470975025988501515> War Confirmation\nWar between: **${guildA.name}** vs **${guildB.name}**`))
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('\nℹ️ Waiting for confirmation from the opponent team (Leader/Co-leader).\n\nUse the buttons below:\n• **Accept War** — confirm the war\n• **Dodge** — cancel the war'));
    const initialMessage = await channel.send({
        flags: MessageFlags.IsComponentsV2,
        components: [warConfirmationContainer],
    }).catch((error) => {
        console.error('Failed to send war ticket message:', error);
        return null;
    });
    if (!initialMessage) {
        await channel.delete('Failed to initialize war ticket message').catch(() => null);
        return null;
    }
    const warId = createWar(db, guildA.id, guildB.id, channel.id, interaction.user.id, initialMessage.id);
    const actionRow = new ActionRowBuilder().addComponents(new ButtonBuilder()
        .setCustomId(`wt_accept|${warId}`)
        .setLabel('Accept War')
        .setStyle(ButtonStyle.Success), new ButtonBuilder()
        .setCustomId(`wt_dodge|${warId}`)
        .setLabel('Dodge')
        .setStyle(ButtonStyle.Danger));
    await initialMessage.edit({
        components: [warConfirmationContainer, actionRow],
    }).catch((error) => {
        console.error('Failed to add war ticket buttons:', error);
    });
    return channel;
}
function getDiscordRoleIdForRoleType(roleType) {
    if (roleType === 'CO_LEADER')
        return FIXED_ROLE_IDS.GUILD_CO_LEADER;
    if (roleType === 'MANAGER')
        return FIXED_ROLE_IDS.MANAGER_GUILD;
    return null;
}
function getDiscordGuildIdFromInternalGuildId(guildId) {
    const directSnowflake = /^\d{17,20}$/;
    if (directSnowflake.test(guildId))
        return guildId;
    const prefixedSnowflake = /^(\d{17,20})-/;
    const match = guildId.match(prefixedSnowflake);
    if (match?.[1])
        return match[1];
    return guildId;
}
async function assignDiscordRoleById(client, guildId, targetUserId, roleId) {
    const guild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
    if (!guild) {
        console.warn(`Guild ${guildId} not found while assigning role ${roleId}.`);
        return false;
    }
    const role = guild.roles.cache.get(roleId) || (await guild.roles.fetch(roleId).catch(() => null));
    if (!role) {
        console.warn(`Role ${roleId} not found in guild ${guild.id}.`);
        return false;
    }
    const member = await guild.members.fetch(targetUserId).catch(() => null);
    if (!member) {
        console.warn(`Member ${targetUserId} not found in guild ${guild.id}.`);
        return false;
    }
    const added = await member.roles.add(role).catch((error) => {
        console.warn(`Failed to add role ${roleId} to ${targetUserId}:`, error);
        return null;
    });
    return !!added;
}
function shouldKeepRoleForUser(db, userId, roleType) {
    if (roleType === 'CO_LEADER') {
        const row = db.prepare('SELECT COUNT(*) as count FROM Guilds WHERE coLeaderId = ?').get(userId);
        return (row?.count || 0) > 0;
    }
    if (roleType === 'MANAGER') {
        const row = db.prepare('SELECT COUNT(*) as count FROM Managers WHERE userId = ?').get(userId);
        return (row?.count || 0) > 0;
    }
    return true;
}
async function maybeRemoveDiscordRoleByType(interaction, db, targetUserId, roleType) {
    const guild = interaction.guild;
    if (!guild)
        return;
    const roleId = getDiscordRoleIdForRoleType(roleType);
    if (!roleId)
        return;
    if (shouldKeepRoleForUser(db, targetUserId, roleType))
        return;
    const role = guild.roles.cache.get(roleId) || (await guild.roles.fetch(roleId).catch(() => null));
    if (!role)
        return;
    const member = await guild.members.fetch(targetUserId).catch(() => null);
    if (!member)
        return;
    await member.roles.remove(role).catch((error) => {
        console.warn(`Failed to remove role ${roleId} from ${targetUserId}:`, error);
    });
}
function parseCustomId(customId) {
    return customId.split('|');
}
function parseWarScore(value) {
    if (value === '2-1')
        return { winnerScore: 2, loserScore: 1 };
    if (value === '3-0')
        return { winnerScore: 3, loserScore: 0 };
    return null;
}
function parseRoundDowns(value) {
    const trimmed = value.trim();
    if (!trimmed)
        return null;
    const normalized = trimmed
        .replace(/[xX:,/|]/g, '-')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-');
    const match = normalized.match(/^(\d+)-(\d+)$/);
    if (!match)
        return null;
    const winnerDowns = Number(match[1]);
    const loserDowns = Number(match[2]);
    if (!Number.isFinite(winnerDowns) || !Number.isFinite(loserDowns))
        return null;
    if (winnerDowns < 0 || loserDowns < 0)
        return null;
    return { winnerDowns, loserDowns };
}
function formatMvpValue(rawValue) {
    const value = (rawValue || '').trim();
    if (!value)
        return 'not provided';
    const mentionMatch = value.match(/^<@!?(\d{17,20})>$/);
    if (mentionMatch)
        return `<@${mentionMatch[1]}>`;
    const idMatch = value.match(/^(\d{17,20})$/);
    if (idMatch)
        return `<@${idMatch[1]}>`;
    return value;
}
function buildWarLogsContainer(winnerGuildName, loserGuildName, winnerScore, loserScore, clipsLink, roundDowns = null, mvpValue = null, roundSummary = null) {
    const totalRounds = Math.max(1, winnerScore + loserScore);
    const roundWinners = [];
    for (let i = 0; i < totalRounds; i += 1) {
        roundWinners.push(i < winnerScore ? winnerGuildName : loserGuildName);
    }
    const roundsText = roundSummary && roundSummary.trim()
        ? `### Round Details\n\n${roundSummary.trim()}`
        : roundWinners
            .map((roundWinner, index) => {
            const round = roundDowns?.[index] || { winnerDowns: 0, loserDowns: 0 };
            return (`**Round ${index + 1}**\n\n` +
                `${winnerGuildName}: ${round.winnerDowns} downs\n` +
                `${loserGuildName}: ${round.loserDowns} downs\n\n` +
                `## ${roundWinner} WINS`);
        })
            .join('\n\n');
    return new ContainerBuilder()
        .setAccentColor(0x2a8900)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# <:deepwoken:1470975025988501515> War Logs\n\n## ${winnerGuildName} VS ${loserGuildName}\n### Final Score: **${winnerScore} x ${loserScore}**`))
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`\n${roundsText}`))
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ${winnerGuildName} WINS\n\n` +
        `-# CLIPE: ${clipsLink ? clipsLink.split('\n').map((link, index) => `[Link ${index + 1}](${link})`).join('\n-# CLIPE: ') : 'not provided'}\n` +
        `-# MVP: ${formatMvpValue(mvpValue)}`));
}
function buildWagerLogsContainer(title, teamA, teamB, details, footer) {
    return new ContainerBuilder()
        .setAccentColor(0x2a8900)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# <:deepwoken:1470975025988501515> Wager Logs\n\n## ${teamA} VS ${teamB}\n${title}`))
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(details))
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(footer));
}
function formatWagerTeam(teamIds) {
    return teamIds
        .filter((v) => !!v)
        .map((id) => `<@${id}>`)
        .join(' + ');
}
function isValidClipLink(value) {
    return /^https?:\/\/\S+$/i.test(value);
}
function canMemberFinalizeTicket(member) {
    if (!member)
        return false;
    return (member.roles.cache.has(WAR_ROLE_IDS.HOSTER)
        || member.roles.cache.has(WAR_ROLE_IDS.JUNIOR_HOSTER)
        || member.roles.cache.has(WAR_ROLE_IDS.EVENT_HOSTER));
}
async function finalizeWarAndLog(interaction, client, db, war, winnerGuildId, winnerScore, loserScore, clipsLink, roundDowns = null, mvpValue = null, roundSummary = null) {
    const loserGuildId = winnerGuildId === war.openerGuildId ? war.opponentGuildId : war.openerGuildId;
    addGuildWin(db, winnerGuildId);
    addGuildLoss(db, loserGuildId);
    finishWar(db, war.id, winnerGuildId, winnerScore, loserScore, clipsLink);
    await refreshGuildPanel(client, db, winnerGuildId).catch(() => { });
    await refreshGuildPanel(client, db, loserGuildId).catch(() => { });
    const winnerGuild = getGuildById(db, winnerGuildId);
    const loserGuild = getGuildById(db, loserGuildId);
    const warLogsChannel = await interaction.client.channels.fetch(WAR_LOGS_CHANNEL_ID).catch(() => null);
    if (warLogsChannel && warLogsChannel.isTextBased() && 'send' in warLogsChannel) {
        const resultContainer = buildWarLogsContainer(winnerGuild?.name || 'Guild A', loserGuild?.name || 'Guild B', winnerScore, loserScore, clipsLink, roundDowns, mvpValue, roundSummary);
        await warLogsChannel.send({
            flags: MessageFlags.IsComponentsV2,
            components: [resultContainer],
        });
    }
    return { winnerGuild, loserGuild };
}
function getGuildActorRole(db, guildId, userId) {
    const guild = getGuildById(db, guildId);
    if (!guild)
        return null;
    if (guild.leaderId === userId)
        return 'LEADER';
    if (guild.coLeaderId === userId)
        return 'CO_LEADER';
    const isManager = !!db.prepare('SELECT 1 FROM Managers WHERE guildId = ? AND userId = ?').get(guildId, userId);
    if (isManager)
        return 'MANAGER';
    return null;
}
function getGuildActorRoleFromDiscordRoles(member) {
    if (!member)
        return null;
    if (member.roles.cache.has(WAR_ROLE_IDS.GUILD_LEADER) || member.roles.cache.has(FIXED_ROLE_IDS.GUILD_LEADER))
        return 'LEADER';
    if (member.roles.cache.has(WAR_ROLE_IDS.GUILD_CO_LEADER) || member.roles.cache.has(FIXED_ROLE_IDS.GUILD_CO_LEADER))
        return 'CO_LEADER';
    if (member.roles.cache.has(WAR_ROLE_IDS.MANAGER_GUILD) || member.roles.cache.has(FIXED_ROLE_IDS.MANAGER_GUILD))
        return 'MANAGER';
    return null;
}
async function getGuildActorRoleWithPanelAdmin(interaction, db, guildId, userId) {
    const actorRole = getGuildActorRole(db, guildId, userId);
    if (actorRole)
        return actorRole;
    const member = await interaction.guild?.members.fetch(userId).catch(() => null);
    const outerRole = getGuildActorRoleFromDiscordRoles(member);
    if (outerRole)
        return outerRole;
    const isPanelAdmin = !!member && PANEL_ADMIN_ROLE_IDS.some(roleId => member.roles.cache.has(roleId));
    if (isPanelAdmin)
        return 'LEADER';
    return null;
}
function canManageRoleType(actorRole, targetRoleType) {
    if (actorRole === 'LEADER')
        return true;
    if (actorRole === 'CO_LEADER')
        return true;
    if (actorRole === 'MANAGER') {
        return targetRoleType === 'MANAGER' || targetRoleType === 'MAIN' || targetRoleType === 'SUB';
    }
    return false;
}
function getManageableRoleTypes(actorRole) {
    if (actorRole === 'MANAGER')
        return ['MANAGER', 'MAIN', 'SUB'];
    return ['CO_LEADER', 'MANAGER', 'MAIN', 'SUB'];
}
function getRegisteredGuildMemberIds(db, guildId) {
    const guild = getGuildById(db, guildId);
    if (!guild)
        return [];
    const ids = new Set();
    if (guild.leaderId)
        ids.add(guild.leaderId);
    if (guild.coLeaderId)
        ids.add(guild.coLeaderId);
    const managers = db.prepare('SELECT userId FROM Managers WHERE guildId = ?').all(guildId);
    const mains = db.prepare('SELECT userId FROM MainRosters WHERE guildId = ?').all(guildId);
    const subs = db.prepare('SELECT userId FROM SubRosters WHERE guildId = ?').all(guildId);
    for (const row of managers)
        if (row?.userId)
            ids.add(row.userId);
    for (const row of mains)
        if (row?.userId)
            ids.add(row.userId);
    for (const row of subs)
        if (row?.userId)
            ids.add(row.userId);
    return Array.from(ids);
}
function shouldKeepGuildLeaderRole(db, userId) {
    const row = db.prepare('SELECT COUNT(*) as count FROM Guilds WHERE leaderId = ?').get(userId);
    return (row?.count || 0) > 0;
}
async function maybeRemoveGuildLeaderDiscordRole(interaction, db, targetUserId) {
    const guild = interaction.guild;
    if (!guild)
        return;
    if (shouldKeepGuildLeaderRole(db, targetUserId))
        return;
    const roleId = FIXED_ROLE_IDS.GUILD_LEADER;
    const role = guild.roles.cache.get(roleId) || (await guild.roles.fetch(roleId).catch(() => null));
    if (!role)
        return;
    const member = await guild.members.fetch(targetUserId).catch(() => null);
    if (!member)
        return;
    await member.roles.remove(role).catch((error) => {
        console.warn(`Failed to remove role ${roleId} from ${targetUserId}:`, error);
    });
}
async function canUseOwnershipTransfer(interaction, db, guildId, userId) {
    const guild = getGuildById(db, guildId);
    if (!guild)
        return false;
    if (guild.leaderId === userId)
        return true;
    const member = await interaction.guild?.members.fetch(userId).catch(() => null);
    return !!member && PANEL_ADMIN_ROLE_IDS.some(roleId => member.roles.cache.has(roleId));
}
async function replyPermissionError(interaction, message = '❌ You do not have permission to use this panel action.') {
    if (interaction.deferred || interaction.replied) {
        await interaction.editReply({
            content: message,
            components: [],
            embeds: [],
        });
        return;
    }
    await interaction.reply({
        content: message,
        flags: MessageFlags.Ephemeral,
    });
}
function buildInviteDecisionRow(inviteId, roleType) {
    const isRosterInvite = roleType === 'MAIN' || roleType === 'SUB';
    const acceptLabel = isRosterInvite ? 'Join Guild' : 'Accept';
    const declineLabel = isRosterInvite ? "Don't Join" : 'Decline';
    return new ActionRowBuilder().addComponents(new ButtonBuilder()
        .setCustomId(`gp_invite_accept|${inviteId}`)
        .setLabel(acceptLabel)
        .setStyle(ButtonStyle.Success), new ButtonBuilder()
        .setCustomId(`gp_invite_decline|${inviteId}`)
        .setLabel(declineLabel)
        .setStyle(ButtonStyle.Danger));
}
function getRoleInviteTitle(roleType) {
    if (roleType === 'CO_LEADER')
        return ':star: Co-Leader Invitation';
    if (roleType === 'MANAGER')
        return ':open_file_folder: Manager Invitation';
    return ':busts_in_silhouette: Guild Roster Invitation';
}
function buildInviteEmbed(roleType, guildName, inviterNick) {
    const embed = new EmbedBuilder().setColor('#2a8900').setTitle(getRoleInviteTitle(roleType));
    if (roleType === 'CO_LEADER') {
        return embed.setDescription(`You have been invited to become Co-Leader of the guild **"${guildName}"**.\n\n` +
            `As a co-leader, you will have access to manage rosters and help lead the guild.\n\n` +
            `**Guild:** ${guildName}\n` +
            `**Invited by:** ${inviterNick}\n\n` +
            `**Would you like to accept this invitation?**\n\n` +
            `*This invitation was automatically generated by the server bot. If you were not expecting it, you may safely decline.*`);
    }
    if (roleType === 'MANAGER') {
        return embed.setDescription(`You have been invited to be a Manager of the guild **"${guildName}"**.\n\n` +
            `As a manager, you will be able to access and manage the guild panel.\n\n` +
            `**Guild:** ${guildName}\n` +
            `**Invited by:** ${inviterNick}\n\n` +
            `**Would you like to accept this invitation?**\n\n` +
            `*This invitation was automatically generated by the server bot. If you were not expecting it, you may safely decline.*`);
    }
    const rosterLabel = roleType === 'MAIN' ? 'Main Roster' : 'Sub Roster';
    return embed.setDescription(`You have been invited to join the ${rosterLabel} of the guild **"${guildName}"**.\n\n` +
        `**Guild:** ${guildName}\n` +
        `**Roster:** ${rosterLabel}\n` +
        `**Invited by:** ${inviterNick}\n\n` +
        `**Would you like to accept this invitation?**\n\n` +
        `*This invitation was automatically generated by the server bot. If you were not expecting it, you may safely decline.*`);
}
function buildRemovalEmbed(roleType, guildName) {
    return new EmbedBuilder()
        .setColor('#2a8900')
        .setTitle('❌ Role removed')
        .setDescription(`You are no longer part of **${getRoleLabel(roleType)}** in guild **${guildName}**.`);
}
function buildBackToPanelRow(guildId) {
    return new ActionRowBuilder().addComponents(new ButtonBuilder()
        .setCustomId(`gp_back_panel|${guildId}`)
        .setLabel('Back to Panel')
        .setStyle(ButtonStyle.Secondary));
}
function buildGuildPanelButtons(guildId) {
    const row1 = new ActionRowBuilder().addComponents(new ButtonBuilder()
        .setCustomId(`gp_open_add|${guildId}|CO_LEADER`)
        .setLabel('Add Co-Leader')
        .setStyle(ButtonStyle.Primary), new ButtonBuilder()
        .setCustomId(`gp_open_add|${guildId}|MANAGER`)
        .setLabel('Add Manager Guild')
        .setStyle(ButtonStyle.Primary), new ButtonBuilder()
        .setCustomId(`gp_open_add|${guildId}|MAIN`)
        .setLabel('Add Main Roster')
        .setStyle(ButtonStyle.Success));
    const row2 = new ActionRowBuilder().addComponents(new ButtonBuilder()
        .setCustomId(`gp_open_add|${guildId}|SUB`)
        .setLabel('Add Sub Roster')
        .setStyle(ButtonStyle.Success), new ButtonBuilder()
        .setCustomId(`gp_open_remove|${guildId}`)
        .setLabel('Remove Member')
        .setStyle(ButtonStyle.Danger), new ButtonBuilder()
        .setCustomId(`gp_open_transfer|${guildId}`)
        .setLabel('Ownership Transfer')
        .setStyle(ButtonStyle.Secondary));
    const rowLeave = new ActionRowBuilder().addComponents(new ButtonBuilder()
        .setCustomId(`gp_leave_guild|${guildId}`)
        .setLabel('Leave Guild')
        .setStyle(ButtonStyle.Danger));
    return [row1, row2, rowLeave];
}
function buildGuildPanelEmbedForInteraction(db, guildId) {
    const guild = getGuildById(db, guildId);
    if (!guild)
        return null;
    const coLeader = guild.coLeaderId;
    const managersCount = db.prepare('SELECT COUNT(*) as count FROM Managers WHERE guildId = ?').get(guild.id)?.count || 0;
    const mainsCount = db.prepare('SELECT COUNT(*) as count FROM MainRosters WHERE guildId = ?').get(guild.id)?.count || 0;
    const subsCount = db.prepare('SELECT COUNT(*) as count FROM SubRosters WHERE guildId = ?').get(guild.id)?.count || 0;
    return new EmbedBuilder()
        .setTitle(`🏰 ${guild.name}`)
        .setColor('#2a8900')
        .addFields({ name: 'Leader', value: `<@${guild.leaderId}>`, inline: true }, { name: 'Co-Leader', value: coLeader ? `<@${coLeader}>` : 'None', inline: true }, { name: 'Region', value: guild.region, inline: true }, { name: 'Managers', value: `${managersCount}/2`, inline: true }, { name: 'Main Roster', value: `${mainsCount}/5`, inline: true }, { name: 'Sub Roster', value: `${subsCount}/5`, inline: true })
        .setThumbnail(guild.imageUrl || null);
}
async function handleAdminWinModal(interaction, db) {
    const customId = interaction.customId;
    // Legacy handler for old admin_win_modal
    if (customId.startsWith('admin_win_modal|')) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const [, guildId] = parseCustomId(customId);
        if (!guildId) {
            await interaction.editReply({
                content: '❌ Invalid guild ID.',
            });
            return;
        }
        const winsValue = interaction.fields.getTextInputValue('wins')?.trim();
        const lossesValue = interaction.fields.getTextInputValue('losses')?.trim();
        const reason = interaction.fields.getTextInputValue('reason')?.trim();
        if (!reason) {
            await interaction.editReply({
                content: '❌ Reason is required.',
            });
            return;
        }
        const guild = getGuildById(db, guildId);
        if (!guild) {
            await interaction.editReply({
                content: '❌ Guild not found.',
            });
            return;
        }
        const currentWins = guild.wins || 0;
        const currentLosses = guild.losses || 0;
        let newWins = currentWins;
        let newLosses = currentLosses;
        if (winsValue) {
            const parsedWins = parseInt(winsValue, 10);
            if (isNaN(parsedWins) || parsedWins < 0) {
                await interaction.editReply({
                    content: '❌ Wins must be a non-negative number.',
                });
                return;
            }
            newWins = parsedWins;
        }
        if (lossesValue) {
            const parsedLosses = parseInt(lossesValue, 10);
            if (isNaN(parsedLosses) || parsedLosses < 0) {
                await interaction.editReply({
                    content: '❌ Losses must be a non-negative number.',
                });
                return;
            }
            newLosses = parsedLosses;
        }
        // Update the guild
        db.prepare('UPDATE Guilds SET wins = ?, losses = ? WHERE id = ?').run(newWins, newLosses, guildId);
        // Log the action
        const logChannel = await interaction.client.channels.fetch('1470554772678512794').catch(() => null);
        if (logChannel && logChannel.isTextBased()) {
            await logChannel.send(`📊 Admin W/L Change: Guild "${guild.name}" W/L changed from ${currentWins}/${currentLosses} to ${newWins}/${newLosses} by <@${interaction.user.id}>. Reason: ${reason}`);
        }
        // Refresh guild panel
        await refreshGuildPanel(interaction.client, db, guildId);
        await interaction.editReply({
            content: `✅ Updated ${guild.name}: W/L changed from ${currentWins}/${currentLosses} to ${newWins}/${newLosses}.`,
        });
        return;
    }
}
export async function handleInteractions(interaction, client, db, commands) {
    try {
        // Defer reply only for chat input commands
        if (interaction.isChatInputCommand()) {
            if (interaction && typeof interaction.deferReply === 'function' && !interaction.replied && !interaction.deferred) {
                try {
                    await interaction.deferReply({ flags: 64 }); // ephemeral
                }
                catch (e) {
                    console.warn('Failed to defer reply:', e);
                    const alreadyAcknowledged = e?.code === 40060;
                    if (alreadyAcknowledged) {
                        return;
                    }
                }
            }
        }
        // For components (buttons/select menus), let the handler manage it
        if (interaction.isChatInputCommand()) {
            const command = commands.get(interaction.commandName);
            if (!command) {
                try {
                    console.error(`Command not found: ${interaction.commandName}`);
                    console.error('Available commands:', Array.from(commands.keys()));
                }
                catch (e) {
                    console.error('Failed to log available commands:', e);
                }
                // Try reloading commands from disk (auto-reload).
                try {
                    console.log('Trying to reload commands...');
                    const newCommands = await loadCommands();
                    // update map by reference
                    commands.clear();
                    for (const [k, v] of newCommands.entries())
                        commands.set(k, v);
                    console.log('Commands reloaded:', Array.from(commands.keys()));
                    const retry = commands.get(interaction.commandName);
                    if (retry) {
                        await retry.execute(interaction, db);
                        return;
                    }
                }
                catch (reloadErr) {
                    console.error('Failed to reload commands:', reloadErr);
                }
                await interaction.editReply({
                    content: 'Command not found.',
                });
                return;
            }
            await command.execute(interaction, db);
        }
        if (interaction.isButton()) {
            const customId = interaction.customId;
            if (customId === 'wt_start_open') {
                const member = await interaction.guild?.members.fetch(interaction.user.id).catch(() => null);
                const actorGuild = getGuildForWarStarter(db, interaction.user.id);
                const hasWarPermissionFromRole = !!member &&
                    (member.roles.cache.has(WAR_ROLE_IDS.GUILD_LEADER) ||
                        member.roles.cache.has(WAR_ROLE_IDS.GUILD_CO_LEADER) ||
                        member.roles.cache.has(WAR_ROLE_IDS.MANAGER_GUILD));
                const canOpenWar = hasWarPermissionFromRole || !!actorGuild;
                if (!canOpenWar) {
                    await interaction.reply({
                        content: '❌ Only Guild Leader, Guild Co-Leader, or Manager Guild can open a War Ticket.',
                        flags: MessageFlags.Ephemeral,
                    });
                    return;
                }
                if (!actorGuild) {
                    await interaction.reply({
                        content: '❌ You are not registered as Leader, Co-Leader, or Manager in any guild.',
                        flags: MessageFlags.Ephemeral,
                    });
                    return;
                }
                const guilds = db.prepare('SELECT * FROM Guilds WHERE id != ? ORDER BY name ASC').all(actorGuild.id);
                if (!guilds || guilds.length === 0) {
                    await interaction.reply({
                        content: '❌ No opponent guilds are available right now.',
                        flags: MessageFlags.Ephemeral,
                    });
                    return;
                }
                const totalPages = Math.max(1, Math.ceil(guilds.length / 25));
                const currentPage = 1;
                const menuGuilds = guilds.slice((currentPage - 1) * 25, currentPage * 25);
                const options = menuGuilds.map((guild) => new StringSelectMenuOptionBuilder()
                    .setLabel((guild.name || 'Unknown').slice(0, 100))
                    .setDescription(`Region: ${guild.region || 'Unknown'}`)
                    .setValue(guild.id));
                const selectMenu = new StringSelectMenuBuilder()
                    .setCustomId(`wt_select_opponent|${actorGuild.id}`)
                    .setPlaceholder('Select an opponent guild')
                    .addOptions(options);
                const row = new ActionRowBuilder().addComponents(selectMenu);
                const components = [row];
                if (totalPages > 1) {
                    const pageRow = new ActionRowBuilder().addComponents(new ButtonBuilder()
                        .setCustomId(`wt_select_opponent_page|${actorGuild.id}|${currentPage - 1}`)
                        .setLabel('Previous')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(currentPage <= 1), new ButtonBuilder()
                        .setCustomId(`wt_select_opponent_page|${actorGuild.id}|${currentPage + 1}`)
                        .setLabel('Next')
                        .setStyle(ButtonStyle.Primary)
                        .setDisabled(currentPage >= totalPages));
                    components.push(pageRow);
                }
                const embed = new EmbedBuilder()
                    .setColor('#2a8900')
                    .setTitle('Start War')
                    .setDescription(`Select an opponent guild from the list below to start the war ticket. Page ${currentPage}/${totalPages}.${totalPages > 1 ? ' Use the buttons to change pages.' : ''}`);
                await interaction.reply({
                    embeds: [embed],
                    components,
                    ephemeral: true,
                });
                return;
            }
            if (customId.startsWith('wt_select_opponent_page|')) {
                const [, actorGuildId, pageRaw] = parseCustomId(customId);
                const page = Number(pageRaw) || 1;
                if (!actorGuildId || page < 1) {
                    await interaction.update({
                        content: '❌ Invalid page.',
                        embeds: [],
                        components: [],
                    });
                    return;
                }
                const guilds = db.prepare('SELECT * FROM Guilds WHERE id != ? ORDER BY name ASC').all(actorGuildId);
                if (!guilds || guilds.length === 0) {
                    await interaction.update({
                        content: '❌ No opponent guilds are available right now.',
                        embeds: [],
                        components: [],
                    });
                    return;
                }
                const totalPages = Math.max(1, Math.ceil(guilds.length / 25));
                if (page > totalPages) {
                    await interaction.update({
                        content: '❌ Invalid page.',
                        embeds: [],
                        components: [],
                    });
                    return;
                }
                const menuGuilds = guilds.slice((page - 1) * 25, page * 25);
                const options = menuGuilds.map((guild) => new StringSelectMenuOptionBuilder()
                    .setLabel((guild.name || 'Unknown').slice(0, 100))
                    .setDescription(`Region: ${guild.region || 'Unknown'}`)
                    .setValue(guild.id));
                const selectMenu = new StringSelectMenuBuilder()
                    .setCustomId(`wt_select_opponent|${actorGuildId}`)
                    .setPlaceholder('Select an opponent guild')
                    .addOptions(options);
                const row = new ActionRowBuilder().addComponents(selectMenu);
                const components = [row];
                if (totalPages > 1) {
                    const pageRow = new ActionRowBuilder().addComponents(new ButtonBuilder()
                        .setCustomId(`wt_select_opponent_page|${actorGuildId}|${page - 1}`)
                        .setLabel('Previous')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(page <= 1), new ButtonBuilder()
                        .setCustomId(`wt_select_opponent_page|${actorGuildId}|${page + 1}`)
                        .setLabel('Next')
                        .setStyle(ButtonStyle.Primary)
                        .setDisabled(page >= totalPages));
                    components.push(pageRow);
                }
                const embed = new EmbedBuilder()
                    .setColor('#2a8900')
                    .setTitle('Start War')
                    .setDescription(`Select an opponent guild from the list below to start the war ticket. Page ${page}/${totalPages}. Use the buttons to change pages.`);
                await interaction.update({
                    embeds: [embed],
                    components,
                    content: '',
                });
                return;
            }
            if (customId.startsWith('guild_list_page|')) {
                const [, pageRaw] = parseCustomId(customId);
                const page = Number(pageRaw) || 1;
                const guilds = db.prepare('SELECT * FROM Guilds ORDER BY name ASC').all();
                const totalPages = Math.max(1, Math.ceil(guilds.length / 25));
                if (page < 1 || page > totalPages) {
                    await interaction.update({
                        content: '❌ Invalid page.',
                        embeds: [],
                        components: [],
                    });
                    return;
                }
                const menuGuilds = guilds.slice((page - 1) * 25, page * 25);
                const options = menuGuilds.map((guild) => new StringSelectMenuOptionBuilder()
                    .setLabel(guild.name)
                    .setDescription(`Region: ${guild.region} | Leader: ${guild.leaderId}`)
                    .setValue(guild.id)
                    .setEmoji('🏰'));
                const selectMenu = new StringSelectMenuBuilder()
                    .setCustomId('guild_select')
                    .setPlaceholder('Select a guild to open panel')
                    .addOptions(options);
                const row = new ActionRowBuilder().addComponents(selectMenu);
                const components = [row];
                if (totalPages > 1) {
                    const pageRow = new ActionRowBuilder().addComponents(new ButtonBuilder()
                        .setCustomId(`guild_list_page|${page - 1}`)
                        .setLabel('Previous')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(page <= 1), new ButtonBuilder()
                        .setCustomId(`guild_list_page|${page + 1}`)
                        .setLabel('Next')
                        .setStyle(ButtonStyle.Primary)
                        .setDisabled(page >= totalPages));
                    components.push(pageRow);
                }
                const pageEmbed = new EmbedBuilder()
                    .setTitle('🏰 Registered Guilds')
                    .setDescription(`📊 Total guilds: **${guilds.length}**\n\nSelect a guild from the menu below to open its management panel.\nPage ${page}/${totalPages}.`)
                    .setColor('#2a8900');
                await interaction.update({
                    embeds: [pageEmbed],
                    components,
                    content: '',
                });
                return;
            }
            if (customId.startsWith('guild_delete_page|')) {
                const [, pageRaw] = parseCustomId(customId);
                const page = Number(pageRaw) || 1;
                const guilds = db.prepare('SELECT * FROM Guilds ORDER BY name ASC').all();
                const totalPages = Math.max(1, Math.ceil(guilds.length / 25));
                if (page < 1 || page > totalPages) {
                    await interaction.update({
                        content: '❌ Invalid page.',
                        embeds: [],
                        components: [],
                    });
                    return;
                }
                const menuGuilds = guilds.slice((page - 1) * 25, page * 25);
                const options = menuGuilds.map((guild) => new StringSelectMenuOptionBuilder()
                    .setLabel(guild.name)
                    .setDescription(`Leader: ${guild.leaderId} | Region: ${guild.region}`)
                    .setValue(guild.id)
                    .setEmoji('🏰'));
                const selectMenu = new StringSelectMenuBuilder()
                    .setCustomId('guild_delete_select')
                    .setPlaceholder('Select a guild to delete')
                    .addOptions(options);
                const row = new ActionRowBuilder().addComponents(selectMenu);
                const components = [row];
                if (totalPages > 1) {
                    const pageRow = new ActionRowBuilder().addComponents(new ButtonBuilder()
                        .setCustomId(`guild_delete_page|${page - 1}`)
                        .setLabel('Previous')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(page <= 1), new ButtonBuilder()
                        .setCustomId(`guild_delete_page|${page + 1}`)
                        .setLabel('Next')
                        .setStyle(ButtonStyle.Primary)
                        .setDisabled(page >= totalPages));
                    components.push(pageRow);
                }
                await interaction.update({
                    content: '🗑️ **Select a guild to delete:**',
                    components,
                    embeds: [],
                });
                return;
            }
            if (customId.startsWith('gp_transfer_target_page|')) {
                const [, guildId, pageRaw] = parseCustomId(customId);
                const page = Number(pageRaw) || 1;
                if (!guildId) {
                    await interaction.update({
                        content: '❌ Invalid page.',
                        embeds: [],
                        components: [],
                    });
                    return;
                }
                const guild = getGuildById(db, guildId);
                const allCandidates = getRegisteredGuildMemberIds(db, guildId).filter(userId => userId !== guild?.leaderId);
                const totalPages = Math.max(1, Math.ceil(allCandidates.length / 25));
                if (page < 1 || page > totalPages) {
                    await interaction.update({
                        content: '❌ Invalid page.',
                        embeds: [],
                        components: [],
                    });
                    return;
                }
                const pageCandidates = allCandidates.slice((page - 1) * 25, page * 25);
                const candidateOptions = await Promise.all(pageCandidates.map(async (userId) => {
                    const guildMember = await interaction.guild?.members.fetch(userId).catch(() => null);
                    return new StringSelectMenuOptionBuilder()
                        .setLabel((guildMember?.displayName || userId).slice(0, 100))
                        .setDescription(`ID: ${userId}`)
                        .setValue(userId);
                }));
                const transferSelect = new StringSelectMenuBuilder()
                    .setCustomId(`gp_transfer_target_select|${guildId}`)
                    .setPlaceholder('Select the new guild leader')
                    .addOptions(candidateOptions);
                const components = [
                    new ActionRowBuilder().addComponents(transferSelect),
                ];
                if (totalPages > 1) {
                    const pageRow = new ActionRowBuilder().addComponents(new ButtonBuilder()
                        .setCustomId(`gp_transfer_target_page|${guildId}|${page - 1}`)
                        .setLabel('Previous')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(page <= 1), new ButtonBuilder()
                        .setCustomId(`gp_transfer_target_page|${guildId}|${page + 1}`)
                        .setLabel('Next')
                        .setStyle(ButtonStyle.Primary)
                        .setDisabled(page >= totalPages));
                    components.push(pageRow);
                }
                components.push(buildBackToPanelRow(guildId));
                await interaction.update({
                    content: `Select the new leader for **${getGuildById(db, guildId)?.name || 'guild'}**. Page ${page}/${totalPages}.`,
                    embeds: [],
                    components,
                });
                return;
            }
            if (customId.startsWith('gp_remove_member_page|')) {
                const [, guildId, roleType, pageRaw] = parseCustomId(customId);
                const page = Number(pageRaw) || 1;
                if (!guildId || !roleType) {
                    await interaction.update({
                        content: '❌ Invalid page.',
                        embeds: [],
                        components: [],
                    });
                    return;
                }
                const members = getMembersByRole(db, guildId, roleType);
                if (!members.length) {
                    await interaction.update({
                        content: ` No members found for **${getRoleLabel(roleType)}**.`,
                        components: [],
                        embeds: [],
                    });
                    return;
                }
                const totalPages = Math.max(1, Math.ceil(members.length / 25));
                if (page < 1 || page > totalPages) {
                    await interaction.update({
                        content: '❌ Invalid page.',
                        embeds: [],
                        components: [],
                    });
                    return;
                }
                const pageMembers = members.slice((page - 1) * 25, page * 25);
                const memberOptions = await Promise.all(pageMembers.map(async (userId) => {
                    const guildMember = await interaction.guild?.members.fetch(userId).catch(() => null);
                    return new StringSelectMenuOptionBuilder()
                        .setLabel((guildMember?.displayName || userId).slice(0, 100))
                        .setDescription(`ID: ${userId}`)
                        .setValue(userId);
                }));
                const memberSelect = new StringSelectMenuBuilder()
                    .setCustomId(`gp_remove_member_select|${guildId}|${roleType}`)
                    .setPlaceholder(`Select who to remove from ${getRoleLabel(roleType)}`)
                    .addOptions(memberOptions);
                const components = [
                    new ActionRowBuilder().addComponents(memberSelect),
                ];
                if (totalPages > 1) {
                    const pageRow = new ActionRowBuilder().addComponents(new ButtonBuilder()
                        .setCustomId(`gp_remove_member_page|${guildId}|${roleType}|${page - 1}`)
                        .setLabel('Previous')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(page <= 1), new ButtonBuilder()
                        .setCustomId(`gp_remove_member_page|${guildId}|${roleType}|${page + 1}`)
                        .setLabel('Next')
                        .setStyle(ButtonStyle.Primary)
                        .setDisabled(page >= totalPages));
                    components.push(pageRow);
                }
                components.push(buildBackToPanelRow(guildId));
                await interaction.update({
                    content: `Select the member to remove from **${getRoleLabel(roleType)}**. Page ${page}/${totalPages}.`,
                    components,
                    embeds: [],
                });
                return;
            }
            if (customId.startsWith('wt_accept|')) {
                await interaction.deferUpdate();
                const [, warIdRaw] = parseCustomId(customId);
                const warId = Number(warIdRaw);
                const war = getWarById(db, warId);
                if (!war || war.status !== 'PENDING') {
                    await interaction.followUp({
                        content: '❌ This war is no longer pending.',
                        flags: MessageFlags.Ephemeral,
                    });
                    return;
                }
                const opponentGuild = getGuildById(db, war.opponentGuildId);
                const openerGuild = getGuildById(db, war.openerGuildId);
                const actorRole = getGuildRoleInWar(opponentGuild, interaction.user.id);
                if (!actorRole) {
                    await interaction.followUp({
                        content: '❌ Only the Leader or Co-Leader of the opponent guild can accept this war.',
                        flags: MessageFlags.Ephemeral,
                    });
                    return;
                }
                acceptWar(db, war.id, interaction.user.id, war.opponentGuildId);
                const acceptedContainer = new ContainerBuilder()
                    .setAccentColor(0x2a8900)
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# <:deepwoken:1470975025988501515> War Confirmation\nWar between: ${openerGuild?.name || 'Unknown'} vs ${opponentGuild?.name || 'Unknown'}`))
                    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`✅ War accepted by <@${interaction.user.id}>.\n\nHoster team can proceed with the match details.`));
                await interaction.editReply({
                    components: [acceptedContainer],
                });
                await interaction.channel?.send({
                    content: `<@&${WAR_ROLE_IDS.HOSTER}> <@&${WAR_ROLE_IDS.JUNIOR_HOSTER}> <@&${WAR_ROLE_IDS.EVENT_HOSTER}> war accepted. Please proceed with hosting.`,
                    allowedMentions: { roles: [WAR_ROLE_IDS.HOSTER, WAR_ROLE_IDS.JUNIOR_HOSTER, WAR_ROLE_IDS.EVENT_HOSTER] },
                });
                const finalizeRow = new ActionRowBuilder().addComponents(new ButtonBuilder()
                    .setCustomId(`wt_open_finalize|${war.id}`)
                    .setLabel('Finalize War')
                    .setStyle(ButtonStyle.Primary));
                const finalizeContainer = new ContainerBuilder()
                    .setAccentColor(0x2a8900)
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent('# <:deepwoken:1470975025988501515> Finalize War'))
                    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent('ℹ️ Only Hoster, Junior Hoster, or Event Hoster can finalize the war.\n\nUse the button below to start finalization and choose the winning guild.'))
                    .addActionRowComponents(finalizeRow);
                await interaction.channel?.send({
                    flags: MessageFlags.IsComponentsV2,
                    components: [finalizeContainer],
                });
                return;
            }
            if (customId.startsWith('wt_dodge|')) {
                await interaction.deferUpdate();
                const [, warIdRaw] = parseCustomId(customId);
                const warId = Number(warIdRaw);
                const war = getWarById(db, warId);
                if (!war || !['PENDING', 'ACCEPTED'].includes(war.status)) {
                    await interaction.followUp({
                        content: '❌ This war can no longer be dodged.',
                        flags: MessageFlags.Ephemeral,
                    });
                    return;
                }
                const member = await interaction.guild?.members.fetch(interaction.user.id).catch(() => null);
                const isHosterTeam = !!member && (member.roles.cache.has(WAR_ROLE_IDS.HOSTER)
                    || member.roles.cache.has(WAR_ROLE_IDS.JUNIOR_HOSTER)
                    || member.roles.cache.has(WAR_ROLE_IDS.EVENT_HOSTER));
                // Check if user is leader or co-leader of either guild
                const openerGuild = getGuildById(db, war.openerGuildId);
                const opponentGuild = getGuildById(db, war.opponentGuildId);
                const isGuildLeader = (openerGuild && (openerGuild.leaderId === interaction.user.id || openerGuild.coLeaderId === interaction.user.id))
                    || (opponentGuild && (opponentGuild.leaderId === interaction.user.id || opponentGuild.coLeaderId === interaction.user.id));
                if (!isHosterTeam && !isGuildLeader) {
                    await interaction.followUp({
                        content: '❌ Only guild leaders, co-leaders, Hoster, Junior Hoster, or Event Hoster can use Dodge.',
                        flags: MessageFlags.Ephemeral,
                    });
                    return;
                }
                dodgeWar(db, war.id);
                const dodgeSummary = `⚠️ <@${interaction.user.id}> used Dodge and closed the war ticket (${openerGuild?.name || 'Unknown'} vs ${opponentGuild?.name || 'Unknown'}).`;
                const warDodgeLogsChannel = await interaction.client.channels.fetch(WAR_DODGE_LOGS_CHANNEL_ID).catch(() => null);
                if (warDodgeLogsChannel && warDodgeLogsChannel.isTextBased() && 'send' in warDodgeLogsChannel) {
                    await warDodgeLogsChannel.send({
                        content: dodgeSummary,
                    });
                }
                await interaction.editReply({
                    content: `${dodgeSummary} Closing ticket...`,
                    embeds: [],
                    components: [],
                    allowedMentions: { users: [interaction.user.id] },
                });
                const deleteChannel = async (channel, reason) => {
                    if (!channel || !('delete' in channel))
                        return false;
                    try {
                        await channel.delete(reason);
                        return true;
                    }
                    catch (error) {
                        console.error('Failed to auto-close war ticket after dodge:', error);
                        return false;
                    }
                };
                let deleted = false;
                if (interaction.channel) {
                    deleted = await deleteChannel(interaction.channel, 'War ticket closed after dodge');
                }
                if (!deleted && war.channelId) {
                    const warChannel = await interaction.client.channels.fetch(war.channelId).catch(() => null);
                    if (warChannel) {
                        await deleteChannel(warChannel, 'War ticket closed after dodge (fallback)');
                    }
                }
                return;
            }
            if (customId.startsWith('wt_open_finalize|')) {
                const [, warIdRaw] = parseCustomId(customId);
                const warId = Number(warIdRaw);
                const war = getWarById(db, warId);
                if (!war || !['PENDING', 'ACCEPTED'].includes(war.status)) {
                    await interaction.reply({
                        content: '❌ This war is not available for finalization.',
                        flags: MessageFlags.Ephemeral,
                    });
                    return;
                }
                const member = await interaction.guild?.members.fetch(interaction.user.id).catch(() => null);
                const canFinalize = canMemberFinalizeTicket(member);
                if (!canFinalize) {
                    await interaction.reply({
                        content: '❌ Only Hoster, Junior Hoster, or Event Hoster can finalize this war.',
                        flags: MessageFlags.Ephemeral,
                    });
                    return;
                }
                const openerGuild = getGuildById(db, war.openerGuildId);
                const opponentGuild = getGuildById(db, war.opponentGuildId);
                const winnerSelect = new StringSelectMenuBuilder()
                    .setCustomId(`wt_finalize_winner_select|${war.id}`)
                    .setPlaceholder('Select the winning guild')
                    .addOptions([
                    new StringSelectMenuOptionBuilder()
                        .setLabel((openerGuild?.name || 'Guild A').slice(0, 100))
                        .setValue(war.openerGuildId),
                    new StringSelectMenuOptionBuilder()
                        .setLabel((opponentGuild?.name || 'Guild B').slice(0, 100))
                        .setValue(war.opponentGuildId),
                ]);
                await interaction.reply({
                    content: 'Select the winning guild:',
                    components: [new ActionRowBuilder().addComponents(winnerSelect)],
                    flags: MessageFlags.Ephemeral,
                });
                return;
            }
            if (customId === 'wg_open_1v1' || customId === 'c41fa0d1f1d14d3db74f8dc6ad590316') {
                await interaction.deferReply({ flags: MessageFlags.Ephemeral });
                const selectOpponent = new UserSelectMenuBuilder()
                    .setCustomId('wg_select_1v1_opponent')
                    .setPlaceholder('Select the player you want to challenge')
                    .setMinValues(1)
                    .setMaxValues(1);
                const embed = new EmbedBuilder()
                    .setColor('#2a8900')
                    .setTitle('Wager 1v1')
                    .setDescription('Select the opponent for this 1v1 wager.');
                await interaction.editReply({
                    embeds: [embed],
                    components: [new ActionRowBuilder().addComponents(selectOpponent)],
                });
                return;
            }
            if (customId === 'wg_open_2v2' || customId === '558e24f85ff142e69f7e05320a41c6bf') {
                await interaction.deferReply({ flags: MessageFlags.Ephemeral });
                const selectPartner = new UserSelectMenuBuilder()
                    .setCustomId('wg_select_2v2_partner')
                    .setPlaceholder('Select your teammate')
                    .setMinValues(1)
                    .setMaxValues(1);
                const embed = new EmbedBuilder()
                    .setColor('#2a8900')
                    .setTitle('Wager 2v2')
                    .setDescription('Step 1/2: Select your teammate.');
                await interaction.editReply({
                    embeds: [embed],
                    components: [new ActionRowBuilder().addComponents(selectPartner)],
                });
                return;
            }
            if (customId.startsWith('wg_accept|')) {
                await interaction.deferUpdate();
                const [, wagerIdRaw] = parseCustomId(customId);
                const wagerId = Number(wagerIdRaw);
                const wager = getWagerById(db, wagerId);
                if (!wager || wager.status !== 'PENDING') {
                    await interaction.followUp({
                        content: '❌ This wager is no longer pending.',
                        flags: MessageFlags.Ephemeral,
                    });
                    return;
                }
                const requiredAcceptors = wager.type === '1V1'
                    ? [wager.challenged1Id]
                    : [wager.challenged1Id, wager.challenged2Id].filter((v) => !!v);
                if (!requiredAcceptors.includes(interaction.user.id)) {
                    await interaction.followUp({
                        content: wager.type === '1V1'
                            ? '❌ Only the challenged player can accept this wager.'
                            : '❌ Only the challenged duo can accept this wager.',
                        flags: MessageFlags.Ephemeral,
                    });
                    return;
                }
                const alreadyAccepted = parseAcceptedUsers(wager.acceptedByUserIds);
                if (alreadyAccepted.includes(interaction.user.id)) {
                    await interaction.followUp({
                        content: ' You already accepted this wager.',
                        flags: MessageFlags.Ephemeral,
                    });
                    return;
                }
                const acceptedUsers = recordWagerAcceptance(db, wager.id, interaction.user.id);
                const acceptedCount = requiredAcceptors.filter((id) => acceptedUsers.includes(id)).length;
                if (acceptedCount < requiredAcceptors.length) {
                    await interaction.editReply({
                        content: `⏳ Wager pending acceptance: **${acceptedCount}/${requiredAcceptors.length}** challenged players accepted.`,
                        components: interaction.message.components,
                        embeds: [],
                    });
                    return;
                }
                markWagerAccepted(db, wager.id);
                const participantIds = buildWagerParticipantIds(wager);
                const channel = interaction.channel;
                if (channel && 'permissionOverwrites' in channel) {
                    await unlockWagerTicketChat(interaction, channel, participantIds);
                }
                const acceptDisabledRow = new ActionRowBuilder().addComponents(new ButtonBuilder()
                    .setCustomId(`wg_accept|${wager.id}`)
                    .setLabel('Accept Wager')
                    .setStyle(ButtonStyle.Success)
                    .setDisabled(true), new ButtonBuilder()
                    .setCustomId(`wg_finalize_open|${wager.id}`)
                    .setLabel('Finalize Wager')
                    .setStyle(ButtonStyle.Primary), new ButtonBuilder()
                    .setCustomId(`wg_dodge|${wager.id}`)
                    .setLabel('Dodge')
                    .setStyle(ButtonStyle.Danger));
                await interaction.editReply({
                    content: '✅ Wager accepted. Chat unlocked.',
                    embeds: [],
                    components: [acceptDisabledRow],
                });
                return;
            }
            if (customId.startsWith('wg_finalize_open|')) {
                const [, wagerIdRaw] = parseCustomId(customId);
                const wagerId = Number(wagerIdRaw);
                const wager = getWagerById(db, wagerId);
                if (!wager || wager.status !== 'ACCEPTED') {
                    await interaction.reply({
                        content: '❌ This wager is not available for finalization.',
                        flags: MessageFlags.Ephemeral,
                    });
                    return;
                }
                const member = await interaction.guild?.members.fetch(interaction.user.id).catch(() => null);
                const canFinalize = canMemberFinalizeTicket(member);
                if (!canFinalize) {
                    await interaction.reply({
                        content: '❌ Only Hoster, Junior Hoster, or Event Hoster can finalize this wager.',
                        flags: MessageFlags.Ephemeral,
                    });
                    return;
                }
                const teamA = formatWagerTeam([wager.challenger1Id, wager.challenger2Id]);
                const teamB = formatWagerTeam([wager.challenged1Id, wager.challenged2Id]);
                const winnerSelect = new StringSelectMenuBuilder()
                    .setCustomId(`wg_finalize_winner_select|${wager.id}`)
                    .setPlaceholder('Select the winning team')
                    .addOptions([
                    new StringSelectMenuOptionBuilder()
                        .setLabel((teamA || 'Team A').slice(0, 100))
                        .setValue('CHALLENGER'),
                    new StringSelectMenuOptionBuilder()
                        .setLabel((teamB || 'Team B').slice(0, 100))
                        .setValue('CHALLENGED'),
                ]);
                await interaction.reply({
                    content: 'Select the winner team:',
                    components: [new ActionRowBuilder().addComponents(winnerSelect)],
                    flags: MessageFlags.Ephemeral,
                });
                return;
            }
            if (customId.startsWith('wg_dodge|')) {
                await interaction.deferUpdate();
                const [, wagerIdRaw] = parseCustomId(customId);
                const wagerId = Number(wagerIdRaw);
                const wager = getWagerById(db, wagerId);
                if (!wager || !['PENDING', 'ACCEPTED'].includes(wager.status)) {
                    await interaction.followUp({
                        content: '❌ This wager cannot be dodged now.',
                        flags: MessageFlags.Ephemeral,
                    });
                    return;
                }
                const member = await interaction.guild?.members.fetch(interaction.user.id).catch(() => null);
                const isHosterTeam = !!member && (member.roles.cache.has(WAR_ROLE_IDS.HOSTER)
                    || member.roles.cache.has(WAR_ROLE_IDS.JUNIOR_HOSTER)
                    || member.roles.cache.has(WAR_ROLE_IDS.EVENT_HOSTER));
                const isWagerOpener = wager.challenger1Id === interaction.user.id;
                const isChallenged = wager.challenged1Id === interaction.user.id || wager.challenged2Id === interaction.user.id;
                if (!isWagerOpener && !isChallenged && !isHosterTeam) {
                    await interaction.followUp({
                        content: '❌ Only wager participants, Hoster, Junior Hoster, or Event Hoster can use Dodge.',
                        flags: MessageFlags.Ephemeral,
                    });
                    return;
                }
                const participants = buildWagerParticipantIds(wager);
                const mentionUsers = Array.from(new Set([...participants, interaction.user.id]));
                dodgeWager(db, wager.id, interaction.user.id);
                const teamA = formatWagerTeam([wager.challenger1Id, wager.challenger2Id]);
                const teamB = formatWagerTeam([wager.challenged1Id, wager.challenged2Id]);
                const dodgeSummary = `# WAGER DODGE\n<@${interaction.user.id}> used Dodge and closed the wager ticket (${teamA} vs ${teamB}).`;
                const wagerDodgeLogsChannel = await interaction.client.channels.fetch(WAGER_DODGE_LOGS_CHANNEL_ID).catch(() => null);
                if (wagerDodgeLogsChannel && wagerDodgeLogsChannel.isTextBased() && 'send' in wagerDodgeLogsChannel) {
                    await wagerDodgeLogsChannel.send({
                        content: dodgeSummary,
                        allowedMentions: { users: mentionUsers },
                    });
                }
                await interaction.editReply({
                    content: dodgeSummary,
                    embeds: [],
                    components: [],
                    allowedMentions: { users: mentionUsers },
                });
                await new Promise(resolve => setTimeout(resolve, 3000));
                if (interaction.channel && 'delete' in interaction.channel) {
                    await interaction.channel.delete('Wager ticket closed after dodge').catch(() => null);
                }
                return;
            }
            if (customId.startsWith('wg_close|')) {
                await interaction.deferUpdate();
                const [, wagerIdRaw] = parseCustomId(customId);
                const wagerId = Number(wagerIdRaw);
                const wager = getWagerById(db, wagerId);
                if (!wager || !['PENDING', 'ACCEPTED'].includes(wager.status)) {
                    await interaction.followUp({
                        content: '❌ This wager is already closed.',
                        flags: MessageFlags.Ephemeral,
                    });
                    return;
                }
                const member = await interaction.guild?.members.fetch(interaction.user.id).catch(() => null);
                const canClose = !!member && member.roles.cache.has(WAR_ROLE_IDS.HOSTER);
                if (!canClose) {
                    await interaction.followUp({
                        content: '❌ Only Hoster can close this ticket.',
                        flags: MessageFlags.Ephemeral,
                    });
                    return;
                }
                closeWager(db, wager.id);
                await interaction.editReply({
                    content: '✅ Ticket closed by hoster.',
                    components: [],
                    embeds: [],
                });
                if (interaction.channel && 'delete' in interaction.channel) {
                    await interaction.channel.delete('Wager ticket closed by hoster').catch(() => null);
                }
                return;
            }
            if (customId.startsWith('wt_finalize_now|')) {
                const [, warIdRaw, winnerGuildId, scoreValue] = parseCustomId(customId);
                const warId = Number(warIdRaw);
                const war = getWarById(db, warId);
                const parsedScore = parseWarScore(scoreValue || '');
                if (!war || !winnerGuildId || !parsedScore || !['PENDING', 'ACCEPTED'].includes(war.status)) {
                    await interaction.reply({
                        content: '❌ This war is not available for finalization.',
                        flags: MessageFlags.Ephemeral,
                    });
                    return;
                }
                if (![war.openerGuildId, war.opponentGuildId].includes(winnerGuildId)) {
                    await interaction.reply({
                        content: '❌ Invalid winner selected.',
                        flags: MessageFlags.Ephemeral,
                    });
                    return;
                }
                const member = await interaction.guild?.members.fetch(interaction.user.id).catch(() => null);
                const canFinalize = canMemberFinalizeTicket(member);
                if (!canFinalize) {
                    await interaction.reply({
                        content: '❌ Only Hoster, Junior Hoster, or Event Hoster can finalize this war.',
                        flags: MessageFlags.Ephemeral,
                    });
                    return;
                }
                await interaction.deferUpdate();
                const { winnerScore, loserScore } = parsedScore;
                const { winnerGuild } = await finalizeWarAndLog(interaction, client, db, war, winnerGuildId, winnerScore, loserScore, null);
                await interaction.followUp({
                    content: `✅ War finalized. Winner: **${winnerGuild?.name || 'Unknown'}** | Score: **${winnerScore}-${loserScore}**. Closing ticket...`,
                    flags: MessageFlags.Ephemeral,
                });
                if (interaction.channel && 'delete' in interaction.channel) {
                    await interaction.channel.delete('War finished and recorded').catch(() => null);
                }
                return;
            }
            if (customId.startsWith('wt_finalize_with_link|')) {
                const [, warIdRaw, winnerGuildId, scoreValue] = parseCustomId(customId);
                const warId = Number(warIdRaw);
                const war = getWarById(db, warId);
                const parsedScore = parseWarScore(scoreValue || '');
                if (!war || !winnerGuildId || !parsedScore || !['PENDING', 'ACCEPTED'].includes(war.status)) {
                    await interaction.reply({
                        content: '❌ This war is not available for finalization.',
                        flags: MessageFlags.Ephemeral,
                    });
                    return;
                }
                const member = await interaction.guild?.members.fetch(interaction.user.id).catch(() => null);
                const canFinalize = canMemberFinalizeTicket(member);
                if (!canFinalize) {
                    await interaction.reply({
                        content: '❌ Only Hoster, Junior Hoster, or Event Hoster can finalize this war.',
                        flags: MessageFlags.Ephemeral,
                    });
                    return;
                }
                const linkInput = new TextInputBuilder()
                    .setCustomId('clips_link')
                    .setLabel('Clips link (YouTube, Drive, etc.)')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('https://...')
                    .setRequired(true)
                    .setMaxLength(400);
                const modal = new ModalBuilder()
                    .setCustomId(`wt_finalize_link_modal|${war.id}|${winnerGuildId}|${scoreValue}`)
                    .setTitle('Send War Clips Link')
                    .addComponents(new ActionRowBuilder().addComponents(linkInput));
                await interaction.showModal(modal);
                return;
            }
            if (customId.startsWith('wt_finalize_with_details|')) {
                const [, warIdRaw, winnerGuildId, scoreValue] = parseCustomId(customId);
                const warId = Number(warIdRaw);
                const war = getWarById(db, warId);
                const parsedScore = parseWarScore(scoreValue || '');
                if (!war || !winnerGuildId || !parsedScore || !['PENDING', 'ACCEPTED'].includes(war.status)) {
                    await interaction.reply({
                        content: '❌ This war is not available for finalization.',
                        flags: MessageFlags.Ephemeral,
                    });
                    return;
                }
                const member = await interaction.guild?.members.fetch(interaction.user.id).catch(() => null);
                const canFinalize = canMemberFinalizeTicket(member);
                if (!canFinalize) {
                    await interaction.reply({
                        content: '❌ Only Hoster, Junior Hoster, or Event Hoster can finalize this war.',
                        flags: MessageFlags.Ephemeral,
                    });
                    return;
                }
                const { winnerScore, loserScore } = parsedScore;
                const totalRounds = Math.max(1, winnerScore + loserScore);
                const modalComponents = [];
                if (totalRounds === 1) {
                    const winnerGuildInput = new TextInputBuilder()
                        .setCustomId('round_1_winner_downs')
                        .setLabel('Round 1 Winner Guild downs')
                        .setStyle(TextInputStyle.Short)
                        .setPlaceholder('Number of downs')
                        .setRequired(true)
                        .setMaxLength(10);
                    const loserGuildInput = new TextInputBuilder()
                        .setCustomId('round_1_loser_downs')
                        .setLabel('Round 1 Loser Guild downs')
                        .setStyle(TextInputStyle.Short)
                        .setPlaceholder('Number of downs')
                        .setRequired(true)
                        .setMaxLength(10);
                    const mvpInput = new TextInputBuilder()
                        .setCustomId('mvp_user')
                        .setLabel('MVP user (@mention, ID, or name)')
                        .setStyle(TextInputStyle.Short)
                        .setPlaceholder('@player')
                        .setRequired(false)
                        .setMaxLength(120);
                    const clipsInput1 = new TextInputBuilder()
                        .setCustomId('clips_link_1')
                        .setLabel('Clip Link 1 (optional)')
                        .setStyle(TextInputStyle.Short)
                        .setPlaceholder('https://...')
                        .setRequired(false)
                        .setMaxLength(400);
                    const clipsInput2 = new TextInputBuilder()
                        .setCustomId('clips_link_2')
                        .setLabel('Clip Link 2 (optional)')
                        .setStyle(TextInputStyle.Short)
                        .setPlaceholder('https://...')
                        .setRequired(false)
                        .setMaxLength(400);
                    modalComponents.push(new ActionRowBuilder().addComponents(winnerGuildInput), new ActionRowBuilder().addComponents(loserGuildInput), new ActionRowBuilder().addComponents(mvpInput), new ActionRowBuilder().addComponents(clipsInput1), new ActionRowBuilder().addComponents(clipsInput2));
                }
                else if (totalRounds === 2) {
                    for (let round = 1; round <= 2; round++) {
                        const winnerGuildInput = new TextInputBuilder()
                            .setCustomId(`round_${round}_winner_downs`)
                            .setLabel(`Round ${round} Winner Guild downs`)
                            .setStyle(TextInputStyle.Short)
                            .setPlaceholder('Number of downs')
                            .setRequired(true)
                            .setMaxLength(10);
                        const loserGuildInput = new TextInputBuilder()
                            .setCustomId(`round_${round}_loser_downs`)
                            .setLabel(`Round ${round} Loser Guild downs`)
                            .setStyle(TextInputStyle.Short)
                            .setPlaceholder('Number of downs')
                            .setRequired(true)
                            .setMaxLength(10);
                        modalComponents.push(new ActionRowBuilder().addComponents(winnerGuildInput), new ActionRowBuilder().addComponents(loserGuildInput));
                    }
                    const mvpInput = new TextInputBuilder()
                        .setCustomId('mvp_user')
                        .setLabel('MVP user (@mention, ID, or name)')
                        .setStyle(TextInputStyle.Short)
                        .setPlaceholder('@player')
                        .setRequired(false)
                        .setMaxLength(120);
                    modalComponents.push(new ActionRowBuilder().addComponents(mvpInput));
                }
                else {
                    const roundSummaryInput = new TextInputBuilder()
                        .setCustomId('rounds_summary')
                        .setLabel('Round details summary')
                        .setStyle(TextInputStyle.Paragraph)
                        .setPlaceholder('Summarize round results, downs, and any notable moments.')
                        .setRequired(true)
                        .setMaxLength(1000);
                    const mvpInput = new TextInputBuilder()
                        .setCustomId('mvp_user')
                        .setLabel('MVP user (@mention, ID, or name)')
                        .setStyle(TextInputStyle.Short)
                        .setPlaceholder('@player')
                        .setRequired(false)
                        .setMaxLength(120);
                    const clipsInput1 = new TextInputBuilder()
                        .setCustomId('clips_link_1')
                        .setLabel('Clip Link 1 (optional)')
                        .setStyle(TextInputStyle.Short)
                        .setPlaceholder('https://...')
                        .setRequired(false)
                        .setMaxLength(400);
                    const clipsInput2 = new TextInputBuilder()
                        .setCustomId('clips_link_2')
                        .setLabel('Clip Link 2 (optional)')
                        .setStyle(TextInputStyle.Short)
                        .setPlaceholder('https://...')
                        .setRequired(false)
                        .setMaxLength(400);
                    const clipsInput3 = new TextInputBuilder()
                        .setCustomId('clips_link_3')
                        .setLabel('Clip Link 3 (optional)')
                        .setStyle(TextInputStyle.Short)
                        .setPlaceholder('https://...')
                        .setRequired(false)
                        .setMaxLength(400);
                    modalComponents.push(new ActionRowBuilder().addComponents(roundSummaryInput), new ActionRowBuilder().addComponents(mvpInput), new ActionRowBuilder().addComponents(clipsInput1), new ActionRowBuilder().addComponents(clipsInput2), new ActionRowBuilder().addComponents(clipsInput3));
                }
                const detailsModal = new ModalBuilder()
                    .setCustomId(`wt_finalize_details_modal|${war.id}|${winnerGuildId}|${scoreValue}`)
                    .setTitle('Finalize War With Details')
                    .addComponents(...modalComponents);
                await interaction.showModal(detailsModal);
                return;
            }
            if (customId.startsWith('gp_back_panel|')) {
                const [, guildId] = parseCustomId(customId);
                if (!guildId) {
                    await interaction.update({ content: '❌ Invalid action.', embeds: [], components: [] });
                    return;
                }
                const actorRole = await getGuildActorRoleWithPanelAdmin(interaction, db, guildId, interaction.user.id);
                if (!actorRole) {
                    await replyPermissionError(interaction, '❌ You are not registered in this guild panel.');
                    return;
                }
                const panelEmbed = buildGuildPanelEmbedForInteraction(db, guildId);
                if (!panelEmbed) {
                    await interaction.update({
                        content: '❌ Guild not found.',
                        embeds: [],
                        components: [],
                    });
                    return;
                }
                await interaction.update({
                    content: '',
                    embeds: [panelEmbed],
                    components: buildGuildPanelButtons(guildId),
                });
                return;
            }
            if (customId.startsWith('gp_open_add|')) {
                const [, guildId, roleType] = parseCustomId(customId);
                if (!guildId || !roleType) {
                    await interaction.update({ content: '❌ Invalid action.', embeds: [], components: [] });
                    return;
                }
                const castRoleType = roleType;
                const actorRole = await getGuildActorRoleWithPanelAdmin(interaction, db, guildId, interaction.user.id);
                if (!actorRole) {
                    await replyPermissionError(interaction, '❌ You are not registered in this guild panel.');
                    return;
                }
                if (!canManageRoleType(actorRole, castRoleType)) {
                    await replyPermissionError(interaction, `❌ You cannot manage role **${getRoleLabel(castRoleType)}**.`);
                    return;
                }
                const userSelect = new UserSelectMenuBuilder()
                    .setCustomId(`gp_add_user_select|${guildId}|${castRoleType}`)
                    .setPlaceholder(`Select a user for ${getRoleLabel(castRoleType)}`)
                    .setMinValues(1)
                    .setMaxValues(1);
                const embed = new EmbedBuilder()
                    .setTitle('Member Invitation')
                    .setDescription(`Choose a user to invite to **${getRoleLabel(castRoleType)}**.`)
                    .setColor('#2a8900');
                await interaction.update({
                    embeds: [embed],
                    components: [
                        new ActionRowBuilder().addComponents(userSelect),
                        buildBackToPanelRow(guildId),
                    ],
                    content: '',
                });
                return;
            }
            if (customId.startsWith('gp_open_remove|')) {
                const [, guildId] = parseCustomId(customId);
                if (!guildId) {
                    await interaction.update({ content: '❌ Invalid action.', embeds: [], components: [] });
                    return;
                }
                const actorRole = await getGuildActorRoleWithPanelAdmin(interaction, db, guildId, interaction.user.id);
                if (!actorRole) {
                    await replyPermissionError(interaction, '❌ You are not registered in this guild panel.');
                    return;
                }
                const manageableRoleTypes = getManageableRoleTypes(actorRole);
                const roleOptionsMap = {
                    CO_LEADER: new StringSelectMenuOptionBuilder().setLabel('Co-Leader').setValue('CO_LEADER'),
                    MANAGER: new StringSelectMenuOptionBuilder().setLabel('Manager Guild').setValue('MANAGER'),
                    MAIN: new StringSelectMenuOptionBuilder().setLabel('Main Roster').setValue('MAIN'),
                    SUB: new StringSelectMenuOptionBuilder().setLabel('Sub Roster').setValue('SUB'),
                };
                const roleSelect = new StringSelectMenuBuilder()
                    .setCustomId(`gp_remove_role_select|${guildId}`)
                    .setPlaceholder('Select the role type to remove')
                    .addOptions(manageableRoleTypes.map(role => roleOptionsMap[role]));
                await interaction.update({
                    content: 'Select a role type to list members available for removal.',
                    embeds: [],
                    components: [
                        new ActionRowBuilder().addComponents(roleSelect),
                        buildBackToPanelRow(guildId),
                    ],
                });
                return;
            }
            if (customId.startsWith('gp_open_transfer|')) {
                const [, guildId] = parseCustomId(customId);
                if (!guildId) {
                    await interaction.update({ content: '❌ Invalid action.', embeds: [], components: [] });
                    return;
                }
                const canTransfer = await canUseOwnershipTransfer(interaction, db, guildId, interaction.user.id);
                if (!canTransfer) {
                    await replyPermissionError(interaction, '❌ Only Founder, Head Moderator, Developer, or this guild leader can transfer ownership.');
                    return;
                }
                const guild = getGuildById(db, guildId);
                if (!guild) {
                    await interaction.update({ content: '❌ Guild not found.', embeds: [], components: [] });
                    return;
                }
                const allCandidates = getRegisteredGuildMemberIds(db, guildId).filter(userId => userId !== guild.leaderId);
                if (!allCandidates.length) {
                    await interaction.update({
                        content: ' There are no eligible members to receive ownership for this guild.',
                        embeds: [],
                        components: [buildBackToPanelRow(guildId)],
                    });
                    return;
                }
                const totalPages = Math.max(1, Math.ceil(allCandidates.length / 25));
                const currentPage = 1;
                const pageCandidates = allCandidates.slice((currentPage - 1) * 25, currentPage * 25);
                const candidateOptions = await Promise.all(pageCandidates.map(async (userId) => {
                    const guildMember = await interaction.guild?.members.fetch(userId).catch(() => null);
                    return new StringSelectMenuOptionBuilder()
                        .setLabel((guildMember?.displayName || userId).slice(0, 100))
                        .setDescription(`ID: ${userId}`)
                        .setValue(userId);
                }));
                const transferSelect = new StringSelectMenuBuilder()
                    .setCustomId(`gp_transfer_target_select|${guildId}`)
                    .setPlaceholder('Select the new guild leader')
                    .addOptions(candidateOptions);
                const components = [
                    new ActionRowBuilder().addComponents(transferSelect),
                    buildBackToPanelRow(guildId),
                ];
                if (totalPages > 1) {
                    const pageRow = new ActionRowBuilder().addComponents(new ButtonBuilder()
                        .setCustomId(`gp_transfer_target_page|${guildId}|${currentPage - 1}`)
                        .setLabel('Previous')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(currentPage <= 1), new ButtonBuilder()
                        .setCustomId(`gp_transfer_target_page|${guildId}|${currentPage + 1}`)
                        .setLabel('Next')
                        .setStyle(ButtonStyle.Primary)
                        .setDisabled(currentPage >= totalPages));
                    components.splice(1, 0, pageRow);
                }
                await interaction.update({
                    content: `Select the new leader for **${guild.name}**. Page ${currentPage}/${totalPages}.`,
                    embeds: [],
                    components,
                });
                return;
            }
            if (customId.startsWith('gp_confirm_invite|')) {
                const [, guildId, roleType, targetUserId] = parseCustomId(customId);
                if (!guildId || !roleType || !targetUserId) {
                    await interaction.update({ content: '❌ Invalid action.', embeds: [], components: [] });
                    return;
                }
                const actorRole = await getGuildActorRoleWithPanelAdmin(interaction, db, guildId, interaction.user.id);
                if (!actorRole) {
                    await replyPermissionError(interaction, '❌ You are not registered in this guild panel.');
                    return;
                }
                if (!canManageRoleType(actorRole, roleType)) {
                    await replyPermissionError(interaction, `❌ You cannot manage role **${getRoleLabel(roleType)}**.`);
                    return;
                }
                if (getPendingInviteForTarget(db, guildId, targetUserId, roleType)) {
                    await interaction.update({
                        content: ' This user already has a pending invitation for this role.',
                        embeds: [],
                        components: [],
                    });
                    return;
                }
                if (isUserInRole(db, guildId, targetUserId, roleType)) {
                    await interaction.update({
                        content: ` <@${targetUserId}> already has the role ${getRoleLabel(roleType)}.`,
                        embeds: [],
                        components: [],
                    });
                    return;
                }
                if (!canAddUserToRole(db, guildId, roleType)) {
                    await interaction.update({
                        content: `❌ The ${getRoleLabel(roleType)} role has reached its limit.`,
                        embeds: [],
                        components: [],
                    });
                    return;
                }
                const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
                const inviteId = createInvite(db, guildId, targetUserId, roleType, interaction.user.id, expiresAt);
                const inviteRow = buildInviteDecisionRow(inviteId, roleType);
                const guild = getGuildById(db, guildId);
                const inviterMember = await interaction.guild?.members.fetch(interaction.user.id).catch(() => null);
                const inviterNick = inviterMember?.displayName || interaction.user.username;
                const guildName = guild?.name || guildId;
                const inviteEmbed = buildInviteEmbed(roleType, guildName, inviterNick);
                let sentByDm = false;
                let dmFailureReason = 'unknown';
                try {
                    const targetUser = await client.users.fetch(targetUserId);
                    const dmChannel = await targetUser.createDM();
                    await dmChannel.send({
                        embeds: [inviteEmbed],
                        components: [inviteRow],
                    });
                    sentByDm = true;
                }
                catch (dmError) {
                    sentByDm = false;
                    const rawCode = dmError?.code;
                    dmFailureReason = rawCode ? `code ${rawCode}` : 'unknown reason';
                    console.warn(`Failed to send invite DM to ${targetUserId}:`, dmError);
                }
                if (!sentByDm) {
                    await interaction.channel?.send({
                        content: `<@${targetUserId}>`,
                        embeds: [inviteEmbed],
                        components: [inviteRow],
                        allowedMentions: { users: [targetUserId] },
                    });
                }
                await interaction.update({
                    content: sentByDm
                        ? `✅ Invite sent via DM to <@${targetUserId}>.`
                        : ` DM unavailable (${dmFailureReason}). Invite posted in chat mentioning <@${targetUserId}>.`,
                    embeds: [],
                    components: [],
                });
                return;
            }
            if (customId.startsWith('gp_invite_accept|') || customId.startsWith('gp_invite_decline|')) {
                const [action, inviteIdRaw] = parseCustomId(customId);
                const inviteId = Number(inviteIdRaw);
                const validation = validateInviteForAction(db, inviteId);
                if (!validation.invite) {
                    await interaction.reply({
                        content: `❌ ${validation.reason || 'Invalid invite.'}`,
                        flags: MessageFlags.Ephemeral,
                    });
                    return;
                }
                const invite = validation.invite;
                if (invite.targetUserId !== interaction.user.id) {
                    await interaction.reply({
                        content: '❌ Only the invited user can respond to this invitation.',
                        flags: MessageFlags.Ephemeral,
                    });
                    return;
                }
                if (action === 'gp_invite_decline') {
                    setInviteStatus(db, inviteId, 'DECLINED');
                    await interaction.update({
                        content: '❌ Invitation declined.',
                        components: [],
                    });
                    return;
                }
                if (!canAddUserToRole(db, invite.guildId, invite.roleType)) {
                    setInviteStatus(db, inviteId, 'DECLINED');
                    await interaction.update({
                        content: `❌ Unable to accept: ${getRoleLabel(invite.roleType)} has reached its limit.`,
                        components: [],
                    });
                    return;
                }
                if (isUserInRole(db, invite.guildId, invite.targetUserId, invite.roleType)) {
                    setInviteStatus(db, inviteId, 'DECLINED');
                    await interaction.update({
                        content: ' You already have this role.',
                        components: [],
                    });
                    return;
                }
                const added = addMemberToRole(db, invite.guildId, invite.targetUserId, invite.roleType);
                if (!added) {
                    setInviteStatus(db, inviteId, 'DECLINED');
                    await interaction.update({
                        content: '❌ Unable to complete role assignment.',
                        components: [],
                    });
                    return;
                }
                const inviteRoleType = invite.roleType;
                const discordRoleId = getDiscordRoleIdForRoleType(inviteRoleType);
                if (discordRoleId) {
                    const discordGuildId = getDiscordGuildIdFromInternalGuildId(invite.guildId);
                    const roleAssigned = await assignDiscordRoleById(client, discordGuildId, invite.targetUserId, discordRoleId);
                    if (!roleAssigned) {
                        removeMemberFromRole(db, invite.guildId, invite.targetUserId, inviteRoleType);
                        setInviteStatus(db, inviteId, 'DECLINED');
                        await interaction.update({
                            content: '❌ Unable to accept invitation: failed to assign Discord role. Contact an admin.',
                            components: [],
                        });
                        return;
                    }
                }
                setInviteStatus(db, inviteId, 'ACCEPTED');
                await refreshGuildPanel(client, db, invite.guildId).catch(() => { });
                await interaction.update({
                    content: `✅ Invitation accepted for **${getRoleLabel(invite.roleType)}**.`,
                    components: [],
                });
                return;
            }
            if (customId.startsWith('gp_confirm_remove|')) {
                const [, guildId, roleType, targetUserId] = parseCustomId(customId);
                if (!guildId || !roleType || !targetUserId) {
                    await interaction.update({ content: '❌ Invalid action.', embeds: [], components: [] });
                    return;
                }
                const actorRole = await getGuildActorRoleWithPanelAdmin(interaction, db, guildId, interaction.user.id);
                if (!actorRole) {
                    await replyPermissionError(interaction, '❌ You are not registered in this guild panel.');
                    return;
                }
                if (!canManageRoleType(actorRole, roleType)) {
                    await replyPermissionError(interaction, `❌ You cannot manage role **${getRoleLabel(roleType)}**.`);
                    return;
                }
                const guild = getGuildById(db, guildId);
                if (guild?.leaderId === targetUserId) {
                    await interaction.update({
                        content: '❌ The guild leader cannot be removed from this panel.',
                        embeds: [],
                        components: [],
                    });
                    return;
                }
                const removed = removeMemberFromRole(db, guildId, targetUserId, roleType);
                if (!removed) {
                    await interaction.update({
                        content: '❌ Unable to remove the selected member.',
                        embeds: [],
                        components: [],
                    });
                    return;
                }
                await maybeRemoveDiscordRoleByType(interaction, db, targetUserId, roleType);
                const targetUser = await client.users.fetch(targetUserId).catch(() => null);
                if (targetUser) {
                    const removalEmbed = buildRemovalEmbed(roleType, guild?.name || guildId);
                    await targetUser.send({ embeds: [removalEmbed] }).catch(() => { });
                }
                await refreshGuildPanel(client, db, guildId).catch(() => { });
                await interaction.update({
                    content: `✅ <@${targetUserId}> was removed from **${getRoleLabel(roleType)}** and the panel was updated.`,
                    embeds: [],
                    components: [],
                });
                return;
            }
            if (customId.startsWith('gp_confirm_transfer|')) {
                const [, guildId, targetUserId] = parseCustomId(customId);
                if (!guildId || !targetUserId) {
                    await interaction.update({ content: '❌ Invalid action.', embeds: [], components: [] });
                    return;
                }
                const canTransfer = await canUseOwnershipTransfer(interaction, db, guildId, interaction.user.id);
                if (!canTransfer) {
                    await replyPermissionError(interaction, '❌ Only Founder, Head Moderator, Developer, or this guild leader can transfer ownership.');
                    return;
                }
                const guild = getGuildById(db, guildId);
                if (!guild) {
                    await interaction.update({ content: '❌ Guild not found.', embeds: [], components: [] });
                    return;
                }
                if (targetUserId === guild.leaderId) {
                    await interaction.update({
                        content: ' This user is already the current guild leader.',
                        embeds: [],
                        components: [],
                    });
                    return;
                }
                const registeredMemberIds = getRegisteredGuildMemberIds(db, guildId);
                if (!registeredMemberIds.includes(targetUserId)) {
                    await interaction.update({
                        content: '❌ The selected user is not a registered member of this guild.',
                        embeds: [],
                        components: [],
                    });
                    return;
                }
                const previousLeaderId = guild.leaderId;
                const previousCoLeaderId = guild.coLeaderId;
                db.prepare('UPDATE Guilds SET leaderId = ?, coLeaderId = CASE WHEN coLeaderId = ? THEN NULL ELSE coLeaderId END WHERE id = ?')
                    .run(targetUserId, targetUserId, guildId);
                const discordGuildId = getDiscordGuildIdFromInternalGuildId(guildId);
                const assigned = await assignDiscordRoleById(client, discordGuildId, targetUserId, FIXED_ROLE_IDS.GUILD_LEADER);
                if (!assigned) {
                    db.prepare('UPDATE Guilds SET leaderId = ?, coLeaderId = ? WHERE id = ?')
                        .run(previousLeaderId, previousCoLeaderId, guildId);
                    await interaction.update({
                        content: '❌ Failed to assign the Guild Leader role on Discord. Ownership transfer canceled.',
                        embeds: [],
                        components: [],
                    });
                    return;
                }
                await maybeRemoveGuildLeaderDiscordRole(interaction, db, previousLeaderId);
                await refreshGuildPanel(client, db, guildId).catch(() => { });
                await interaction.update({
                    content: `✅ Ownership transferred successfully to <@${targetUserId}>.`,
                    embeds: [],
                    components: [],
                });
                return;
            }
            if (customId.startsWith('gp_leave_guild|')) {
                await interaction.deferUpdate();
                const [, guildId] = parseCustomId(customId);
                if (!guildId) {
                    await interaction.followUp({ content: '❌ Invalid action.', flags: MessageFlags.Ephemeral });
                    return;
                }
                const guild = getGuildById(db, guildId);
                if (!guild) {
                    await interaction.followUp({ content: '❌ Guild not found.', flags: MessageFlags.Ephemeral });
                    return;
                }
                const userId = interaction.user.id;
                if (guild.leaderId === userId) {
                    if (!guild.coLeaderId) {
                        await interaction.followUp({
                            content: '❌ You are the guild leader and must transfer ownership before leaving. Use Ownership Transfer first.',
                            flags: MessageFlags.Ephemeral,
                        });
                        return;
                    }
                    db.prepare('UPDATE Guilds SET leaderId = ?, coLeaderId = NULL WHERE id = ?')
                        .run(guild.coLeaderId, guildId);
                    await maybeRemoveGuildLeaderDiscordRole(interaction, db, userId);
                    await assignDiscordRoleById(client, getDiscordGuildIdFromInternalGuildId(guildId), guild.coLeaderId, FIXED_ROLE_IDS.GUILD_LEADER).catch(() => null);
                    // co-leader role remains as null; if coLeader role should be removed, we skip for simplicity
                    await refreshGuildPanel(client, db, guildId).catch(() => { });
                    await interaction.followUp({
                        content: '✅ You left the guild. Ownership transferred to the former co-leader.',
                        flags: MessageFlags.Ephemeral,
                    });
                    return;
                }
                if (guild.coLeaderId === userId) {
                    removeMemberFromRole(db, guildId, userId, 'CO_LEADER');
                    await maybeRemoveDiscordRoleByType(interaction, db, userId, 'CO_LEADER');
                    await refreshGuildPanel(client, db, guildId).catch(() => { });
                    await interaction.followUp({ content: '✅ You left co-leader role.', flags: MessageFlags.Ephemeral });
                    return;
                }
                if (db.prepare('SELECT 1 FROM Managers WHERE guildId = ? AND userId = ?').get(guildId, userId)) {
                    removeMemberFromRole(db, guildId, userId, 'MANAGER');
                    await maybeRemoveDiscordRoleByType(interaction, db, userId, 'MANAGER');
                    await refreshGuildPanel(client, db, guildId).catch(() => { });
                    await interaction.followUp({ content: '✅ You were removed from Manager and left the guild.', flags: MessageFlags.Ephemeral });
                    return;
                }
                if (db.prepare('SELECT 1 FROM MainRosters WHERE guildId = ? AND userId = ?').get(guildId, userId)) {
                    removeMemberFromRole(db, guildId, userId, 'MAIN');
                    await refreshGuildPanel(client, db, guildId).catch(() => { });
                    await interaction.followUp({ content: '✅ You left the main roster.', flags: MessageFlags.Ephemeral });
                    return;
                }
                if (db.prepare('SELECT 1 FROM SubRosters WHERE guildId = ? AND userId = ?').get(guildId, userId)) {
                    removeMemberFromRole(db, guildId, userId, 'SUB');
                    await refreshGuildPanel(client, db, guildId).catch(() => { });
                    await interaction.followUp({ content: '✅ You left the sub roster.', flags: MessageFlags.Ephemeral });
                    return;
                }
                await interaction.followUp({ content: '❌ You are not a member of this guild (or already left).', flags: MessageFlags.Ephemeral });
                return;
            }
            if (customId.startsWith('gp_cancel_action|')) {
                await interaction.update({
                    content: '❎ Action canceled.',
                    components: [],
                    embeds: [],
                });
                return;
            }
        }
        // ── Signing flow buttons ──────────────────────────────────────
        if (interaction.isButton() && interaction.customId.startsWith('sign_')) {
            const parts = interaction.customId.split('_');
            const action = parts[1]; // accept | decline | approve | reject
            const signingId = parseInt(parts[2] ?? '0');
            const { getSigningRequest, updateSigningStatus, getSetting } = await import('./database.js');
            const { signMember, getAllOrgs } = await import('./siteapi.js');
            const req = getSigningRequest(db, signingId);
            if (!req) {
                await interaction.reply({ content: '❌ Signing request not found or expired.', ephemeral: true });
                return;
            }
            if (action === 'accept') {
                if (interaction.user.id !== req.target_discord_id) {
                    await interaction.reply({ content: '❌ This signing offer is not for you.', ephemeral: true });
                    return;
                }
                if (req.status !== 'PENDING_PLAYER') {
                    await interaction.reply({ content: '❌ This offer has already been responded to.', ephemeral: true });
                    return;
                }
                // Send to log channel
                const logChannelId = getSetting(db, 'log_channel_id');
                if (!logChannelId) {
                    await interaction.reply({ content: '❌ No log channel set. Ask staff to use /setlogchannel.', ephemeral: true });
                    return;
                }
                const logChannel = await client.channels.fetch(logChannelId).catch(() => null);
                if (!logChannel || !logChannel.isTextBased() || !('send' in logChannel)) {
                    await interaction.reply({ content: '❌ Log channel not accessible.', ephemeral: true });
                    return;
                }
                const { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } = await import('discord.js');
                const embed = new EmbedBuilder()
                    .setTitle('⏳ Signing Request — Pending Staff Approval')
                    .setColor(0xF5F07A)
                    .addFields({ name: 'Guild', value: `${req.org_tag}`, inline: true }, { name: 'Player', value: `<@${req.target_discord_id}> (${req.target_name})`, inline: true }, { name: 'Role', value: req.role, inline: true }, { name: 'Invited by', value: `<@${req.inviter_discord_id}>`, inline: true });
                const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`sign_approve_${signingId}`).setLabel('Approve').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId(`sign_reject_${signingId}`).setLabel('Reject').setStyle(ButtonStyle.Danger));
                const logMsg = await logChannel.send({ embeds: [embed], components: [row] });
                updateSigningStatus(db, signingId, 'PENDING_STAFF', logMsg.id);
                await interaction.update({ content: '✅ You accepted the signing offer. A staff member will review it.', components: [], embeds: [] });
            }
            else if (action === 'decline') {
                if (interaction.user.id !== req.target_discord_id) {
                    await interaction.reply({ content: '❌ This signing offer is not for you.', ephemeral: true });
                    return;
                }
                updateSigningStatus(db, signingId, 'DECLINED');
                await interaction.update({ content: '❌ You declined the signing offer.', components: [], embeds: [] });
            }
            else if (action === 'approve') {
                // Staff approving
                const staffRoleId = getSetting(db, 'staff_role_id');
                if (staffRoleId && interaction.guild) {
                    const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
                    if (!member?.roles.cache.has(staffRoleId)) {
                        await interaction.reply({ content: '❌ You are not staff.', ephemeral: true });
                        return;
                    }
                }
                if (req.status !== 'PENDING_STAFF') {
                    await interaction.reply({ content: '❌ Already handled.', ephemeral: true });
                    return;
                }
                try {
                    await signMember(req.org_id, req.target_discord_id, req.target_name, req.role);
                }
                catch (e) {
                    await interaction.reply({ content: `❌ Could not add to site: ${e.message}`, ephemeral: true });
                    return;
                }
                updateSigningStatus(db, signingId, 'APPROVED');
                // Give guild role
                const orgs = await getAllOrgs().catch(() => []);
                const org = orgs.find((o) => o.tag === req.org_tag);
                if (org?.discord_role_id && interaction.guild) {
                    const gm = await interaction.guild.members.fetch(req.target_discord_id).catch(() => null);
                    if (gm)
                        await gm.roles.add(org.discord_role_id).catch(() => null);
                }
                // Public announcement
                const { EmbedBuilder } = await import('discord.js');
                const pubChannelId = getSetting(db, 'public_channel_id');
                if (pubChannelId) {
                    const pubChannel = await client.channels.fetch(pubChannelId).catch(() => null);
                    if (pubChannel && pubChannel.isTextBased() && 'send' in pubChannel) {
                        const pubEmbed = new EmbedBuilder()
                            .setTitle('📝 New Signing')
                            .setColor(0x2a8900)
                            .setDescription(`<@${req.target_discord_id}> has been signed to **${req.org_tag}** as **${req.role}**!`);
                        await pubChannel.send({ embeds: [pubEmbed] });
                    }
                }
                await interaction.update({ content: `✅ Signing approved. ${req.target_name} added to ${req.org_tag}.`, components: [], embeds: [] });
            }
            else if (action === 'reject') {
                const staffRoleId = getSetting(db, 'staff_role_id');
                if (staffRoleId && interaction.guild) {
                    const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
                    if (!member?.roles.cache.has(staffRoleId)) {
                        await interaction.reply({ content: '❌ You are not staff.', ephemeral: true });
                        return;
                    }
                }
                updateSigningStatus(db, signingId, 'REJECTED');
                // DM the player
                try {
                    const user = await client.users.fetch(req.target_discord_id);
                    await user.send(`❌ Your signing to **${req.org_tag}** was rejected by staff.`);
                }
                catch { /* ignore */ }
                await interaction.update({ content: `❌ Signing rejected.`, components: [], embeds: [] });
            }
            return;
        }
        // ── End signing flow ──────────────────────────────────────────
        if (interaction.isStringSelectMenu()) {
            const customId = interaction.customId;
            if (customId.startsWith('wt_select_opponent|')) {
                const [, actorGuildId] = parseCustomId(customId);
                const opponentGuildId = interaction.values[0];
                const actorGuild = actorGuildId ? getGuildById(db, actorGuildId) : null;
                const opponentGuild = getGuildById(db, opponentGuildId);
                if (!actorGuild || !opponentGuild) {
                    await interaction.update({
                        content: '❌ Invalid guild selection.',
                        components: [],
                        embeds: [],
                    });
                    return;
                }
                const starterRole = getGuildRoleInWar(actorGuild, interaction.user.id);
                const isManager = !!db
                    .prepare('SELECT 1 FROM Managers WHERE guildId = ? AND userId = ?')
                    .get(actorGuild.id, interaction.user.id);
                if (!starterRole && !isManager) {
                    await interaction.update({
                        content: '❌ You no longer have permission to open this war ticket.',
                        components: [],
                        embeds: [],
                    });
                    return;
                }
                const warChannel = await createWarTicketChannel(interaction, db, actorGuild, opponentGuild);
                if (!warChannel) {
                    await interaction.update({
                        content: '❌ Failed to create war ticket channel. Check bot permissions and category setup.',
                        components: [],
                        embeds: [],
                    });
                    return;
                }
                await interaction.update({
                    content: `✅ War ticket created successfully! Check <#${warChannel.id}>`,
                    components: [],
                    embeds: [],
                });
                return;
            }
            if (customId.startsWith('wt_finalize_winner_select|')) {
                const [, warIdRaw] = parseCustomId(customId);
                const warId = Number(warIdRaw);
                const winnerGuildId = interaction.values[0];
                const war = getWarById(db, warId);
                if (!war || !['PENDING', 'ACCEPTED'].includes(war.status)) {
                    await interaction.update({
                        content: '❌ This war is not available for finalization.',
                        components: [],
                        embeds: [],
                    });
                    return;
                }
                if (![war.openerGuildId, war.opponentGuildId].includes(winnerGuildId)) {
                    await interaction.update({
                        content: '❌ Invalid winner selected.',
                        components: [],
                        embeds: [],
                    });
                    return;
                }
                const member = await interaction.guild?.members.fetch(interaction.user.id).catch(() => null);
                const canFinalize = canMemberFinalizeTicket(member);
                if (!canFinalize) {
                    await interaction.update({
                        content: '❌ Only Hoster, Junior Hoster, or Event Hoster can finalize this war.',
                        components: [],
                        embeds: [],
                    });
                    return;
                }
                const scoreSelect = new StringSelectMenuBuilder()
                    .setCustomId(`wt_finalize_score_select|${war.id}|${winnerGuildId}`)
                    .setPlaceholder('Select the final score')
                    .addOptions([
                    new StringSelectMenuOptionBuilder()
                        .setLabel('2-1')
                        .setDescription('Close war result')
                        .setValue('2-1'),
                    new StringSelectMenuOptionBuilder()
                        .setLabel('3-0')
                        .setDescription('Clean sweep result')
                        .setValue('3-0'),
                ]);
                await interaction.update({
                    content: 'Select the final score:',
                    components: [new ActionRowBuilder().addComponents(scoreSelect)],
                    embeds: [],
                });
                return;
            }
            if (customId.startsWith('wt_finalize_score_select|')) {
                const [, warIdRaw, winnerGuildId] = parseCustomId(customId);
                const warId = Number(warIdRaw);
                const scoreValue = interaction.values[0];
                const parsedScore = parseWarScore(scoreValue);
                const war = getWarById(db, warId);
                if (!winnerGuildId) {
                    await interaction.update({
                        content: '❌ Invalid winner selected.',
                        components: [],
                        embeds: [],
                    });
                    return;
                }
                if (!war || !['PENDING', 'ACCEPTED'].includes(war.status)) {
                    await interaction.update({
                        content: '❌ This war is not available for finalization.',
                        components: [],
                        embeds: [],
                    });
                    return;
                }
                if (![war.openerGuildId, war.opponentGuildId].includes(winnerGuildId)) {
                    await interaction.update({
                        content: '❌ Invalid winner selected.',
                        components: [],
                        embeds: [],
                    });
                    return;
                }
                if (!parsedScore) {
                    await interaction.update({
                        content: '❌ Invalid score selected.',
                        components: [],
                        embeds: [],
                    });
                    return;
                }
                const member = await interaction.guild?.members.fetch(interaction.user.id).catch(() => null);
                const canFinalize = canMemberFinalizeTicket(member);
                if (!canFinalize) {
                    await interaction.update({
                        content: '❌ Only Hoster, Junior Hoster, or Event Hoster can finalize this war.',
                        components: [],
                        embeds: [],
                    });
                    return;
                }
                const { winnerScore, loserScore } = parsedScore;
                const decisionRow = new ActionRowBuilder().addComponents(new ButtonBuilder()
                    .setCustomId(`wt_finalize_now|${war.id}|${winnerGuildId}|${scoreValue}`)
                    .setLabel('Finalize Without Link')
                    .setStyle(ButtonStyle.Success), new ButtonBuilder()
                    .setCustomId(`wt_finalize_with_link|${war.id}|${winnerGuildId}|${scoreValue}`)
                    .setLabel('Send Clips Link')
                    .setStyle(ButtonStyle.Primary), new ButtonBuilder()
                    .setCustomId(`wt_finalize_with_details|${war.id}|${winnerGuildId}|${scoreValue}`)
                    .setLabel('Finalize With Details')
                    .setStyle(ButtonStyle.Secondary));
                await interaction.update({
                    content: `Winner selected and score set to **${winnerScore}-${loserScore}**. Choose how you want to finalize:`,
                    components: [decisionRow],
                    embeds: [],
                });
                return;
            }
            if (customId.startsWith('wg_finalize_winner_select|')) {
                const [, wagerIdRaw] = parseCustomId(customId);
                const wagerId = Number(wagerIdRaw);
                const winnerSide = interaction.values[0];
                const wager = getWagerById(db, wagerId);
                if (!wager || wager.status !== 'ACCEPTED') {
                    await interaction.update({
                        content: '❌ This wager is not available for finalization.',
                        components: [],
                        embeds: [],
                    });
                    return;
                }
                if (!['CHALLENGER', 'CHALLENGED'].includes(winnerSide)) {
                    await interaction.update({
                        content: '❌ Invalid winner selected.',
                        components: [],
                        embeds: [],
                    });
                    return;
                }
                const member = await interaction.guild?.members.fetch(interaction.user.id).catch(() => null);
                const canFinalize = canMemberFinalizeTicket(member);
                if (!canFinalize) {
                    await interaction.update({
                        content: '❌ Only Hoster, Junior Hoster, or Event Hoster can finalize this wager.',
                        components: [],
                        embeds: [],
                    });
                    return;
                }
                const clipsInput = new TextInputBuilder()
                    .setCustomId('wager_clips_link')
                    .setLabel('Clips link (required)')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('https://...')
                    .setRequired(true)
                    .setMaxLength(400);
                const modal = new ModalBuilder()
                    .setCustomId(`wg_finalize_clip_modal|${wager.id}|${winnerSide}`)
                    .setTitle('Finalize Wager')
                    .addComponents(new ActionRowBuilder().addComponents(clipsInput));
                await interaction.showModal(modal);
                return;
            }
            if (customId.startsWith('gp_action_select|')) {
                const [, guildId] = parseCustomId(customId);
                if (!guildId) {
                    await interaction.update({ content: '❌ Invalid action.', embeds: [], components: [] });
                    return;
                }
                const actorRole = await getGuildActorRoleWithPanelAdmin(interaction, db, guildId, interaction.user.id);
                if (!actorRole) {
                    await replyPermissionError(interaction, '❌ You are not registered in this guild panel.');
                    return;
                }
                const selectedAction = interaction.values[0];
                if (selectedAction === 'MANAGE_REMOVE') {
                    const manageableRoleTypes = getManageableRoleTypes(actorRole);
                    const roleOptionsMap = {
                        CO_LEADER: new StringSelectMenuOptionBuilder().setLabel('Co-Leader').setValue('CO_LEADER'),
                        MANAGER: new StringSelectMenuOptionBuilder().setLabel('Manager Guild').setValue('MANAGER'),
                        MAIN: new StringSelectMenuOptionBuilder().setLabel('Main Roster').setValue('MAIN'),
                        SUB: new StringSelectMenuOptionBuilder().setLabel('Sub Roster').setValue('SUB'),
                    };
                    const roleSelect = new StringSelectMenuBuilder()
                        .setCustomId(`gp_remove_role_select|${guildId}`)
                        .setPlaceholder('Select the role type to remove')
                        .addOptions(manageableRoleTypes.map(role => roleOptionsMap[role]));
                    await interaction.update({
                        content: 'Select a role type to list members available for removal.',
                        embeds: [],
                        components: [new ActionRowBuilder().addComponents(roleSelect)],
                    });
                    return;
                }
                const roleType = ADD_ACTION_MAP[selectedAction];
                if (!roleType) {
                    await interaction.update({
                        content: 'Invalid action.',
                        components: [],
                        embeds: [],
                    });
                    return;
                }
                if (!canManageRoleType(actorRole, roleType)) {
                    await replyPermissionError(interaction, `❌ You cannot manage role **${getRoleLabel(roleType)}**.`);
                    return;
                }
                const userSelect = new UserSelectMenuBuilder()
                    .setCustomId(`gp_add_user_select|${guildId}|${roleType}`)
                    .setPlaceholder(`Select a user for ${getRoleLabel(roleType)}`)
                    .setMinValues(1)
                    .setMaxValues(1);
                const embed = new EmbedBuilder()
                    .setTitle('Member Invitation')
                    .setDescription(`Choose a user to invite to **${getRoleLabel(roleType)}**.`)
                    .setColor('#2a8900');
                await interaction.update({
                    embeds: [embed],
                    components: [new ActionRowBuilder().addComponents(userSelect)],
                    content: '',
                });
                return;
            }
            if (customId.startsWith('gp_remove_role_select|')) {
                const [, guildId] = parseCustomId(customId);
                if (!guildId) {
                    await interaction.update({ content: '❌ Invalid action.', embeds: [], components: [] });
                    return;
                }
                const roleType = interaction.values[0];
                const actorRole = await getGuildActorRoleWithPanelAdmin(interaction, db, guildId, interaction.user.id);
                if (!actorRole) {
                    await replyPermissionError(interaction, '❌ You are not registered in this guild panel.');
                    return;
                }
                if (!canManageRoleType(actorRole, roleType)) {
                    await replyPermissionError(interaction, `❌ You cannot manage role **${getRoleLabel(roleType)}**.`);
                    return;
                }
                const members = getMembersByRole(db, guildId, roleType);
                if (!members.length) {
                    await interaction.update({
                        content: ` No members found for **${getRoleLabel(roleType)}**.`,
                        components: [],
                        embeds: [],
                    });
                    return;
                }
                const totalPages = Math.max(1, Math.ceil(members.length / 25));
                const currentPage = 1;
                const pageMembers = members.slice((currentPage - 1) * 25, currentPage * 25);
                const memberOptions = await Promise.all(pageMembers.map(async (userId) => {
                    const guildMember = await interaction.guild?.members.fetch(userId).catch(() => null);
                    return new StringSelectMenuOptionBuilder()
                        .setLabel((guildMember?.displayName || userId).slice(0, 100))
                        .setDescription(`ID: ${userId}`)
                        .setValue(userId);
                }));
                const memberSelect = new StringSelectMenuBuilder()
                    .setCustomId(`gp_remove_member_select|${guildId}|${roleType}`)
                    .setPlaceholder(`Select who to remove from ${getRoleLabel(roleType)}`)
                    .addOptions(memberOptions);
                const components = [
                    new ActionRowBuilder().addComponents(memberSelect),
                    buildBackToPanelRow(guildId),
                ];
                if (totalPages > 1) {
                    const pageRow = new ActionRowBuilder().addComponents(new ButtonBuilder()
                        .setCustomId(`gp_remove_member_page|${guildId}|${roleType}|${currentPage - 1}`)
                        .setLabel('Previous')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(currentPage <= 1), new ButtonBuilder()
                        .setCustomId(`gp_remove_member_page|${guildId}|${roleType}|${currentPage + 1}`)
                        .setLabel('Next')
                        .setStyle(ButtonStyle.Primary)
                        .setDisabled(currentPage >= totalPages));
                    components.splice(1, 0, pageRow);
                }
                await interaction.update({
                    content: `Select the member to remove from **${getRoleLabel(roleType)}**. Page ${currentPage}/${totalPages}.`,
                    components,
                    embeds: [],
                });
                return;
            }
            if (customId.startsWith('gp_remove_member_select|')) {
                const [, guildId, roleType] = parseCustomId(customId);
                const targetUserId = interaction.values[0];
                if (!guildId || !roleType || !targetUserId) {
                    await interaction.update({ content: '❌ Invalid action.', embeds: [], components: [] });
                    return;
                }
                const actorRole = await getGuildActorRoleWithPanelAdmin(interaction, db, guildId, interaction.user.id);
                if (!actorRole) {
                    await replyPermissionError(interaction, '❌ You are not registered in this guild panel.');
                    return;
                }
                if (!canManageRoleType(actorRole, roleType)) {
                    await replyPermissionError(interaction, `❌ You cannot manage role **${getRoleLabel(roleType)}**.`);
                    return;
                }
                const confirmRow = new ActionRowBuilder().addComponents(new ButtonBuilder()
                    .setCustomId(`gp_confirm_remove|${guildId}|${roleType}|${targetUserId}`)
                    .setLabel('Confirm Removal')
                    .setStyle(ButtonStyle.Danger), new ButtonBuilder()
                    .setCustomId(`gp_cancel_action|${guildId}`)
                    .setLabel('Cancel')
                    .setStyle(ButtonStyle.Secondary));
                await interaction.update({
                    content: `Do you want to remove <@${targetUserId}> from **${getRoleLabel(roleType)}**?`,
                    embeds: [],
                    components: [confirmRow, buildBackToPanelRow(guildId)],
                });
                return;
            }
            if (customId.startsWith('gp_transfer_target_select|')) {
                const [, guildId] = parseCustomId(customId);
                const targetUserId = interaction.values[0];
                if (!guildId || !targetUserId) {
                    await interaction.update({ content: '❌ Invalid action.', embeds: [], components: [] });
                    return;
                }
                const canTransfer = await canUseOwnershipTransfer(interaction, db, guildId, interaction.user.id);
                if (!canTransfer) {
                    await replyPermissionError(interaction, '❌ Only Founder, Head Moderator, Developer, or this guild leader can transfer ownership.');
                    return;
                }
                const guild = getGuildById(db, guildId);
                if (!guild) {
                    await interaction.update({ content: '❌ Guild not found.', embeds: [], components: [] });
                    return;
                }
                if (targetUserId === guild.leaderId) {
                    await interaction.update({
                        content: ' This user is already the current guild leader.',
                        components: [buildBackToPanelRow(guildId)],
                        embeds: [],
                    });
                    return;
                }
                const registeredMemberIds = getRegisteredGuildMemberIds(db, guildId);
                if (!registeredMemberIds.includes(targetUserId)) {
                    await interaction.update({
                        content: '❌ The selected user is not a registered member of this guild.',
                        components: [buildBackToPanelRow(guildId)],
                        embeds: [],
                    });
                    return;
                }
                const confirmRow = new ActionRowBuilder().addComponents(new ButtonBuilder()
                    .setCustomId(`gp_confirm_transfer|${guildId}|${targetUserId}`)
                    .setLabel('Confirm Transfer')
                    .setStyle(ButtonStyle.Danger), new ButtonBuilder()
                    .setCustomId(`gp_cancel_action|${guildId}`)
                    .setLabel('Cancel')
                    .setStyle(ButtonStyle.Secondary));
                await interaction.update({
                    content: `Do you want to transfer guild ownership to <@${targetUserId}>?`,
                    embeds: [],
                    components: [confirmRow, buildBackToPanelRow(guildId)],
                });
                return;
            }
        }
        if (interaction.isUserSelectMenu()) {
            const customId = interaction.customId;
            if (customId === 'wg_select_1v1_opponent') {
                await interaction.deferUpdate();
                const challengerId = interaction.user.id;
                const challengedId = interaction.values[0];
                if (!challengedId || challengedId === challengerId) {
                    await interaction.editReply({
                        content: '❌ Invalid opponent selection.',
                        embeds: [],
                        components: [],
                    });
                    return;
                }
                const challengedMember = await interaction.guild?.members.fetch(challengedId).catch(() => null);
                if (!challengedMember || challengedMember.user.bot) {
                    await interaction.editReply({
                        content: '❌ You must select a valid member (not a bot).',
                        embeds: [],
                        components: [],
                    });
                    return;
                }
                const challengerMember = await interaction.guild?.members.fetch(challengerId).catch(() => null);
                const challengerName = challengerMember?.displayName || interaction.user.username;
                const challengedName = challengedMember.displayName || challengedId;
                const ticketName = `${challengerName} vs ${challengedName}`;
                const ticketChannel = await createWagerTicketChannel(interaction, ticketName, [challengerId, challengedId]);
                if (!ticketChannel) {
                    await interaction.editReply({
                        content: '❌ Failed to create wager ticket channel. Check bot permissions and category setup.',
                        embeds: [],
                        components: [],
                    });
                    return;
                }
                const wagerEmbed = new EmbedBuilder()
                    .setColor('#2a8900')
                    .setTitle('Wager Ticket')
                    .setDescription(' Chat is locked until the wager is accepted.\n\n' +
                    'Use the buttons below to accept, dodge, or close the ticket.');
                const tempRow = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('wg_accept|temp').setLabel('Accept Wager').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId('wg_dodge|temp').setLabel('Dodge').setStyle(ButtonStyle.Danger), new ButtonBuilder().setCustomId('wg_close|temp').setLabel('Close Ticket').setStyle(ButtonStyle.Secondary));
                const panelMessage = await ticketChannel.send({
                    content: `<@${challengerId}> vs <@${challengedId}>`,
                    embeds: [wagerEmbed],
                    components: [tempRow],
                    allowedMentions: { users: [challengerId, challengedId] },
                });
                const wagerId = createWager(db, '1V1', ticketChannel.id, challengerId, null, challengedId, null, panelMessage.id);
                const actionRow = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`wg_accept|${wagerId}`).setLabel('Accept Wager').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId(`wg_dodge|${wagerId}`).setLabel('Dodge').setStyle(ButtonStyle.Danger), new ButtonBuilder().setCustomId(`wg_finalize_open|${wagerId}`).setLabel('Finalize Wager').setStyle(ButtonStyle.Primary));
                await panelMessage.edit({ components: [actionRow] });
                await interaction.editReply({
                    content: `✅ 1v1 wager ticket created: <#${ticketChannel.id}>`,
                    embeds: [],
                    components: [],
                });
                return;
            }
            if (customId === 'wg_select_2v2_partner') {
                const challengerId = interaction.user.id;
                const partnerId = interaction.values[0];
                if (!partnerId || partnerId === challengerId) {
                    await interaction.update({
                        content: '❌ Invalid teammate selection.',
                        embeds: [],
                        components: [],
                    });
                    return;
                }
                const partnerMember = await interaction.guild?.members.fetch(partnerId).catch(() => null);
                if (!partnerMember || partnerMember.user.bot) {
                    await interaction.update({
                        content: '❌ You must select a valid teammate (not a bot).',
                        embeds: [],
                        components: [],
                    });
                    return;
                }
                const selectOpponents = new UserSelectMenuBuilder()
                    .setCustomId(`wg_select_2v2_opponents|${challengerId}|${partnerId}`)
                    .setPlaceholder('Select the 2 opposing players')
                    .setMinValues(2)
                    .setMaxValues(2);
                const embed = new EmbedBuilder()
                    .setColor('#2a8900')
                    .setTitle('Wager 2v2')
                    .setDescription('Step 2/2: Select the two opposing players.');
                await interaction.update({
                    embeds: [embed],
                    components: [new ActionRowBuilder().addComponents(selectOpponents)],
                    content: '',
                });
                return;
            }
            if (customId.startsWith('wg_select_2v2_opponents|')) {
                await interaction.deferUpdate();
                const [, challenger1Id, challenger2Id] = parseCustomId(customId);
                const [challenged1Id, challenged2Id] = interaction.values;
                if (!challenger1Id || !challenger2Id || !challenged1Id || !challenged2Id) {
                    await interaction.editReply({
                        content: '❌ Invalid 2v2 selection data.',
                        embeds: [],
                        components: [],
                    });
                    return;
                }
                const uniqueIds = new Set([challenger1Id, challenger2Id, challenged1Id, challenged2Id]);
                if (uniqueIds.size !== 4) {
                    await interaction.editReply({
                        content: '❌ The four players must be different users.',
                        embeds: [],
                        components: [],
                    });
                    return;
                }
                const members = await Promise.all([challenger1Id, challenger2Id, challenged1Id, challenged2Id].map(id => interaction.guild?.members.fetch(id).catch(() => null)));
                if (members.some(member => !member || member.user.bot)) {
                    await interaction.editReply({
                        content: '❌ All selected players must be valid members (not bots).',
                        embeds: [],
                        components: [],
                    });
                    return;
                }
                const ticketName = `${members[0]?.displayName || challenger1Id}-${members[1]?.displayName || challenger2Id} vs ${members[2]?.displayName || challenged1Id}-${members[3]?.displayName || challenged2Id}`;
                const ticketChannel = await createWagerTicketChannel(interaction, ticketName, [challenger1Id, challenger2Id, challenged1Id, challenged2Id]);
                if (!ticketChannel) {
                    await interaction.editReply({
                        content: '❌ Failed to create wager ticket channel. Check bot permissions and category setup.',
                        embeds: [],
                        components: [],
                    });
                    return;
                }
                const wagerEmbed = new EmbedBuilder()
                    .setColor('#2a8900')
                    .setTitle('Wager Ticket')
                    .setDescription(' Chat is locked until the wager is accepted by both challenged players.\n\n' +
                    'Use the buttons below to accept, dodge, or close the ticket.');
                const tempRow = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('wg_accept|temp').setLabel('Accept Wager').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId('wg_dodge|temp').setLabel('Dodge').setStyle(ButtonStyle.Danger), new ButtonBuilder().setCustomId('wg_close|temp').setLabel('Close Ticket').setStyle(ButtonStyle.Secondary));
                const panelMessage = await ticketChannel.send({
                    content: `<@${challenger1Id}> + <@${challenger2Id}> vs <@${challenged1Id}> + <@${challenged2Id}>`,
                    embeds: [wagerEmbed],
                    components: [tempRow],
                    allowedMentions: { users: [challenger1Id, challenger2Id, challenged1Id, challenged2Id] },
                });
                const wagerId = createWager(db, '2V2', ticketChannel.id, challenger1Id, challenger2Id, challenged1Id, challenged2Id, panelMessage.id);
                const actionRow = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`wg_accept|${wagerId}`).setLabel('Accept Wager').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId(`wg_dodge|${wagerId}`).setLabel('Dodge').setStyle(ButtonStyle.Danger), new ButtonBuilder().setCustomId(`wg_finalize_open|${wagerId}`).setLabel('Finalize Wager').setStyle(ButtonStyle.Primary));
                await panelMessage.edit({ components: [actionRow] });
                await interaction.editReply({
                    content: `✅ 2v2 wager ticket created: <#${ticketChannel.id}>`,
                    embeds: [],
                    components: [],
                });
                return;
            }
            if (customId.startsWith('gp_add_user_select|')) {
                const [, guildId, roleType] = parseCustomId(customId);
                const targetUserId = interaction.values[0];
                if (!guildId || !roleType || !targetUserId) {
                    await interaction.update({ content: '❌ Invalid action.', embeds: [], components: [] });
                    return;
                }
                const actorRole = await getGuildActorRoleWithPanelAdmin(interaction, db, guildId, interaction.user.id);
                if (!actorRole) {
                    await replyPermissionError(interaction, '❌ You are not registered in this guild panel.');
                    return;
                }
                if (!canManageRoleType(actorRole, roleType)) {
                    await replyPermissionError(interaction, `❌ You cannot manage role **${getRoleLabel(roleType)}**.`);
                    return;
                }
                if (targetUserId === interaction.user.id) {
                    await interaction.update({
                        content: '❌ You cannot invite yourself through this flow.',
                        components: [],
                        embeds: [],
                    });
                    return;
                }
                const confirmRow = new ActionRowBuilder().addComponents(new ButtonBuilder()
                    .setCustomId(`gp_confirm_invite|${guildId}|${roleType}|${targetUserId}`)
                    .setLabel('Confirm Invite')
                    .setStyle(ButtonStyle.Success), new ButtonBuilder()
                    .setCustomId(`gp_cancel_action|${guildId}`)
                    .setLabel('Cancel')
                    .setStyle(ButtonStyle.Secondary));
                await interaction.update({
                    content: `Do you want to invite <@${targetUserId}> to **${getRoleLabel(roleType)}**?`,
                    embeds: [],
                    components: [confirmRow, buildBackToPanelRow(guildId)],
                });
                return;
            }
        }
        if (interaction.isModalSubmit()) {
            const customId = interaction.customId;
            // Register team modal
            if (customId === 'registerteam_modal') {
                await interaction.deferReply({ ephemeral: true });
                const tag = interaction.fields.getTextInputValue('rt_tag').trim().toUpperCase();
                const name = interaction.fields.getTextInputValue('rt_name').trim();
                const region = interaction.fields.getTextInputValue('rt_region').trim().toUpperCase();
                const logo = interaction.fields.getTextInputValue('rt_logo').trim();
                try {
                    const { createOrg } = await import('./siteapi.js');
                    await createOrg(tag, name, region, logo || undefined);
                    await interaction.editReply(`✅ Guild **${name}** [${tag}] registered on the site!`);
                }
                catch (e) {
                    await interaction.editReply(`❌ ${e.message}`);
                }
                return;
            }
            // Handle admin win modal
            await handleAdminWinModal(interaction, db);
            if (customId.startsWith('wt_select_opponent_modal|')) {
                await interaction.deferReply({ flags: MessageFlags.Ephemeral });
                const [, actorGuildId] = parseCustomId(customId);
                const opponentGuildName = interaction.fields.getTextInputValue('opponent_guild_name')?.trim();
                if (!actorGuildId || !opponentGuildName) {
                    await interaction.editReply({
                        content: '❌ Invalid input.',
                    });
                    return;
                }
                const actorGuild = getGuildById(db, actorGuildId);
                const opponentGuild = db.prepare('SELECT * FROM Guilds WHERE name = ? AND id != ?').get(opponentGuildName, actorGuildId);
                if (!actorGuild) {
                    await interaction.editReply({
                        content: '❌ Your guild data could not be found.',
                    });
                    return;
                }
                if (!opponentGuild) {
                    await interaction.editReply({
                        content: `❌ Guild "${opponentGuildName}" not found or is your own guild.`,
                    });
                    return;
                }
                const starterRole = getGuildRoleInWar(actorGuild, interaction.user.id);
                const isManager = !!db
                    .prepare('SELECT 1 FROM Managers WHERE guildId = ? AND userId = ?')
                    .get(actorGuild.id, interaction.user.id);
                if (!starterRole && !isManager) {
                    await interaction.editReply({
                        content: '❌ You no longer have permission to open this war ticket.',
                    });
                    return;
                }
                const warChannel = await createWarTicketChannel(interaction, db, actorGuild, opponentGuild);
                if (!warChannel) {
                    await interaction.editReply({
                        content: '❌ Failed to create war ticket channel. Check bot permissions and category setup.',
                    });
                    return;
                }
                await interaction.editReply({
                    content: `✅ War ticket created successfully! Check <#${warChannel.id}>`,
                });
                return;
            }
            if (customId.startsWith('wg_finalize_clip_modal|')) {
                await interaction.deferReply({ flags: MessageFlags.Ephemeral });
                const [, wagerIdRaw, winnerSide] = parseCustomId(customId);
                const wagerId = Number(wagerIdRaw);
                const wager = getWagerById(db, wagerId);
                const clipsLink = interaction.fields.getTextInputValue('wager_clips_link')?.trim();
                if (!wager || wager.status !== 'ACCEPTED') {
                    await interaction.editReply({
                        content: '❌ This wager is not available for finalization.',
                    });
                    return;
                }
                if (!['CHALLENGER', 'CHALLENGED'].includes(winnerSide || '')) {
                    await interaction.editReply({
                        content: '❌ Invalid winner selected.',
                    });
                    return;
                }
                const member = await interaction.guild?.members.fetch(interaction.user.id).catch(() => null);
                const canFinalize = canMemberFinalizeTicket(member);
                if (!canFinalize) {
                    await interaction.editReply({
                        content: '❌ Only Hoster, Junior Hoster, or Event Hoster can finalize this wager.',
                    });
                    return;
                }
                if (!clipsLink || !isValidClipLink(clipsLink)) {
                    await interaction.editReply({
                        content: '❌ Invalid link. Please provide a valid URL starting with http:// or https://',
                    });
                    return;
                }
                closeWager(db, wager.id);
                const teamA = formatWagerTeam([wager.challenger1Id, wager.challenger2Id]);
                const teamB = formatWagerTeam([wager.challenged1Id, wager.challenged2Id]);
                const winnerTeam = winnerSide === 'CHALLENGER' ? teamA : teamB;
                const wagerLogsChannel = await interaction.client.channels.fetch(WAGER_LOGS_CHANNEL_ID).catch(() => null);
                if (wagerLogsChannel && wagerLogsChannel.isTextBased() && 'send' in wagerLogsChannel) {
                    await wagerLogsChannel.send({
                        flags: MessageFlags.IsComponentsV2,
                        components: [
                            buildWagerLogsContainer(`WAGER FINALIZED (${wager.type})`, teamA, teamB, `\nWinner: ${winnerTeam}\nClips: ${clipsLink}\nClosed by: <@${interaction.user.id}>`, '## WAGER CLOSED'),
                        ],
                    });
                }
                await interaction.followUp({
                    content: `✅ Wager finalized. Winner: ${winnerTeam} | Clips: ${clipsLink}. Closing ticket...`,
                    flags: MessageFlags.Ephemeral,
                });
                if (interaction.channel && 'delete' in interaction.channel) {
                    await interaction.channel.delete('Wager finalized and recorded').catch(() => null);
                }
                return;
            }
            if (customId.startsWith('wt_finalize_details_modal|')) {
                await interaction.deferReply({ flags: MessageFlags.Ephemeral });
                const [, warIdRaw, winnerGuildId, scoreValue] = parseCustomId(customId);
                const warId = Number(warIdRaw);
                const war = getWarById(db, warId);
                const parsedScore = parseWarScore(scoreValue || '');
                if (!war || !winnerGuildId || !parsedScore || !['PENDING', 'ACCEPTED'].includes(war.status)) {
                    await interaction.editReply({
                        content: '❌ This war is not available for finalization.',
                    });
                    return;
                }
                if (![war.openerGuildId, war.opponentGuildId].includes(winnerGuildId)) {
                    await interaction.editReply({
                        content: '❌ Invalid winner selected.',
                    });
                    return;
                }
                const member = await interaction.guild?.members.fetch(interaction.user.id).catch(() => null);
                const canFinalize = canMemberFinalizeTicket(member);
                if (!canFinalize) {
                    await interaction.editReply({
                        content: '❌ Only Hoster, Junior Hoster, or Event Hoster can finalize this war.',
                    });
                    return;
                }
                const { winnerScore, loserScore } = parsedScore;
                const totalRounds = Math.max(1, winnerScore + loserScore);
                const roundSummary = interaction.fields.getTextInputValue('rounds_summary')?.trim() || null;
                const roundDowns = [];
                if (roundSummary) {
                    if (totalRounds <= 2) {
                        await interaction.editReply({
                            content: '❌ Round summary is only used for wars with more than 2 total rounds.',
                        });
                        return;
                    }
                }
                else {
                    if (totalRounds > 2) {
                        await interaction.editReply({
                            content: '❌ Please provide a round details summary for wars longer than 2 rounds.',
                        });
                        return;
                    }
                    for (let round = 1; round <= totalRounds; round++) {
                        const winnerDownsRaw = interaction.fields.getTextInputValue(`round_${round}_winner_downs`);
                        const loserDownsRaw = interaction.fields.getTextInputValue(`round_${round}_loser_downs`);
                        const winnerDowns = Number(winnerDownsRaw) || 0;
                        const loserDowns = Number(loserDownsRaw) || 0;
                        if (winnerDowns < 0 || loserDowns < 0) {
                            await interaction.editReply({
                                content: `❌ Invalid downs value for round ${round}. Must be non-negative numbers.`,
                            });
                            return;
                        }
                        roundDowns.push({ winnerDowns, loserDowns });
                    }
                }
                const mvpRaw = interaction.fields.getTextInputValue('mvp_user')?.trim() || null;
                // Collect all clip links
                const clipLinks = [];
                for (let i = 1; i <= 3; i++) {
                    const clipLink = interaction.fields.getTextInputValue(`clips_link_${i}`)?.trim();
                    if (clipLink) {
                        if (!isValidClipLink(clipLink)) {
                            await interaction.editReply({
                                content: `❌ Invalid clip link ${i}. Please provide a valid URL starting with http:// or https://`,
                            });
                            return;
                        }
                        clipLinks.push(clipLink);
                    }
                }
                // Combine all clip links into a single string for storage
                const clipsCombined = clipLinks.length > 0 ? clipLinks.join('\n') : null;
                const { winnerGuild } = await finalizeWarAndLog(interaction, client, db, war, winnerGuildId, winnerScore, loserScore, clipsCombined, roundDowns, mvpRaw, roundSummary);
                const clipsText = clipLinks.length > 0 ? ` | Clips: ${clipLinks.length} link(s) provided` : '';
                await interaction.editReply({
                    content: `✅ War finalized with details. Winner: **${winnerGuild?.name || 'Unknown'}** | ` +
                        `Score: **${winnerScore}-${loserScore}**${clipsText}. Closing ticket...`,
                });
                if (interaction.channel && 'delete' in interaction.channel) {
                    await interaction.channel.delete('War finished and recorded').catch(() => null);
                }
                return;
            }
            if (customId.startsWith('wt_finalize_link_modal|')) {
                await interaction.deferReply({ flags: MessageFlags.Ephemeral });
                const [, warIdRaw, winnerGuildId, scoreValue] = parseCustomId(customId);
                const warId = Number(warIdRaw);
                const war = getWarById(db, warId);
                const parsedScore = parseWarScore(scoreValue || '');
                const clipsLinkRaw = interaction.fields.getTextInputValue('clips_link')?.trim();
                if (!war || !winnerGuildId || !parsedScore || !['PENDING', 'ACCEPTED'].includes(war.status)) {
                    await interaction.editReply({
                        content: '❌ This war is not available for finalization.',
                    });
                    return;
                }
                if (![war.openerGuildId, war.opponentGuildId].includes(winnerGuildId)) {
                    await interaction.editReply({
                        content: '❌ Invalid winner selected.',
                    });
                    return;
                }
                const member = await interaction.guild?.members.fetch(interaction.user.id).catch(() => null);
                const canFinalize = canMemberFinalizeTicket(member);
                if (!canFinalize) {
                    await interaction.editReply({
                        content: '❌ Only Hoster, Junior Hoster, or Event Hoster can finalize this war.',
                    });
                    return;
                }
                if (!clipsLinkRaw || !isValidClipLink(clipsLinkRaw)) {
                    await interaction.editReply({
                        content: '❌ Invalid link. Please provide a valid URL starting with http:// or https://',
                    });
                    return;
                }
                const { winnerScore, loserScore } = parsedScore;
                const { winnerGuild } = await finalizeWarAndLog(interaction, client, db, war, winnerGuildId, winnerScore, loserScore, clipsLinkRaw);
                await interaction.editReply({
                    content: `✅ War finalized. Winner: **${winnerGuild?.name || 'Unknown'}** | Score: **${winnerScore}-${loserScore}** | Clips: ${clipsLinkRaw}. Closing ticket...`,
                });
                if (interaction.channel && 'delete' in interaction.channel) {
                    await interaction.channel.delete('War finished and recorded').catch(() => null);
                }
                return;
            }
        }
    }
    catch (error) {
        const discordCode = error?.code;
        if (discordCode === 10062 || discordCode === 'InteractionAlreadyReplied') {
            // Ignore expired or already replied interactions
            return;
        }
        console.error('Error while handling interaction:', error);
        if (error && error.stack)
            console.error(error.stack);
        try {
            const info = {
                id: interaction?.id,
                type: interaction?.type,
                userId: interaction?.user?.id,
                guildId: interaction?.guildId,
                commandName: interaction?.commandName,
                customId: interaction?.customId,
            };
            console.error('Interaction info:', JSON.stringify(info));
        }
        catch (e) {
            console.error('Failed to serialize interaction info:', e);
        }
        if (interaction && typeof interaction.isRepliable === 'function' && interaction.isRepliable()) {
            try {
                if (interaction.replied) {
                    await interaction.editReply({
                        content: '❌ An unexpected error occurred while processing your request.',
                    });
                }
                else {
                    await interaction.reply({
                        content: '❌ An unexpected error occurred while processing your request.',
                        flags: MessageFlags.Ephemeral,
                    });
                }
            }
            catch (replyErr) {
                console.error('Failed to send error reply:', replyErr);
                // Ignore if interaction already replied
                if (replyErr?.code !== 'InteractionAlreadyReplied') {
                    // Try followUp as fallback
                    try {
                        if (interaction && typeof interaction.followUp === 'function') {
                            await interaction.followUp({
                                content: '❌ An unexpected error occurred while processing your request.',
                                flags: MessageFlags.Ephemeral,
                            });
                        }
                    }
                    catch (followUpErr) {
                        console.error('Failed to send followUp error:', followUpErr);
                    }
                }
            }
        }
    }
}
function sanitizeWagerChannelName(name) {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .slice(0, 90);
}
function parseAcceptedUsers(rawValue) {
    try {
        const value = JSON.parse(String(rawValue || '[]'));
        if (!Array.isArray(value))
            return [];
        return value.filter(v => typeof v === 'string');
    }
    catch {
        return [];
    }
}
function buildWagerParticipantIds(wager) {
    return [wager.challenger1Id, wager.challenger2Id, wager.challenged1Id, wager.challenged2Id]
        .filter((value) => !!value);
}
async function createWagerTicketChannel(interaction, channelName, participantIds) {
    const discordGuild = interaction.guild;
    if (!discordGuild)
        return null;
    const wagerCategory = await interaction.client.channels.fetch(WAGER_TICKETS_CATEGORY_ID).catch(() => null);
    if (!wagerCategory || wagerCategory.type !== ChannelType.GuildCategory) {
        console.error(`Wager category ${WAGER_TICKETS_CATEGORY_ID} not found or invalid.`);
        return null;
    }
    const permissionOverwrites = [
        {
            id: discordGuild.roles.everyone.id,
            type: OverwriteType.Role,
            deny: [PermissionFlagsBits.ViewChannel],
        },
    ];
    const hosterRole = discordGuild.roles.cache.get(WAR_ROLE_IDS.HOSTER)
        || (await discordGuild.roles.fetch(WAR_ROLE_IDS.HOSTER).catch(() => null));
    if (hosterRole) {
        permissionOverwrites.push({
            id: hosterRole.id,
            type: OverwriteType.Role,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
            deny: [PermissionFlagsBits.SendMessages],
        });
    }
    const juniorHosterRole = discordGuild.roles.cache.get(WAR_ROLE_IDS.JUNIOR_HOSTER)
        || (await discordGuild.roles.fetch(WAR_ROLE_IDS.JUNIOR_HOSTER).catch(() => null));
    if (juniorHosterRole) {
        permissionOverwrites.push({
            id: juniorHosterRole.id,
            type: OverwriteType.Role,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
            deny: [PermissionFlagsBits.SendMessages],
        });
    }
    const eventHosterRole = discordGuild.roles.cache.get(WAR_ROLE_IDS.EVENT_HOSTER)
        || (await discordGuild.roles.fetch(WAR_ROLE_IDS.EVENT_HOSTER).catch(() => null));
    if (eventHosterRole) {
        permissionOverwrites.push({
            id: eventHosterRole.id,
            type: OverwriteType.Role,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
            deny: [PermissionFlagsBits.SendMessages],
        });
    }
    for (const memberId of participantIds) {
        const member = await discordGuild.members.fetch(memberId).catch(() => null);
        if (!member)
            continue;
        permissionOverwrites.push({
            id: member.id,
            type: OverwriteType.Member,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
            deny: [PermissionFlagsBits.SendMessages],
        });
    }
    const channel = await discordGuild.channels
        .create({
        name: sanitizeWagerChannelName(channelName),
        type: ChannelType.GuildText,
        parent: WAGER_TICKETS_CATEGORY_ID,
        permissionOverwrites,
    })
        .catch((error) => {
        console.error('Failed to create wager ticket channel:', error);
        return null;
    });
    return channel;
}
async function unlockWagerTicketChat(interaction, channel, participantIds) {
    for (const userId of participantIds) {
        await channel.permissionOverwrites
            .edit(userId, {
            ViewChannel: true,
            ReadMessageHistory: true,
            SendMessages: true,
        })
            .catch(() => null);
    }
    await channel.permissionOverwrites
        .edit(WAR_ROLE_IDS.HOSTER, {
        ViewChannel: true,
        ReadMessageHistory: true,
        SendMessages: true,
    })
        .catch(() => null);
    await channel.permissionOverwrites
        .edit(WAR_ROLE_IDS.JUNIOR_HOSTER, {
        ViewChannel: true,
        ReadMessageHistory: true,
        SendMessages: true,
    })
        .catch(() => null);
    await channel.permissionOverwrites
        .edit(WAR_ROLE_IDS.EVENT_HOSTER, {
        ViewChannel: true,
        ReadMessageHistory: true,
        SendMessages: true,
    })
        .catch(() => null);
    await channel.send({
        content: `Wager accepted. <@&${WAR_ROLE_IDS.HOSTER}> <@&${WAR_ROLE_IDS.JUNIOR_HOSTER}> <@&${WAR_ROLE_IDS.EVENT_HOSTER}>`,
        allowedMentions: { roles: [WAR_ROLE_IDS.HOSTER, WAR_ROLE_IDS.JUNIOR_HOSTER, WAR_ROLE_IDS.EVENT_HOSTER] },
    }).catch(() => null);
}
//# sourceMappingURL=Interaction.js.map