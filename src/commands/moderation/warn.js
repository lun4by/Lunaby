const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const ConversationService = require('../../services/ai/ConversationService.js');
const MariaModDB = require('../../services/database/MariaModDB.js');
const logger = require('../../utils/logger.js');
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
                content: '❌ Bạn không có quyền sử dụng lệnh này!',
                ephemeral: true,
            });
        }

        const targetUser = interaction.options.getUser('user');
        const targetMember = interaction.options.getMember('user');
        const reason = interaction.options.getString('reason');

        if (!targetUser || !reason) {
            const PrefixDB = require('../../services/database/PrefixDB');
            const prefix = await PrefixDB.resolvePrefix(interaction.user?.id, interaction.guild?.id);
            return (interaction.message || interaction).reply({ content: `Cách dùng:\n- Cảnh cáo (warn): \`${prefix}warn @user [lý do]\`` });
        }

        if (!targetMember) {
            return interaction.reply({
                content: '❌ Không tìm thấy thành viên này trong server!',
                ephemeral: true,
            });
        }

        if (targetUser.bot) {
            return interaction.reply({
                content: '❌ Không thể cảnh cáo bot!',
                ephemeral: true,
            });
        }

        if (
            targetMember.roles.highest.position >= interaction.member.roles.highest.position &&
            interaction.user.id !== interaction.guild.ownerId
        ) {
            return interaction.reply({
                content: '❌ Không thể thực hiện hành động này do người dùng có quyền bảo vệ cao hơn!',
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
                    content: '❌ Đã xảy ra lỗi khi lưu cảnh cáo vào cơ sở dữ liệu!',
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

            const aiResponse = await ConversationService.getCompletion(prompt);

            await interaction.editReply({ content: aiResponse });

            try {
                const dmEmbed = new EmbedBuilder()
                    .setColor(0xffff00)
                    .setTitle(`Bạn đã bị cảnh cáo trong ${interaction.guild.name}`)
                    .setDescription(`**Lý do:** ${reason}\n**Số lần cảnh cáo:** ${warningCount}`)
                    .setFooter({ text: `Nếu bạn tiếp tục vi phạm quy tắc, bạn có thể bị mute hoặc ban.` })
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
                        .setTitle(`🔇 Thành viên đã bị tự động mute`)
                        .setDescription(
                            `${targetUser.tag} đã bị tự động mute trong 1 giờ sau ${warningCount} lần cảnh cáo.`,
                        )
                        .setFooter({ text: `Hệ thống tự động` })
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
                        .setTitle(`👢 Thành viên đã bị tự động kick`)
                        .setDescription(
                            `${targetUser.tag} đã bị tự động kick sau ${warningCount} lần cảnh cáo.`,
                        )
                        .setFooter({ text: `Hệ thống tự động` })
                        .setTimestamp();

                    await interaction.followUp({ embeds: [autoKickEmbed] });
                } catch (error) {
                    logger.error('MODERATION', 'Không thể tự động kick thành viên:', error);
                }
            }
        } catch (error) {
            logger.error('MODERATION', 'Lỗi khi cảnh cáo thành viên:', error);
            await interaction.editReply({
                content: `❌ Đã xảy ra lỗi khi cảnh cáo người dùng: ${error.message}`,
                ephemeral: true,
            });
        }
    },
};