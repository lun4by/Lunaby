const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const ConversationService = require('../../services/ai/ConversationService.js');
const MariaModDB = require('../../services/database/MariaModDB.js');
const logger = require('../../utils/logger.js');
const emojis = require('../../config/emojis.js');
const prompts = require('../../config/prompts.js');

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
        if (!interaction.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
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

            // Add mod log entry
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

            const aiResponse = await ConversationService.getOneTimeCompletion(prompt);

            await interaction.editReply({ content: aiResponse });

            try {
                const dmEmbed = new EmbedBuilder()
                    .setColor(0xffff00)
                    .setTitle(interaction.t('commands.warn.dm_title', { guild: interaction.guild.name }))
                    .setDescription(interaction.t('commands.warn.dm_desc', { reason, warningCount }))
                    .setFooter({ text: interaction.t('commands.warn.dm_footer') })
                    .setTimestamp();

                await targetUser.send({ embeds: [dmEmbed] });
            } catch (error) {
                logger.error('MODERATION', `Không thể gửi DM cho ${targetUser.tag}`);
            }

            if (warningCount >= 3 && warningCount < 5) {
                try {
                    await targetMember.timeout(
                        60 * 60 * 1000,
                        `Tự động mute sau ${warningCount} lần cảnh cáo`,
                    );

                    const autoMuteEmbed = new EmbedBuilder()
                        .setColor(0xffa500)
                        .setTitle(interaction.t('commands.warn.auto_mute_title'))
                        .setDescription(interaction.t('commands.warn.auto_mute_desc', { tag: targetUser.tag, count: warningCount }))
                        .setFooter({ text: interaction.t('commands.moderation_common.auto_system') })
                        .setTimestamp();

                    await interaction.followUp({ embeds: [autoMuteEmbed] });
                } catch (error) {
                    logger.error('MODERATION', 'Không thể tự động mute thành viên:', error);
                }
            } else if (warningCount >= 5) {
                try {
                    await targetMember.kick(`Tự động kick sau ${warningCount} lần cảnh cáo`);

                    const autoKickEmbed = new EmbedBuilder()
                        .setColor(0xff5555)
                        .setTitle(interaction.t('commands.warn.auto_kick_title'))
                        .setDescription(interaction.t('commands.warn.auto_kick_desc', { tag: targetUser.tag, count: warningCount }))
                        .setFooter({ text: interaction.t('commands.moderation_common.auto_system') })
                        .setTimestamp();

                    await interaction.followUp({ embeds: [autoKickEmbed] });
                } catch (error) {
                    logger.error('MODERATION', 'Không thể tự động kick thành viên:', error);
                }
            }
        } catch (error) {
            logger.error('MODERATION', 'Lỗi khi cảnh cáo thành viên:', error);
            await interaction.editReply({
                content: `${emojis.error} ${interaction.t('commands.warn.error_warn', { error: error.message })}`,
                ephemeral: true,
            });
        }
    },
};