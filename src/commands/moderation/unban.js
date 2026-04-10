const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const ConversationService = require('../../services/ai/ConversationService.js');
const { logModAction } = require('../../utils/modUtils.js');
const { sendModLog, createModActionEmbed } = require('../../utils/modLogUtils.js');
const logger = require('../../utils/logger.js');
const emojis = require('../../config/emojis.js');
const prompts = require('../../config/prompts.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('unban')
        .setDescription('Unban một người dùng khỏi server')
        .addStringOption((option) =>
            option.setName('userid').setDescription('ID của người dùng cần unban').setRequired(true),
        )
        .addStringOption((option) =>
            option.setName('reason').setDescription('Lý do unban').setRequired(false),
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
    prefix: { name: 'unban', aliases: ['bỏ cấm'], description: 'Bỏ cấm người dùng' },
    cooldown: 5,

    async execute(interaction) {
        if (!interaction.member.permissions.has(PermissionFlagsBits.BanMembers)) {
            return interaction.reply({
                content: `${emojis.error} Bạn không có quyền sử dụng lệnh này!`,
                ephemeral: true,
            });
        }

        const userId = interaction.options.getString('userid');
        const reason = interaction.options.getString('reason') || 'Không có lý do được cung cấp';

        if (!userId) {
            const PrefixDB = require('../../services/database/PrefixDB');
            const prefix = await PrefixDB.resolvePrefix(interaction.user?.id, interaction.guild?.id);
            return (interaction.message || interaction).reply({ content: `Cách dùng:\n- Gỡ cấm (unban): \`${prefix}unban [id_người_dùng] [lý do]\`` });
        }

        if (!/^\d{17,19}$/.test(userId)) {
            return interaction.reply({
                content: `${emojis.error} ID người dùng không hợp lệ. ID phải là một chuỗi số từ 17-19 chữ số.`,
                ephemeral: true,
            });
        }

        await interaction.deferReply();

        try {
            const banList = await interaction.guild.bans.fetch();
            const bannedUser = banList.find((ban) => ban.user.id === userId);

            if (!bannedUser) {
                return interaction.editReply({
                    content: `${emojis.error} Không tìm thấy thành viên này trong danh sách bị cấm của server.`,
                    ephemeral: true,
                });
            }

            const user = bannedUser.user;

            const prompt = prompts.moderation.unban
                .replace('${username}', user.username)
                .replace('${reason}', reason);

            const aiResponse = await ConversationService.getOneTimeCompletion(prompt);

            await interaction.guild.members.unban(user, reason);

            await logModAction({
                guildId: interaction.guild.id,
                targetId: user.id,
                moderatorId: interaction.user.id,
                action: 'unban',
                reason: reason,
            });

            await interaction.editReply({ content: aiResponse });

            const logEmbed = createModActionEmbed({
                title: `🔓 Đã gỡ cấm thành viên (Unban)`,
                description: `Đã gỡ cấm ${user.tag} khỏi server.`,
                color: 0x00ff00,
                fields: [
                    { name: '👤 Người dùng', value: `${user.tag}`, inline: true },
                    { name: '🆔 ID', value: user.id, inline: true },
                    { name: '👮 Người xử lý', value: `${interaction.user.tag} (<@${interaction.user.id}>)`, inline: true },
                    { name: '📝 Lý do', value: reason, inline: false },
                    { name: '📅 Thời gian', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false },
                ],
                footer: `Server: ${interaction.guild.name}`,
            });

            await sendModLog(interaction.guild, logEmbed, true);
        } catch (error) {
            logger.error('MODERATION', 'Lỗi khi unban người dùng:', error);
            await interaction.editReply({
                content: `${emojis.error} Đã xảy ra lỗi khi gỡ cấm người dùng: ${error.message}`,
                ephemeral: true,
            });
        }
    },
};