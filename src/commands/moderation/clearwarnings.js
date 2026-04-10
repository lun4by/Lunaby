const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const MariaModDB = require('../../services/database/MariaModDB');
const ErrorHandler = require('../../utils/ErrorHandler');
const ConversationService = require('../../services/ai/ConversationService.js');
const logger = require('../../utils/logger');
const emojis = require('../../config/emojis.js');
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
                content: `${emojis.error} ${interaction.t('system.no_permission')}`,
                ephemeral: true,
            });
        }

        const targetUser = interaction.options.getUser('user');
        const type = interaction.options.getString('type');
        const reason = interaction.options.getString('reason') || interaction.t('commands.moderation_common.no_reason');

        if (!targetUser || !type) {
            const PrefixDB = require('../../services/database/PrefixDB');
            const prefix = await PrefixDB.resolvePrefix(interaction.user?.id, interaction.guild?.id);
            return (interaction.message || interaction).reply({ content: interaction.t('commands.clearwarnings.usage', { prefix }) });
        }

        await interaction.deferReply();

        try {
            const warningCount = await MariaModDB.getWarningCount(
                interaction.guild.id,
                targetUser.id
            );

            if (warningCount === 0) {
                return interaction.editReply({
                    content: `${emojis.success} ${interaction.t('commands.moderation_common.no_warnings')}`,
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
                .replace('${type}', type === 'all' ? interaction.t('commands.clearwarnings.type_all') : interaction.t('commands.clearwarnings.type_latest'))
                .replace('${username}', targetUser.username)
                .replace('${reason}', reason)
                .replace('${deletedCount}', deletedCount);

            const aiResponse = await ConversationService.getOneTimeCompletion(prompt);

            await interaction.editReply({ content: aiResponse });

            try {
                const typeCap = type === 'all' ? interaction.t('commands.clearwarnings.type_all_cap') : interaction.t('commands.clearwarnings.type_latest_cap');
                const dmEmbed = new EmbedBuilder()
                    .setColor(0x00ff00)
                    .setTitle(interaction.t('commands.clearwarnings.dm_title', { guild: interaction.guild.name }))
                    .setDescription(interaction.t('commands.clearwarnings.dm_desc', { typeCap, count: deletedCount, reason }))
                    .setFooter({
                        text: interaction.t('commands.clearwarnings.dm_footer', { user: interaction.user.tag }),
                    })
                    .setTimestamp();

                await targetUser.send({ embeds: [dmEmbed] });
            } catch (error) {
                logger.error('MODERATION', `Failed to send DM to ${targetUser.tag}`);
            }
        } catch (error) {
            logger.error('MODERATION', 'Error clearing member warnings:', error);
            await interaction.editReply({
                content: `${emojis.error} ${interaction.t('commands.clearwarnings.error_clearwarnings', { error: error.message })}`,
                ephemeral: true,
            });
        }
    },
};