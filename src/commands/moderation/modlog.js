const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const MariaModDB = require('../../services/database/MariaModDB');
const { formatDuration } = require('../../utils/timeUtil');
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
                content: `${emojis.error} Bạn không có quyền sử dụng lệnh này!`,
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
                    content: `${emojis.success} Hệ thống chưa ghi nhận lược sử báo cáo nào phù hợp với bộ lọc!`,
                    ephemeral: false,
                });
            }

            const logEmbed = new EmbedBuilder()
                .setColor(0x00B0F4)
                .setTitle('📋 Lược sử Báo cáo Kiểm duyệt')
                .setDescription(
                    `Hiển thị **${logs.length}** hành động kiểm duyệt gần nhất${targetUser ? ` đối với <@${targetUser.id}>` : ''}${actionType ? ` (Bộ lọc: \`${actionType}\`)` : ''}.`,
                )
                .setFooter({ text: `Server: ${interaction.guild.name}` })
                .setTimestamp();

            for (const log of logs) {
                const date = new Date(log.timestamp).toLocaleDateString('vi-VN');
                const time = new Date(log.timestamp).toLocaleTimeString('vi-VN');

                let moderator = 'Không rõ';
                let target = 'Không rõ';

                try {
                    const modUser = await interaction.client.users.fetch(log.moderatorId);
                    moderator = modUser.tag;
                } catch (error) {
                    moderator = `Không rõ (ID: ${log.moderatorId})`;
                }

                try {
                    const targetUser = await interaction.client.users.fetch(log.targetId);
                    target = targetUser.tag;
                } catch (error) {
                    target = `Không rõ (ID: ${log.targetId})`;
                }

                // Định dạng tên hành động
                const actionName =
                    {
                        ban: '🔨 Ban',
                        unban: '🔓 Unban',
                        kick: '👢 Kick',
                        mute: '🔇 Mute',
                        unmute: '🔊 Unmute',
                        warn: '⚠️ Warn',
                        clearwarnings: '🧹 Clear Warn',
                    }[log.action] || log.action;

                // Thêm thông tin bổ sung dựa trên loại hành động
                let additionalInfo = '';
                if (log.action === 'mute' && log.duration) {
                    additionalInfo = `\n**Thời gian:** ${log.duration} phút`;
                } else if (log.action === 'clearwarnings' && log.count) {
                    additionalInfo = `\n**Số cảnh cáo đã xóa:** ${log.count}`;
                }

                logEmbed.addFields({
                    name: `${actionName} - ${date} ${time}`,
                    value: `**👮 Người xử lý:** ${moderator}\n**👤 Người dùng:** ${target}\n**📝 Lý do:** ${log.reason || 'Không có lý do'}${additionalInfo}`,
                });
            }

            await interaction.editReply({ embeds: [logEmbed] });
        } catch (error) {
            logger.error('MODLOG', 'Lỗi khi xem nhật ký moderation:', error);
            await interaction.editReply({
                content: `${emojis.error} Đã xảy ra lỗi khi xem lược sử báo cáo: ${error.message}`,
                ephemeral: true,
            });
        }
    },
};