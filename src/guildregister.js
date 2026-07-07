import { SlashCommandBuilder, EmbedBuilder, ChannelType, } from 'discord.js';
const GUILD_LEADER_ROLE_ID = '1470554671944040605';
const ALLOWED_GUILD_CREATOR_ROLE_IDS = [
    '1470554652264108204', // Head Moderator
    '1470554645364478016', // Founder
    '1470554648568926219', // Developer
];
export const data = new SlashCommandBuilder()
    .setName('guildregister')
    .setDescription('Registers a new competitive guild')
    .addStringOption(option => option
    .setName('name')
    .setDescription('Guild name')
    .setRequired(true))
    .addUserOption(option => option
    .setName('leader')
    .setDescription('Guild leader')
    .setRequired(true))
    .addStringOption(option => option
    .setName('region')
    .setDescription('Guild region')
    .setRequired(true)
    .addChoices({ name: 'NA', value: 'NA' }, { name: 'EU', value: 'EU' }, { name: 'SA', value: 'SA' }, { name: 'ASIA', value: 'ASIA' }));
export async function execute(interaction, db) {
    try {
        const guildId = interaction.guildId;
        if (!guildId) {
            await interaction.editReply({
                content: 'This command can only be used in a server.',
            });
            return;
        }
        const actorMember = await interaction.guild?.members.fetch(interaction.user.id).catch(() => null);
        const canCreateGuild = !!actorMember && ALLOWED_GUILD_CREATOR_ROLE_IDS.some(roleId => actorMember.roles.cache.has(roleId));
        if (!canCreateGuild) {
            await interaction.editReply({
                content: '❌ Only Founder, Head Moderator, and Developer can create a guild.',
            });
            return;
        }
        const name = interaction.options.getString('name', true);
        const leader = interaction.options.getUser('leader', true);
        const region = interaction.options.getString('region', true);
        // Check whether guild name is already registered
        const existingGuild = db
            .prepare('SELECT id FROM Guilds WHERE name = ?')
            .get(name);
        if (existingGuild) {
            await interaction.editReply({
                content: `⚠️ A guild named **${name}** is already registered.`,
            });
            return;
        }
        // Generate unique guild ID
        const guildUid = `${guildId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        // Insert guild in database
        db.prepare(`INSERT INTO Guilds (id, name, leaderId, coLeaderId, imageUrl, region)
       VALUES (?, ?, ?, ?, ?, ?)`).run(guildUid, name, leader.id, null, null, region);
        // Assign fixed Guild Leader role to leader
        if (interaction.guild) {
            try {
                const fixedLeaderRole = interaction.guild.roles.cache.get(GUILD_LEADER_ROLE_ID)
                    || (await interaction.guild.roles.fetch(GUILD_LEADER_ROLE_ID).catch(() => null));
                const member = await interaction.guild.members.fetch(leader.id);
                if (fixedLeaderRole) {
                    await member.roles.add(fixedLeaderRole);
                }
                else {
                    console.warn(`Guild Leader role ${GUILD_LEADER_ROLE_ID} was not found in guild ${interaction.guild.id}.`);
                }
            }
            catch (e) {
                console.error('Failed to assign fixed Guild Leader role:', e);
            }
        }
        // Fetch members from database
        const managersFromDb = db.prepare('SELECT userId FROM Managers WHERE guildId = ?').all(guildUid);
        const mainsFromDb = db.prepare('SELECT userId FROM MainRosters WHERE guildId = ?').all(guildUid);
        const subsFromDb = db.prepare('SELECT userId FROM SubRosters WHERE guildId = ?').all(guildUid);
        // Build embed description
        let description = `# <:guildleader:1471171042520334477> ${name}\n\n`;
        description += `### <:guildleader:1471171042520334477> Leader\n<@${leader.id}>\n`;
        description += `### <:topentrosa:1471116715264970762> Co-Leader\nNone\n`;
        if (managersFromDb.length > 0) {
            description += `<:topplayericon:1470815685503352883> **Managers**\n`;
            description += managersFromDb.map((m) => `<@${m.userId}>`).join(' ') + '\n\n';
        }
        else {
            description += `<:topplayericon:1470815685503352883> **Managers**\nNone\n\n`;
        }
        description += `:globe_with_meridians: **Region Stats: ${region}**\n`;
        description += `**Regions:** ${region}\n`;
        description += `:signal_strength: **W/L:** 0/0\n`;
        description += `━━━━━━━━━━━━━━━━━━━━━━\n`;
        description += `:crossed_swords: **Main Roster (${region})**\n`;
        if (mainsFromDb.length > 0) {
            description += mainsFromDb.map((m) => `<@${m.userId}>`).join('\n') + '\n\n';
        }
        else {
            description += 'None\n\n';
        }
        description += `:dagger: **Sub Roster (${region})**\n`;
        if (subsFromDb.length > 0) {
            description += subsFromDb.map((s) => `<@${s.userId}>`).join('\n');
        }
        else {
            description += 'None';
        }
        // Build panel embed for public channel
        const embed = new EmbedBuilder()
            .setDescription(description)
            .setColor('#2a8900')
            .setThumbnail(interaction.guild?.iconURL() || null);
        // Send panel embed in specific channel (Forum or Text)
        const channelId = '1470554848683364403';
        const channel = (await interaction.client.channels.fetch(channelId).catch(() => null));
        console.log('Channel found:', !!channel, channel?.name, channel?.type);
        console.log('Has threads?', !!channel?.threads);
        if (channel && channel.type === ChannelType.GuildForum) {
            try {
                console.log('Creating forum thread for guild:', name);
                const thread = await channel.threads.create({
                    name: `🏰 ${name}`,
                    message: {
                        embeds: [embed],
                    },
                    autoArchiveDuration: 10080, // 7 days
                });
                console.log('Thread created:', thread.id, thread.name);
                db.prepare('UPDATE Guilds SET panelMessageId = ?, panelChannelId = ? WHERE id = ?').run(thread.id, channel.id, guildUid);
            }
            catch (e) {
                console.error('Error creating forum thread or sending message:', e);
            }
        }
        else if (channel && channel.threads && typeof channel.threads.create === 'function') {
            try {
                console.log('Creating text-channel thread for guild:', name);
                const thread = await channel.threads.create({
                    name: `🏰 ${name}`,
                    autoArchiveDuration: 10080, // 7 days
                });
                const panelMessage = await thread.send({ embeds: [embed] });
                db.prepare('UPDATE Guilds SET panelMessageId = ?, panelChannelId = ? WHERE id = ?').run(panelMessage.id, thread.id, guildUid);
            }
            catch (e) {
                console.error('Error creating text-channel thread or sending message:', e);
            }
        }
        else {
            console.error('Channel not found or does not support threads');
        }
        await interaction.editReply({
            content: `✅ Guild **${name}** registered successfully!`,
        });
    }
    catch (error) {
        console.error('Error registering guild:', error);
        await interaction.editReply({
            content: '❌ An unexpected error occurred while processing your request.',
        });
    }
}
//# sourceMappingURL=guildregister.js.map