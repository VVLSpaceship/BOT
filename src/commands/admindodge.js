import { SlashCommandBuilder } from 'discord.js';
export const data = new SlashCommandBuilder()
    .setName('admindodge')
    .setDescription('Force dodge a war or wager ticket (Admin only)')
    .addStringOption(option => option
    .setName('type')
    .setDescription('Type of ticket to dodge')
    .setRequired(true)
    .addChoices({ name: 'War', value: 'war' }, { name: 'Wager', value: 'wager' }))
    .addStringOption(option => option
    .setName('ticket_id')
    .setDescription('ID of the ticket to dodge')
    .setRequired(true))
    .addStringOption(option => option
    .setName('reason')
    .setDescription('Reason for dodging the ticket')
    .setRequired(true));
export async function execute(interaction, db) {
    try {
        const member = await interaction.guild?.members.fetch(interaction.user.id).catch(() => null);
        const allowedRoles = ['1470554662687215741', '1470554664238845962', '1470554662687215741']; // Hoster roles
        const hasPermission = !!member && allowedRoles.some(roleId => member.roles.cache.has(roleId));
        if (!hasPermission) {
            await interaction.editReply({
                content: '❌ Only Hoster, Junior Hoster, or Event Hoster can use this command.',
            });
            return;
        }
        const type = interaction.options.getString('type', true);
        const ticketId = interaction.options.getString('ticket_id', true);
        const reason = interaction.options.getString('reason', true);
        if (!ticketId || ticketId.trim() === '') {
            await interaction.editReply({
                content: '❌ Invalid ticket ID.',
            });
            return;
        }
        if (type === 'war') {
            const war = db.prepare('SELECT * FROM Wars WHERE channelId = ?').get(ticketId);
            if (!war) {
                await interaction.editReply({
                    content: '❌ War ticket not found.',
                });
                return;
            }
            if (war.status === 'FINISHED' || war.status === 'DODGED') {
                await interaction.editReply({
                    content: '❌ This war is already closed.',
                });
                return;
            }
            // Dodge the war
            db.prepare('UPDATE Wars SET status = ?, closedAt = CURRENT_TIMESTAMP WHERE id = ?').run('DODGED', ticketId);
            // Log the action
            const logChannel = await interaction.client.channels.fetch('1470554772678512794').catch(() => null);
            if (logChannel && logChannel.isTextBased() && 'send' in logChannel) {
                await logChannel.send(`⚠️ Admin Dodge: War #${ticketId} force dodged by <@${interaction.user.id}>. Reason: ${reason}`);
            }
            // Notify in the channel
            if (war.channelId) {
                const channel = await interaction.client.channels.fetch(war.channelId).catch(() => null);
                if (channel && channel.isTextBased() && 'send' in channel) {
                    await channel.send(`⚠️ This war has been force dodged by an admin. Reason: ${reason}`);
                }
            }
            // Try to delete the channel after a delay
            if (war.channelId) {
                setTimeout(async () => {
                    const channel = await interaction.client.channels.fetch(war.channelId).catch(() => null);
                    if (channel && 'delete' in channel) {
                        await channel.delete(`War ticket force dodged by admin: ${reason}`).catch(() => null);
                    }
                }, 3000);
            }
            await interaction.editReply({
                content: `✅ War ticket #${ticketId} has been force dodged.`,
            });
        }
        else if (type === 'wager') {
            const wager = db.prepare('SELECT * FROM Wagers WHERE channelId = ?').get(ticketId);
            if (!wager) {
                await interaction.editReply({
                    content: '❌ Wager ticket not found.',
                });
                return;
            }
            if (wager.status === 'CLOSED' || wager.status === 'DODGED') {
                await interaction.editReply({
                    content: '❌ This wager is already closed.',
                });
                return;
            }
            // Dodge the wager
            db.prepare('UPDATE Wagers SET status = ?, closedAt = CURRENT_TIMESTAMP WHERE id = ?').run('DODGED', ticketId);
            // Log the action
            const logChannel = await interaction.client.channels.fetch('1470554772678512794').catch(() => null);
            if (logChannel && logChannel.isTextBased() && 'send' in logChannel) {
                await logChannel.send(`⚠️ Admin Dodge: Wager #${ticketId} force dodged by <@${interaction.user.id}>. Reason: ${reason}`);
            }
            // Notify in the channel
            if (wager.channelId) {
                const channel = await interaction.client.channels.fetch(wager.channelId).catch(() => null);
                if (channel && channel.isTextBased() && 'send' in channel) {
                    await channel.send(`⚠️ This wager has been force dodged by an admin. Reason: ${reason}`);
                }
            }
            // Try to delete the channel after a delay
            if (wager.channelId) {
                setTimeout(async () => {
                    const channel = await interaction.client.channels.fetch(wager.channelId).catch(() => null);
                    if (channel && 'delete' in channel) {
                        await channel.delete(`Wager ticket force dodged by admin: ${reason}`).catch(() => null);
                    }
                }, 3000);
            }
            await interaction.editReply({
                content: `✅ Wager ticket #${ticketId} has been force dodged.`,
            });
        }
    }
    catch (error) {
        console.error('Error in admindodge command:', error);
        await interaction.editReply({
            content: '❌ An unexpected error occurred.',
        });
    }
}
//# sourceMappingURL=admindodge.js.map