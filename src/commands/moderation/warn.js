const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const ConversationService = require('../../services/ai/ConversationService.js');
const MariaModDB = require('../../services/database/MariaModDB.js');
const logger = require('../../utils/core/logger.js');
const emojis = require('../../config/emojis.js');
const prompts = require('../../config/prompts.js');
const { hasMemberPermission } = require('../../utils/discord/permissionUtils.js');

const { createEmbed } = require('../../utils/discord/builderFactory');
module.exports = {
    data: new SlashCommandBuilder()
        .setName('warn')
        .setDescription('Cảnh cáo một thành viên')
        .addUserOption((option) =>
            option.setName('user').setDescription('Thành viên cần cảnh cáo').setRequired(true),
        )
        .addStringOption((option) =>
            option.setName('reason').setDescription('Lý do cảnh cáo').setRequired(true),
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
    prefix: { name: 'warn', aliases: ['w'], description: 'Cảnh cáo thành viên' },
    cooldown: 5,

    async execute(interaction) {
        if (!hasMemberPermission(interaction.member, PermissionFlagsBits.ModerateMembers)) {
            return interaction.reply({
                content: `${emojis.error} ${interaction.t('system.no_permission')}`,
                ephemeral: true,
            });
        }

        const targetUser = interaction.options.getUser('user');
        const targetMember = interaction.options.getMember('user');
        const reason = interaction.options.getString('reason');

        if (!targetUser || !reason) {
            const PrefixDB = require('../../services/database/PrefixDB');
            const prefix = await PrefixDB.resolvePrefix(interaction.user?.id, interaction.guild?.id);
            return (interaction.message || interaction).reply({ content: interaction.t('commands.warn.usage', { prefix }) });
        }

        if (!targetMember) {
            return interaction.reply({
                content: `${emojis.error} ${interaction.t('commands.moderation_common.user_not_found')}`,
                ephemeral: true,
            });
        }

        if (targetUser.bot) {
            return interaction.reply({
                content: `${emojis.error} ${interaction.t('commands.warn.cannot_warn_bot')}`,
                ephemeral: true,
            });
        }

        if (
            targetMember.roles.highest.position >= interaction.member.roles.highest.position &&
            interaction.user.id !== interaction.guild.ownerId
        ) {
            return interaction.reply({
                content: `${emojis.error} ${interaction.t('commands.moderation_common.cant_action_higher_role')}`,
                ephemeral: true,
            });
        }

        await interaction.deferReply();

        try {
            const success = await MariaModDB.addWarning(
                interaction.guild.id,
                targetUser.id,
                interaction.user.id,
                reason
            );

            if (!success) {
                return interaction.editReply({
                    content: `${emojis.error} ${interaction.t('commands.warn.db_error')}`,
                    ephemeral: true,
                });
            }

            // Thêm bản ghi mod log
            await MariaModDB.addModLog(
                interaction.guild.id,
                targetUser.id,
                interaction.user.id,
                'warn',
                { reason }
            );

            const warningCount = await MariaModDB.getWarningCount(
                interaction.guild.id,
                targetUser.id
            );

            const prompt = prompts.moderation.warning
                .replace('${username}', targetUser.username)
                .replace('${reason}', reason)
                .replace('${warningCount}', warningCount);
            const aiResponsePromise = ConversationService.getOneTimeCompletion(prompt);
            const aiResponse = await aiResponsePromise;

            await interaction.editReply({
                content: aiResponse || `${emojis.success} ${interaction.t('commands.warn.success_fallback', { tag: targetUser.tag, count: warningCount })}`,
            });

            try {
                const dmEmbed = createEmbed()
                    .setColor(0xffff00)
                    .setTitle(interaction.t('commands.warn.dm_title', { guild: interaction.guild.name }))
                    .setDescription(interaction.t('commands.warn.dm_desc', { reason, warningCount }))
                    .setFooter({ text: interaction.t('commands.warn.dm_footer') })
                    .setTimestamp();

                await targetUser.send({ embeds: [dmEmbed] });
            } catch (error) {
                logger.error('moderation', `Failed to send DM to ${targetUser.tag}`);
            }

            if (warningCount >= 3 && warningCount < 5) {
                try {
                    await targetMember.timeout(
                        60 * 60 * 1000,
                        interaction.t('commands.warn.auto_mute_reason', { count: warningCount }),
                    );

                    const autoMuteEmbed = createEmbed()
                        .setColor(0xffa500)
                        .setTitle(interaction.t('commands.warn.auto_mute_title'))
                        .setDescription(interaction.t('commands.warn.auto_mute_desc', { tag: targetUser.tag, count: warningCount }))
                        .setFooter({ text: interaction.t('commands.moderation_common.auto_system') })
                        .setTimestamp();

                    await interaction.followUp({ embeds: [autoMuteEmbed] });
                } catch (error) {
                    logger.error('moderation', 'Failed to auto-mute member:', error);
                }
            } else if (warningCount >= 5) {
                try {
                    await targetMember.kick(interaction.t('commands.warn.auto_kick_reason', { count: warningCount }));

                    const autoKickEmbed = createEmbed()
                        .setColor(0xff5555)
                        .setTitle(interaction.t('commands.warn.auto_kick_title'))
                        .setDescription(interaction.t('commands.warn.auto_kick_desc', { tag: targetUser.tag, count: warningCount }))
                        .setFooter({ text: interaction.t('commands.moderation_common.auto_system') })
                        .setTimestamp();

                    await interaction.followUp({ embeds: [autoKickEmbed] });
                } catch (error) {
                    logger.error('moderation', 'Failed to auto-kick member:', error);
                }
            }
        } catch (error) {
            logger.error('moderation', 'Error warning member:', error);
            await interaction.editReply({
                content: `${emojis.error} ${interaction.t('commands.warn.error_warn', { error: error.message })}`,
                ephemeral: true,
            });
        }
    },
};
