const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const MariaModDB = require('../../services/database/MariaModDB.js');
const logger = require('../../utils/logger.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('warnings')
        .setDescription('Xem danh sách cảnh cáo của một thành viên')
        .addUserOption((option) =>
            option.setName('user').setDescription('Thành viên cần xem cảnh cáo').setRequired(true),
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
    prefix: { name: 'warnings', aliases: ['w'], description: 'Xem danh sách cảnh cáo' },
    cooldown: 5,

    async execute(interaction) {
        if (!interaction.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
            return interaction.reply({
                content: '❌ Bạn không có quyền sử dụng lệnh này!',
                ephemeral: true,
            });
        }

        const targetUser = interaction.options.getUser('user');

        if (!targetUser) {
            const PrefixDB = require('../../services/database/PrefixDB');
            const prefix = await PrefixDB.resolvePrefix(interaction.user?.id, interaction.guild?.id);
            return (interaction.message || interaction).reply({ content: `Cách dùng:\n- Xem cảnh cáo: \`${prefix}warnings @user\`` });
        }

        await interaction.deferReply();

        try {
            const warnings = await MariaModDB.getWarnings(
                interaction.guild.id,
                targetUser.id
            );

            if (warnings.length === 0) {
                return interaction.editReply({
                    content: '✅ Người dùng này hiện không có cảnh cáo nào!',
                    ephemeral: false,
                });
            }

            const warningsEmbed = new EmbedBuilder()
                .setColor(0xffff00)
                .setTitle(`⚠️ Danh sách cảnh cáo`)
                .setDescription(`**👤 Người dùng:** ${targetUser.tag}\n**🚨 Tổng số cảnh cáo:** ${warnings.length}`)
                .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
                .setFooter({ text: `ID: ${targetUser.id}` })
                .setTimestamp();

            const recentWarnings = warnings.slice(0, 10);

            recentWarnings.forEach((warning, index) => {
                const moderator = interaction.guild.members.cache.get(warning.moderatorId);
                const moderatorName = moderator ? moderator.user.tag : 'Không rõ';
                const date = new Date(warning.timestamp).toLocaleDateString('vi-VN');
                const time = new Date(warning.timestamp).toLocaleTimeString('vi-VN');

                warningsEmbed.addFields({
                    name: `Cảnh cáo #${index + 1} - ${date} ${time}`,
                    value: `**Lý do:** ${warning.reason}\n**Người cảnh cáo:** ${moderatorName}`,
                });
            });

            if (warnings.length > 10) {
                warningsEmbed.addFields({
                    name: 'Lưu ý',
                    value: `Chỉ hiển thị 10/${warnings.length} cảnh cáo gần nhất.`,
                });
            }

            await interaction.editReply({ embeds: [warningsEmbed] });
        } catch (error) {
            logger.error('MODERATION', 'Lỗi khi xem cảnh cáo của thành viên:', error);
            await interaction.editReply({
                content: `❌ Đã xảy ra lỗi khi truy xuất dữ liệu cảnh cáo: ${error.message}`,
                ephemeral: true,
            });
        }
    },
};