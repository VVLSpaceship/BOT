import { SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, } from 'discord.js';
import { getSetting } from '../database.js';
export const data = new SlashCommandBuilder()
    .setName('registerteam')
    .setDescription('Register a new guild on the site (staff only)');
export async function execute(interaction, db) {
    const staffRoleId = getSetting(db, 'staff_role_id');
    if (staffRoleId && interaction.guild) {
        const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
        if (!member?.roles.cache.has(staffRoleId)) {
            await interaction.reply({ content: '❌ No permission.', ephemeral: true });
            return;
        }
    }
    const modal = new ModalBuilder().setCustomId('registerteam_modal').setTitle('Register New Guild');
    modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('rt_tag').setLabel('Tag (max 5 chars, e.g. VVS)').setStyle(TextInputStyle.Short).setMaxLength(5).setRequired(true)), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('rt_name').setLabel('Guild Name').setStyle(TextInputStyle.Short).setRequired(true)), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('rt_region').setLabel('Region (NA / EU / ASIA / OCE / SA)').setStyle(TextInputStyle.Short).setRequired(true).setValue('NA')), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('rt_logo').setLabel('Logo URL (optional)').setStyle(TextInputStyle.Short).setRequired(false)));
    await interaction.showModal(modal);
}
//# sourceMappingURL=registerteam.js.map