const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const MariaModDB = require('../../services/database/MariaModDB.js');
const ConversationService = require('../../services/ai/ConversationService.js');
const logger = require('../../utils/logger.js');
const prompts = require('../../config/prompts.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('clearwarnings')
        .setDescription('Xóa cảnh cáo của một thành viên')
        .addUserOption((option) =>
            option.setName('user').setDescription('Thành viên cần xóa cảnh cáo').setRequired(true),
        )
        .addStringOption((option) =>
            option
                .setName('type')
                .setDescription('Loại xóa cảnh cáo')
                .setRequired(true)
                .addChoices({ name: 'Tất cả', value: 'all' }, { name: 'Mới nhất', value: 'latest' }),
        )
        .addStringOption((option) =>
            option.setName('reason').setDescription('Lý do xóa cảnh cáo').setRequired(false),
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
    prefix: { name: 'clearwarnings', aliases: ['cw'], description: 'Xóa cảnh cáo' },
    cooldown: 5,

    async execute(interaction) {
        if (!interaction.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
            return interaction.reply({
                content: '❌ Bạn không có quyền sử dụng lệnh này!',
                ephemeral: true,
            });
        }

        const targetUser = interaction.options.getUser('user');
        const type = interaction.options.getString('type');
        const reason = interaction.options.getString('reason') || 'Không có lý do cụ thể';

        if (!targetUser || !type) {
            const PrefixDB = require('../../services/database/PrefixDB');
            const prefix = await PrefixDB.resolvePrefix(interaction.user?.id, interaction.guild?.id);
            return (interaction.message || interaction).reply({ content: `Cách dùng:\n- Xóa cảnh cáo: \`${prefix}clearwarnings @user [all|latest]\`` });
        }

        await interaction.deferReply();

        try {
            const warningCount = await MariaModDB.getWarningCount(
                interaction.guild.id,
                targetUser.id
            );

            if (warningCount === 0) {
                return interaction.editReply({
                    content: '✅ Người dùng này hiện không có cảnh cáo nào!',
                    ephemeral: false,
                });
            }

            let deletedCount = 0;

            if (type === 'all') {
                deletedCount = await MariaModDB.clearAllWarnings(
                    interaction.guild.id,
                    targetUser.id
                );
            } else if (type === 'latest') {
                deletedCount = await MariaModDB.clearLatestWarning(
                    interaction.guild.id,
                    targetUser.id
                );
            }

            await MariaModDB.addModLog(
                interaction.guild.id,
                targetUser.id,
                interaction.user.id,
                'clearwarnings',
                { reason, count: deletedCount }
            );

            const prompt = prompts.moderation.clearwarnings
                .replace('${type}', type === 'all' ? 'tất cả' : 'cảnh cáo mới nhất')
                .replace('${username}', targetUser.username)
                .replace('${reason}', reason)
                .replace('${deletedCount}', deletedCount);

            const aiResponse = await ConversationService.getOneTimeCompletion(prompt);

            await interaction.editReply({ content: aiResponse });

            try {
                const dmEmbed = new EmbedBuilder()
                    .setColor(0x00ff00)
                    .setTitle(
                        `Cảnh cáo của bạn đã được xóa tại ${interaction.guild.name}`,
                    )
                    .setDescription(
                        `${type === 'all' ? 'Tất cả' : 'Cảnh cáo mới nhất'} (${deletedCount}) cảnh cáo của bạn đã được xóa.\nLý do: ${reason}`,
                    )
                    .setFooter({
                        text: `Bởi ${interaction.user.tag}`,
                    })
                    .setTimestamp();

                await targetUser.send({ embeds: [dmEmbed] });
            } catch (error) {
                logger.error('MODERATION', `Không thể gửi DM cho ${targetUser.tag}`);
            }
        } catch (error) {
            logger.error('MODERATION', 'Lỗi khi xóa cảnh cáo của thành viên:', error);
            await interaction.editReply({
                content: `❌ Đã xảy ra lỗi khi xóa cảnh cáo: ${error.message}`,
                ephemeral: true,
            });
        }
    },
};