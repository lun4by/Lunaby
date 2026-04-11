const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const ConversationService = require('../../services/ai/ConversationService.js');
const { logModAction } = require('../../utils/modUtils.js');
const { sendModLog, createModActionEmbed } = require('../../utils/modLogUtils.js');
const { handlePermissionError, hasMemberPermission } = require('../../utils/permissionUtils.js');
const logger = require('../../utils/logger.js');
const emojis = require('../../config/emojis.js');
const prompts = require('../../config/prompts.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('kick')
        .setDescription('Đuổi một thành viên khỏi server')
        .addUserOption(option =>
            option.setName('user').setDescription('Thành viên cần đuổi').setRequired(true)
        )
        .addStringOption(option =>
            option.setName('reason').setDescription('Lý do đuổi').setRequired(false)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),
    prefix: { name: 'kick', aliases: [], description: 'Kick thành viên ra khỏi server' },
    cooldown: 5,

    async execute(interaction) {
        if (!hasMemberPermission(interaction.member, PermissionFlagsBits.KickMembers)) {
            return interaction.reply({
                content: `${emojis.error} ${interaction.t('system.no_permission')}`,
                ephemeral: true,
            });
        }

        const targetUser = interaction.options.getUser('user');
        const targetMember = interaction.options.getMember('user');

        if (!targetUser) {
            const PrefixDB = require('../../services/database/PrefixDB');
            const prefix = await PrefixDB.resolvePrefix(interaction.user?.id, interaction.guild?.id);
            return (interaction.message || interaction).reply({ content: interaction.t('commands.kick.usage', { prefix }) });
        }

        if (!targetMember) {
            return interaction.reply({
                content: `${emojis.error} ${interaction.t('commands.moderation_common.user_not_found')}`,
                ephemeral: true,
            });
        }

        const reason = interaction.options.getString('reason')?.trim() || interaction.t('commands.moderation_common.no_reason');

        if (!targetMember.kickable) {
            return interaction.reply({
                content: `${emojis.error} ${interaction.t('commands.moderation_common.cant_action_higher_role')}`,
                ephemeral: true,
            });
        }

        await interaction.deferReply();

        try {
            const prompt = prompts.moderation.kick
                .replace('${username}', targetUser.username)
                .replace('${reason}', reason);
            const aiResponsePromise = ConversationService.getOneTimeCompletion(prompt);

            await targetMember.kick(reason);

            await logModAction({
                guildId: interaction.guild.id,
                targetId: targetUser.id,
                moderatorId: interaction.user.id,
                action: 'kick',
                reason,
            });

            const aiResponse = await aiResponsePromise;
            await interaction.editReply({
                content: aiResponse || `${emojis.success} ${interaction.t('commands.kick.success_fallback', { tag: targetUser.tag })}`,
            });

            const logEmbed = createModActionEmbed({
                title: interaction.t('commands.kick.log_title'),
                description: interaction.t('commands.kick.log_desc', { tag: targetUser.tag }),
                color: 0xffa500,
                fields: [
                    { name: interaction.t('commands.moderation_common.log_field_user'), value: targetUser.tag, inline: true },
                    { name: interaction.t('commands.moderation_common.log_field_id'), value: targetUser.id, inline: true },
                    { name: interaction.t('commands.moderation_common.log_field_mod'), value: `${interaction.user.tag} (<@${interaction.user.id}>)`, inline: true },
                    { name: interaction.t('commands.moderation_common.log_field_reason'), value: reason, inline: false },
                    { name: interaction.t('commands.moderation_common.log_field_time'), value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false },
                ],
                footer: interaction.t('commands.moderation_common.log_footer', { guild: interaction.guild.name }),
            });

            await sendModLog(interaction.guild, logEmbed, true);
        } catch (error) {
            logger.error('moderation', `Error kicking ${targetUser.tag}: ${error.message}`);
            await interaction.editReply({
                content: `${emojis.error} ${interaction.t('commands.kick.error_kick', { error: error.message })}`,
                ephemeral: true
            });
        }
    },
};