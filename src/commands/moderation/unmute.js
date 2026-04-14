const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const ConversationService = require('../../services/ai/ConversationService.js');
const { logModAction } = require('../../utils/moderation/modUtils.js');
const MariaModDB = require('../../services/database/MariaModDB.js');
const logger = require('../../utils/core/logger.js');
const emojis = require('../../config/emojis.js');
const { sendModLog, createModActionEmbed } = require('../../utils/moderation/modLogUtils.js');
const prompts = require('../../config/prompts.js');
const { hasMemberPermission } = require('../../utils/discord/permissionUtils.js');

const { createEmbed } = require('../../utils/discord/builderFactory');
module.exports = {
    data: new SlashCommandBuilder()
        .setName('unmute')
        .setDescription('Unmute (bỏ timeout) một thành viên')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('Thành viên cần unmute')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('reason')
                .setDescription('Lý do unmute')
                .setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
    prefix: { name: 'unmute', aliases: ['bỏ cấm'], description: 'Bỏ cấm người dùng' },
    cooldown: 5,

    async execute(interaction) {
        if (!hasMemberPermission(interaction.member, PermissionFlagsBits.ModerateMembers)) {
            return interaction.reply({
                content: `${emojis.error} ${interaction.t('system.no_permission')}`,
                ephemeral: true
            });
        }

        const targetUser = interaction.options.getUser('user');
        const targetMember = interaction.options.getMember('user');
        const reason = interaction.options.getString('reason') || interaction.t('commands.moderation_common.no_reason');

        if (!targetUser) {
            const PrefixDB = require('../../services/database/PrefixDB');
            const prefix = await PrefixDB.resolvePrefix(interaction.user?.id, interaction.guild?.id);
            return (interaction.message || interaction).reply({ content: interaction.t('commands.unmute.usage', { prefix }) });
        }

        if (!targetMember) {
            return interaction.reply({
                content: `${emojis.error} ${interaction.t('commands.moderation_common.user_not_found')}`,
                ephemeral: true
            });
        }

        if (!targetMember.moderatable) {
            return interaction.reply({
                content: `${emojis.error} ${interaction.t('commands.moderation_common.cant_action_higher_role')}`,
                ephemeral: true
            });
        }

        if (!targetMember.communicationDisabledUntil) {
            return interaction.reply({
                content: `${emojis.error} ${interaction.t('commands.unmute.not_muted')}`,
                ephemeral: true
            });
        }

        await interaction.deferReply();

        try {
            const prompt = prompts.moderation.unmute
                .replace('${username}', targetUser.username)
                .replace('${reason}', reason);
            const aiResponsePromise = ConversationService.getOneTimeCompletion(prompt);

            await targetMember.timeout(null, reason);

            await logModAction({
                guildId: interaction.guild.id,
                targetId: targetUser.id,
                moderatorId: interaction.user.id,
                action: 'unmute',
                reason: reason
            });

            const aiResponse = await aiResponsePromise;
            await interaction.editReply({
                content: aiResponse || `${emojis.success} ${interaction.t('commands.unmute.success_fallback', { tag: targetUser.tag })}`,
            });

            const logEmbed = createModActionEmbed({
                title: interaction.t('commands.unmute.log_title'),
                description: interaction.t('commands.unmute.log_desc', { tag: targetUser.tag }),
                color: 0x00ff00,
                fields: [
                    { name: interaction.t('commands.moderation_common.log_field_user'), value: `${targetUser.tag} (<@${targetUser.id}>)`, inline: true },
                    { name: interaction.t('commands.moderation_common.log_field_id'), value: targetUser.id, inline: true },
                    { name: interaction.t('commands.moderation_common.log_field_mod'), value: `${interaction.user.tag} (<@${interaction.user.id}>)`, inline: true },
                    { name: interaction.t('commands.moderation_common.log_field_reason'), value: reason, inline: false },
                    { name: interaction.t('commands.moderation_common.log_field_time'), value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false }
                ],
                footer: interaction.t('commands.moderation_common.log_footer', { guild: interaction.guild.name })
            });

            await sendModLog(interaction.guild, logEmbed, true);

            try {
                const dmEmbed = createEmbed()
                    .setColor(0x00FF00)
                    .setTitle(interaction.t('commands.unmute.dm_title', { guild: interaction.guild.name }))
                    .setDescription(interaction.t('commands.unmute.dm_desc', { reason }))
                    .setTimestamp();

                await targetUser.send({ embeds: [dmEmbed] });
            } catch (error) {
                logger.error('moderation', `Failed to send DM to ${targetUser.tag}`);
            }

        } catch (error) {
            logger.error('moderation', 'Error unmuting member:', error);
            await interaction.editReply({
                content: `${emojis.error} ${interaction.t('commands.unmute.error_unmute', { error: error.message })}`,
                ephemeral: true
            });
        }
    },
};
