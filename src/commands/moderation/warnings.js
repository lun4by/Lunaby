const {SlashCommandBuilder, PermissionFlagsBits, MessageFlags} = require('discord.js');
const MariaModDB = require('../../services/database/MariaModDB.js');
const logger = require('../../utils/core/logger.js');
const emojis = require('../../config/emojis.js');
const { hasMemberPermission } = require('../../utils/discord/permissionUtils.js');

const { createEmbed } = require('../../utils/discord/builderFactory');
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
        if (!hasMemberPermission(interaction.member, PermissionFlagsBits.ModerateMembers)) {
            return interaction.reply({
                content: `${emojis.error} ${interaction.t('system.no_permission')}`,
                flags: MessageFlags.Ephemeral,
            });
        }

        const targetUser = interaction.options.getUser('user');

        if (!targetUser) {
            const PrefixDB = require('../../services/database/PrefixDB');
            const prefix = await PrefixDB.resolvePrefix(interaction.user?.id, interaction.guild?.id);
            return (interaction.message || interaction).reply({ content: interaction.t('commands.warnings.usage', { prefix }) });
        }

        await interaction.deferReply();

        try {
            const dateLocale = interaction.t('commands.moderation_common.datetime_locale');
            const warnings = await MariaModDB.getWarnings(
                interaction.guild.id,
                targetUser.id
            );

            if (warnings.length === 0) {
                return interaction.editReply({
                    content: `${emojis.success} ${interaction.t('commands.moderation_common.no_warnings')}`,
                });
            }

            const warningsEmbed = createEmbed()
                .setColor(0xffff00)
                .setTitle(interaction.t('commands.warnings.embed_title'))
                .setDescription(interaction.t('commands.warnings.embed_desc', { tag: targetUser.tag, count: warnings.length }))
                .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
                .setFooter({ text: interaction.t('commands.warnings.embed_footer', { id: targetUser.id }) })
                .setTimestamp();

            const recentWarnings = warnings.slice(0, 10);

            recentWarnings.forEach((warning, index) => {
                const moderator = interaction.guild.members.cache.get(warning.moderatorId);
                const moderatorName = moderator ? moderator.user.tag : interaction.t('commands.moderation_common.unknown_user');
                const date = new Date(warning.timestamp).toLocaleDateString(dateLocale);
                const time = new Date(warning.timestamp).toLocaleTimeString(dateLocale);

                warningsEmbed.addFields({
                    name: interaction.t('commands.warnings.field_name', { index: index + 1, date, time }),
                    value: interaction.t('commands.warnings.field_value', { reason: warning.reason, moderator: moderatorName }),
                });
            });

            if (warnings.length > 10) {
                warningsEmbed.addFields({
                    name: interaction.t('commands.warnings.note_title'),
                    value: interaction.t('commands.warnings.note_desc', { total: warnings.length }),
                });
            }

            await interaction.editReply({ embeds: [warningsEmbed] });
        } catch (error) {
            logger.error('moderation', 'Error viewing member warnings:', error);
            await interaction.editReply({
                content: `${emojis.error} ${interaction.t('commands.warnings.error_warnings', { error: error.message })}`,
                flags: MessageFlags.Ephemeral,
            });
        }
    },
};
