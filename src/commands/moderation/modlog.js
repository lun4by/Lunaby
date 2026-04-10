const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const MariaModDB = require('../../services/database/MariaModDB.js');
const logger = require('../../utils/logger');
const emojis = require('../../config/emojis.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('modlog')
        .setDescription('Xem nhật ký hành động moderation')
        .addUserOption((option) =>
            option.setName('user').setDescription('Lọc theo thành viên (tùy chọn)').setRequired(false),
        )
        .addStringOption((option) =>
            option
                .setName('action')
                .setDescription('Lọc theo loại hành động (tùy chọn)')
                .setRequired(false)
                .addChoices(
                    { name: 'Ban', value: 'ban' },
                    { name: 'Unban', value: 'unban' },
                    { name: 'Kick', value: 'kick' },
                    { name: 'Mute', value: 'mute' },
                    { name: 'Unmute', value: 'unmute' },
                    { name: 'Warn', value: 'warn' },
                    { name: 'Clear Warnings', value: 'clearwarnings' },
                ),
        )
        .addIntegerOption((option) =>
            option
                .setName('limit')
                .setDescription('Số lượng hành động hiển thị (mặc định: 10)')
                .setRequired(false)
                .setMinValue(1)
                .setMaxValue(25),
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
    prefix: { name: 'modlog', aliases: ['ml'], description: 'Xem nhật ký hành động moderation' },
    cooldown: 5,

    async execute(interaction) {
        if (!interaction.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
            return interaction.reply({
                content: `${emojis.error} ${interaction.t('system.no_permission')}`,
                ephemeral: true,
            });
        }

        const targetUser = interaction.options.getUser('user');
        const actionType = interaction.options.getString('action');
        const limit = interaction.options.getInteger('limit') || 10;

        await interaction.deferReply();

        try {
            const logs = await MariaModDB.getModLogs({
                guildId: interaction.guild.id,
                targetId: targetUser ? targetUser.id : null,
                action: actionType,
                limit: limit
            });

            if (logs.length === 0) {
                return interaction.editReply({
                    content: `${emojis.success} ${interaction.t('commands.modlog.no_logs')}`,
                    ephemeral: false,
                });
            }

            const userText = targetUser ? interaction.t('commands.modlog.filter_user', { id: targetUser.id }) : '';
            const actionText = actionType ? interaction.t('commands.modlog.filter_action', { action: actionType }) : '';

            const logEmbed = new EmbedBuilder()
                .setColor(0x00B0F4)
                .setTitle(interaction.t('commands.modlog.embed_title'))
                .setDescription(interaction.t('commands.modlog.embed_desc', { count: logs.length, userText, actionText }))
                .setFooter({ text: interaction.t('commands.moderation_common.log_footer', { guild: interaction.guild.name }) })
                .setTimestamp();

            for (const log of logs) {
                const date = new Date(log.timestamp).toLocaleDateString('vi-VN');
                const time = new Date(log.timestamp).toLocaleTimeString('vi-VN');

                let moderator = interaction.t('commands.moderation_common.unknown_user');
                let target = interaction.t('commands.moderation_common.unknown_user');

                try {
                    const modUser = await interaction.client.users.fetch(log.moderatorId);
                    moderator = modUser.tag;
                } catch (error) {
                    moderator = interaction.t('commands.modlog.unknown_id', { id: log.moderatorId });
                }

                try {
                    const targetUser = await interaction.client.users.fetch(log.targetId);
                    target = targetUser.tag;
                } catch (error) {
                    target = interaction.t('commands.modlog.unknown_id', { id: log.targetId });
                }

                // Định dạng tên hành động
                const actionName =
                    {
                        ban: `${emojis.moderation.ban} Ban`,
                        unban: `${emojis.moderation.unban} Unban`,
                        kick: `${emojis.moderation.kick} Kick`,
                        mute: `${emojis.moderation.mute} Mute`,
                        unmute: `${emojis.moderation.unmute} Unmute`,
                        warn: `${emojis.moderation.warn} Warn`,
                        clearwarnings: `${emojis.moderation.clearWarnings} Clear Warn`,
                    }[log.action] || log.action;

                // Thêm thông tin bổ sung dựa trên loại hành động
                let additionalInfo = '';
                if (log.action === 'mute' && log.duration) {
                    additionalInfo = interaction.t('commands.modlog.field_duration', { duration: log.duration });
                } else if (log.action === 'clearwarnings' && log.count) {
                    additionalInfo = interaction.t('commands.modlog.field_clear_count', { count: log.count });
                }

                const reasonText = log.reason || interaction.t('commands.moderation_common.no_reason');
                logEmbed.addFields({
                    name: `${actionName} - ${date} ${time}`,
                    value: interaction.t('commands.modlog.field_value', { moderator, target, reason: reasonText, additional: additionalInfo }),
                });
            }

            await interaction.editReply({ embeds: [logEmbed] });
        } catch (error) {
            logger.error('modlog', 'Error viewing moderation logs:', error);
            await interaction.editReply({
                content: `${emojis.error} ${interaction.t('commands.modlog.error_modlog', { error: error.message })}`,
                ephemeral: true,
            });
        }
    },
};