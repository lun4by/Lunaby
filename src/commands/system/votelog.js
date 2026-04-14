const {SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags} = require('discord.js');
const logger = require('../../utils/core/logger');
const emojis = require('../../config/emojis.js');
const {
    createHybridReply,
    deferHybridReply,
    getHybridSubcommand,
    isSlashCommandInteraction,
    resolveHybridPrefix,
} = require('../../utils/discord/hybridCommand');
const { getCachedGuildSettings } = require('../../utils/guild/guildLocale.js');
const { updateGuildSettingsAndInvalidate } = require('../../utils/guild/guildSettings.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('votelog')
        .setDescription('Cài đặt kênh thông báo khi có người vote bot trên Top.gg')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand(subcmd =>
            subcmd.setName('set')
                .setDescription('Thiết lập kênh nhận thông báo vote')
                .addChannelOption(option =>
                    option.setName('channel')
                        .setDescription('Kênh gửi thông báo vote')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(true))
        )
        .addSubcommand(subcmd =>
            subcmd.setName('disable')
                .setDescription('Tắt thông báo vote')
        )
        .addSubcommand(subcmd =>
            subcmd.setName('status')
                .setDescription('Xem trạng thái cài đặt vote log hiện tại')
        ),
    prefix: { name: 'votelog', aliases: ['setvotelog', 'topgglog'], description: 'Cài đặt kênh thông báo vote Top.gg (chỉ Admin)' },
    cooldown: 5,
    async execute(interaction) {
        const isSlash = isSlashCommandInteraction(interaction);
        const guildId = interaction.guild?.id;

        if (!guildId) return;

        const subCommand = getHybridSubcommand(interaction);

        if (!subCommand) {
            const prefix = await resolveHybridPrefix(interaction);
            return (interaction.message || interaction).reply({
                content: interaction.t('commands.votelog.usage', { prefix })
            });
        }

        await deferHybridReply(interaction, { flags: MessageFlags.Ephemeral });
        const replyFunc = createHybridReply(interaction, { useEditReplyForSlash: isSlash });

        try {
            if (subCommand === 'disable') {
                await updateGuildSettingsAndInvalidate(guildId, {
                    'channels.voteLog': null
                });
                return replyFunc({ content: `${emojis.success} ${interaction.t('commands.votelog.disable_success')}` });
            }

            if (subCommand === 'status') {
                const settings = await getCachedGuildSettings(guildId);
                const channelId = settings.channels?.voteLog;

                if (channelId) {
                    return replyFunc({ content: `${emojis.info} ${interaction.t('commands.votelog.status_setup', { channelId })}` });
                } else {
                    return replyFunc({ content: `${emojis.info} ${interaction.t('commands.votelog.status_not_setup')}` });
                }
            }

            if (subCommand === 'set') {
                let channel;

                if (isSlash) {
                    channel = interaction.options.getChannel('channel');
                } else {
                    channel = interaction.message.mentions.channels.first();
                }

                if (!channel) {
                    const prefix = await resolveHybridPrefix(interaction);
                    return replyFunc({
                        content: interaction.t('commands.votelog.no_channel', { prefix }),
                        flags: MessageFlags.Ephemeral
                    });
                }

                await updateGuildSettingsAndInvalidate(guildId, {
                    'channels.voteLog': channel.id
                });

                return replyFunc({
                    content: `${emojis.success} ${interaction.t('commands.votelog.setup_success', { channelId: channel.id })}`
                });
            }
        } catch (error) {
            logger.error('system', 'Error setting vote log:', error);
            return replyFunc({ content: `${emojis.error} ${interaction.t('system.error_occurred')}`, flags: MessageFlags.Ephemeral });
        }
    }
};
