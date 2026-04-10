const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const ConversationService = require('../../services/ai/ConversationService.js');
const { logModAction } = require('../../utils/modUtils.js');
const { sendModLog, createModActionEmbed } = require('../../utils/modLogUtils.js');
const { handlePermissionError } = require('../../utils/permissionUtils.js');
const logger = require('../../utils/logger.js');
const emojis = require('../../config/emojis.js');
const prompts = require('../../config/prompts.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ban')
        .setDescription('Cấm một người dùng khỏi server')
        .addUserOption((option) =>
            option.setName('user').setDescription('Người dùng cần cấm').setRequired(true),
        )
        .addStringOption((option) =>
            option.setName('reason').setDescription('Lý do cấm').setRequired(false),
        )
        .addIntegerOption((option) =>
            option
                .setName('days')
                .setDescription('Số ngày tin nhắn cần xóa (0-7)')
                .setMinValue(0)
                .setMaxValue(7)
                .setRequired(false),
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
    prefix: { name: 'ban', aliases: ['cấm'], description: 'Cấm người dùng' },
    cooldown: 5,

    async execute(interaction) {
        if (!interaction.member.permissions.has(PermissionFlagsBits.BanMembers)) {
            return interaction.reply({
                content: `${emojis.error} ${interaction.t('system.no_permission')}`,
                ephemeral: true,
            });
        }

        const targetUser = interaction.options.getUser('user');
        const targetMember = interaction.options.getMember('user');
        const reason =
            interaction.options.getString('reason') ||
            interaction.t('commands.moderation_common.no_reason');
        const deleteMessageDays = interaction.options.getInteger('days') || 1;

        if (!targetUser) {
            const PrefixDB = require('../../services/database/PrefixDB');
            const prefix = await PrefixDB.resolvePrefix(interaction.user?.id, interaction.guild?.id);
            return (interaction.message || interaction).reply({ content: interaction.t('commands.ban.usage', { prefix }) });
        }

        if (targetMember && !targetMember.bannable) {
            return interaction.reply({
                content: `${emojis.error} ${interaction.t('commands.moderation_common.cant_action_higher_role')}`,
                ephemeral: true,
            });
        }

        await interaction.deferReply();

        try {
            const prompt = prompts.moderation.ban
                .replace('${username}', targetUser.username)
                .replace('${reason}', reason);

            const aiResponse = await ConversationService.getOneTimeCompletion(prompt);

            // Cấm người dùng
            await interaction.guild.members.ban(targetUser, {
                deleteMessageDays: deleteMessageDays,
                reason: interaction.t('commands.moderation_common.audit_log_reason', { reason, user: interaction.user.tag }),
            });

            // Ghi log hành động
            await logModAction({
                guildId: interaction.guild.id,
                targetId: targetUser.id,
                moderatorId: interaction.user.id,
                action: 'ban',
                reason: reason,
            });

            await interaction.editReply({ content: aiResponse });

            const logEmbed = createModActionEmbed({
                title: interaction.t('commands.ban.log_title'),
                description: interaction.t('commands.ban.log_desc', { tag: targetUser.tag, days: deleteMessageDays }),
                color: 0xff0000,
                fields: [
                    { name: interaction.t('commands.moderation_common.log_field_user'), value: `${targetUser.tag}`, inline: true },
                    { name: interaction.t('commands.moderation_common.log_field_id'), value: targetUser.id, inline: true },
                    { name: interaction.t('commands.moderation_common.log_field_mod'), value: `${interaction.user.tag} (<@${interaction.user.id}>)`, inline: true },
                    { name: interaction.t('commands.moderation_common.log_field_reason'), value: reason, inline: false },
                    { name: interaction.t('commands.moderation_common.log_field_time'), value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false }
                ],
                footer: interaction.t('commands.moderation_common.log_footer', { guild: interaction.guild.name }),
            });

            await sendModLog(interaction.guild, logEmbed, true);

            try {
                const dmEmbed = new EmbedBuilder()
                    .setColor(0xff0000)
                    .setTitle(interaction.t('commands.ban.dm_title', { guild: interaction.guild.name }))
                    .setDescription(interaction.t('commands.moderation_common.dm_reason', { reason }))
                    .setFooter({
                        text: interaction.t('commands.ban.dm_footer'),
                    })
                    .setTimestamp();

                await targetUser.send({ embeds: [dmEmbed] });
            } catch (error) {
                logger.error('moderation',
                    `Unable to send DM to ${targetUser.tag}`,
                );
            }
        } catch (error) {
            logger.error('moderation',
                `Error while banning ${targetUser.tag}: ${error.message}`,
            );
            await interaction.editReply({
                content: `${emojis.error} ${interaction.t('commands.ban.error_ban', { error: error.message })}`,
                ephemeral: true,
            });
        }
    },
};