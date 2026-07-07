import { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, } from 'discord.js';
const FOUNDER_ROLE_ID = '1470554645364478016';
const WAR_TICKET_PANEL_CHANNEL_ID = '1473103963112083466';
export const data = new SlashCommandBuilder()
    .setName('warticket')
    .setDescription('Publishes the War Ticket panel in the configured channel');
export async function execute(interaction, db) {
    try {
        if (!interaction.guildId || !interaction.guild) {
            await interaction.editReply({
                content: 'This command can only be used in a server.',
            });
            return;
        }
        const actorMember = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
        const isFounder = !!actorMember && actorMember.roles.cache.has(FOUNDER_ROLE_ID);
        if (!isFounder) {
            await interaction.editReply({
                content: '❌ Only the Founder can use this command.',
            });
            return;
        }
        const channel = await interaction.client.channels.fetch(WAR_TICKET_PANEL_CHANNEL_ID).catch(() => null);
        if (!channel || !channel.isTextBased() || !('send' in channel)) {
            await interaction.editReply({
                content: '❌ War Ticket panel channel was not found or is not a text channel.',
            });
            return;
        }
        const components = [
            new ContainerBuilder()
                .setAccentColor(0x2a8900)
                .addTextDisplayComponents(new TextDisplayBuilder().setContent('# <:deepwoken:1470975025988501515> War Ticket'))
                .addTextDisplayComponents(new TextDisplayBuilder().setContent('ℹ️ Use this panel to start the flow of creating a war between guilds.\n\n' +
                '• Click the button below to start\n' +
                '• Select the opponent guild\n' +
                '• Enter war date and time\n\n' +
                'The bot will create a private channel to organize the details.'))
                .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
                .addTextDisplayComponents(new TextDisplayBuilder().setContent('### **Start War**\nCreate a new war between guilds'))
                .addActionRowComponents(new ActionRowBuilder().addComponents(new ButtonBuilder()
                .setStyle(ButtonStyle.Success)
                .setLabel('Start War')
                .setCustomId('wt_start_open')))
                .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)),
        ];
        await channel.send({
            flags: MessageFlags.IsComponentsV2,
            components,
        });
        await interaction.editReply({
            content: `✅ War Ticket panel sent in <#${WAR_TICKET_PANEL_CHANNEL_ID}>.`,
        });
    }
    catch (error) {
        console.error('Error executing /warticket:', error);
        await interaction.editReply({
            content: '❌ An unexpected error occurred while sending the War Ticket panel.',
        });
    }
}
//# sourceMappingURL=warticket.js.map