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
                content: `${emojis.error} ${interaction.t('system.no_permission')}`,
                ephemeral: true,
            });
        }

        const userId = interaction.options.getString('userid');
        const reason = interaction.options.getString('reason') || interaction.t('commands.moderation_common.no_reason');

        if (!userId) {
            const PrefixDB = require('../../services/database/PrefixDB');
            const prefix = await PrefixDB.resolvePrefix(interaction.user?.id, interaction.guild?.id);
            return (interaction.message || interaction).reply({ content: interaction.t('commands.unban.usage', { prefix }) });
        }

        if (!/^\d{17,19}$/.test(userId)) {
            return interaction.reply({
                content: `${emojis.error} ${interaction.t('commands.unban.invalid_id')}`,
                ephemeral: true,
            });
        }

        await interaction.deferReply();

        try {
            const banList = await interaction.guild.bans.fetch();
            const bannedUser = banList.find((ban) => ban.user.id === userId);

            if (!bannedUser) {
                return interaction.editReply({
                    content: `${emojis.error} ${interaction.t('commands.unban.not_banned')}`,
                    ephemeral: true,
                });
            }

            const user = bannedUser.user;

            const prompt = prompts.moderation.unban
                .replace('${username}', user.username)
                .replace('${reason}', reason);
            const aiResponsePromise = ConversationService.getOneTimeCompletion(prompt);

            await interaction.guild.members.unban(user, reason);

            await logModAction({
                guildId: interaction.guild.id,
                targetId: user.id,
                moderatorId: interaction.user.id,
                action: 'unban',
                reason: reason,
            });

            const aiResponse = await aiResponsePromise;
            await interaction.editReply({
                content: aiResponse || `${emojis.success} ${interaction.t('commands.unban.success_fallback', { tag: user.tag })}`,
            });

            const logEmbed = createModActionEmbed({
                title: interaction.t('commands.unban.log_title'),
                description: interaction.t('commands.unban.log_desc', { tag: user.tag }),
                color: 0x00ff00,
                fields: [
                    { name: interaction.t('commands.moderation_common.log_field_user'), value: `${user.tag}`, inline: true },
                    { name: interaction.t('commands.moderation_common.log_field_id'), value: user.id, inline: true },
                    { name: interaction.t('commands.moderation_common.log_field_mod'), value: `${interaction.user.tag} (<@${interaction.user.id}>)`, inline: true },
                    { name: interaction.t('commands.moderation_common.log_field_reason'), value: reason, inline: false },
                    { name: interaction.t('commands.moderation_common.log_field_time'), value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false },
                ],
                footer: interaction.t('commands.moderation_common.log_footer', { guild: interaction.guild.name }),
            });

            await sendModLog(interaction.guild, logEmbed, true);
        } catch (error) {
            logger.error('moderation', 'Error unbanning user:', error);
            await interaction.editReply({
                content: `${emojis.error} ${interaction.t('commands.unban.error_unban', { error: error.message })}`,
                ephemeral: true,
            });
        }
    },
};