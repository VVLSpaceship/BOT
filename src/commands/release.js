import { SlashCommandBuilder } from 'discord.js';
import { getMemberByDiscordId, releaseMember } from '../siteapi.js';
import { setCooldown } from '../database.js';
export const data = new SlashCommandBuilder()
    .setName('release')
    .setDescription('Release yourself from your current guild');
export async function execute(interaction, db) {
    if (!interaction.deferred && !interaction.replied)
        await interaction.deferReply({ ephemeral: true });
    const memberData = await getMemberByDiscordId(interaction.user.id);
    if (!memberData) {
        await interaction.editReply('❌ You are not registered in any guild on the site.');
        return;
    }
    const result = await releaseMember(interaction.user.id);
    if (!result.removed) {
        await interaction.editReply('❌ Could not remove you from your guild.');
        return;
    }
    // Set cooldown
    setCooldown(db, interaction.user.id);
    // Remove guild role if set
    if (memberData.discord_role_id && interaction.guild) {
        try {
            const member = await interaction.guild.members.fetch(interaction.user.id);
            await member.roles.remove(memberData.discord_role_id);
        }
        catch { /* ignore role removal errors */ }
    }
    await interaction.editReply(`✅ You have been released from **${memberData.org_name}** [${memberData.tag}].`);
}
//# sourceMappingURL=release.js.map