const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const ConversationService = require('../../services/ai/ConversationService.js');
const { logModAction, formatDuration } = require('../../utils/moderation/modUtils.js');
const { sendModLog, createModActionEmbed } = require('../../utils/moderation/modLogUtils.js');
const { handlePermissionError, hasMemberPermission } = require('../../utils/discord/permissionUtils');
const logger = require('../../utils/core/logger.js');
const emojis = require('../../config/emojis.js');
const prompts = require('../../config/prompts.js');

const { createEmbed } = require('../../utils/discord/builderFactory');
module.exports = {
    data: new SlashCommandBuilder()
        .setName('mute')
        .setDescription('Mute (timeout) một thành viên')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('Thành viên cần mute')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('duration')
                .setDescription('Thời gian mute (phút)')
                .setRequired(true)
                .setMinValue(1)
                .setMaxValue(40320))
        .addStringOption(option =>
            option.setName('reason')
                .setDescription('Lý do mute')
                .setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
    prefix: { name: 'mute', aliases: ['cấm'], description: 'Cấm người dùng' },
    cooldown: 5,

    async execute(interaction) {
        if (!hasMemberPermission(interaction.member, PermissionFlagsBits.ModerateMembers)) {
            return interaction.reply({
                content: `${emojis.error} ${interaction.t('system.no_permission')}`,
                ephemeral: true
            });
        }

        const targetUser = interaction.options.getUser('user');
        const targetMember = interaction.options.getMember('user');
        const duration = interaction.options.getInteger('duration'); // Thời gian tính bằng phút
        const reason = interaction.options.getString('reason') || interaction.t('commands.moderation_common.no_reason');

        if (!targetUser || !duration) {
            const PrefixDB = require('../../services/database/PrefixDB');
            const prefix = await PrefixDB.resolvePrefix(interaction.user?.id, interaction.guild?.id);
            return (interaction.message || interaction).reply({ content: interaction.t('commands.mute.usage', { prefix }) });
        }

        if (!targetMember) {
            return interaction.reply({
                content: `${emojis.error} ${interaction.t('commands.moderation_common.user_not_found')}`,
                ephemeral: true
            });
        }

        if (!targetMember.moderatable) {
            return interaction.reply({
                content: `${emojis.error} ${interaction.t('commands.moderation_common.cant_action_higher_role')}`,
                ephemeral: true
            });
        }

        await interaction.deferReply();

        try {
            const durationMs = duration * 60 * 1000;

            const endTime = new Date(Date.now() + durationMs);

            const formattedDuration = formatDuration(duration);

            const prompt = prompts.moderation.mute
                .replace('${username}', targetUser.username)
                .replace('${duration}', formattedDuration)
                .replace('${reason}', reason);
            const aiResponsePromise = ConversationService.getOneTimeCompletion(prompt);

            await targetMember.timeout(durationMs, reason);

            await logModAction({
                guildId: interaction.guild.id,
                targetId: targetUser.id,
                moderatorId: interaction.user.id,
                action: 'mute',
                reason: reason,
                duration: duration
            });

            const aiResponse = await aiResponsePromise;
            await interaction.editReply({
                content: aiResponse || `${emojis.success} ${interaction.t('commands.mute.success_fallback', { tag: targetUser.tag, duration: formattedDuration })}`,
            });

            const logEmbed = createModActionEmbed({
                title: interaction.t('commands.mute.log_title'),
                description: interaction.t('commands.mute.log_desc', { tag: targetUser.tag }),
                color: 0xffff00,
                fields: [
                    { name: interaction.t('commands.moderation_common.log_field_user'), value: `${targetUser.tag} (<@${targetUser.id}>)`, inline: true },
                    { name: interaction.t('commands.moderation_common.log_field_id'), value: targetUser.id, inline: true },
                    { name: interaction.t('commands.moderation_common.log_field_mod'), value: `${interaction.user.tag} (<@${interaction.user.id}>)`, inline: true },
                    { name: interaction.t('commands.moderation_common.log_field_duration'), value: formattedDuration, inline: true },
                    { name: interaction.t('commands.moderation_common.log_field_endtime'), value: `<t:${Math.floor(endTime.getTime() / 1000)}:F>`, inline: true },
                    { name: interaction.t('commands.moderation_common.log_field_reason'), value: reason, inline: false }
                ],
                footer: interaction.t('commands.moderation_common.log_footer', { guild: interaction.guild.name })
            });

            await sendModLog(interaction.guild, logEmbed, true);

            try {
                const dmEmbed = createEmbed()
                    .setColor(0xFFA500)
                    .setTitle(interaction.t('commands.mute.dm_title', { guild: interaction.guild.name }))
                    .setDescription(interaction.t('commands.mute.dm_desc', { reason, duration: formattedDuration, time: `<t:${Math.floor(endTime.getTime() / 1000)}:F>` }))
                    .setFooter({ text: interaction.t('commands.mute.dm_footer') })
                    .setTimestamp();

                await targetUser.send({ embeds: [dmEmbed] });
            } catch (error) {
                logger.error('moderation', `Failed to send DM to ${targetUser.tag}`);
            }

        } catch (error) {
            logger.error('moderation', 'Error muting member:', error);
            await interaction.editReply({
                content: `${emojis.error} ${interaction.t('commands.mute.error_mute', { error: error.message })}`,
                ephemeral: true
            });
        }
    },
};
