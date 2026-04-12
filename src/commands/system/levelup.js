const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const logger = require('../../utils/logger');
const emojis = require('../../config/emojis.js');
const {
    createHybridReply,
    deferHybridReply,
    getHybridSubcommand,
    isSlashCommandInteraction,
    resolveHybridPrefix,
} = require('../../utils/hybridCommand');
const { updateGuildSettingsAndInvalidate } = require('../../utils/guildSettings.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('levelup')
        .setDescription('Cài đặt thông báo người dùng thăng cấp (Level Up)')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand(subcmd =>
            subcmd.setName('set')
                .setDescription('Bật thông báo và thiết lập kênh hiển thị')
                .addChannelOption(option =>
                    option.setName('channel')
                        .setDescription('Kênh gửi thông báo thăng cấp')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(true))
        )
        .addSubcommand(subcmd =>
            subcmd.setName('disable')
                .setDescription('Tắt thông báo thăng cấp')
        ),
    prefix: { name: 'levelup', aliases: ['setlevelup'], description: 'Cài đặt thông báo thăng cấp (chỉ Admin)' },
    cooldown: 5,
    async execute(interaction) {
        const isSlash = isSlashCommandInteraction(interaction);
        const guildId = interaction.guild?.id;

        if (!guildId) return;

        const subCommand = getHybridSubcommand(interaction);

        if (!subCommand || !['set', 'disable'].includes(subCommand)) {
            const prefix = await resolveHybridPrefix(interaction);
            return (interaction.message || interaction).reply({ content: interaction.t('commands.levelup.usage', { prefix }) });
        }

        await deferHybridReply(interaction, { ephemeral: true });
        const replyFunc = createHybridReply(interaction, { useEditReplyForSlash: isSlash });

        try {
            if (subCommand === 'disable') {
                await updateGuildSettingsAndInvalidate(guildId, {
                    'settings.levelUpNotifications': false,
                    'settings.levelUpChannel': null
                });
                return replyFunc({ content: `${emojis.success} ${interaction.t('commands.levelup.disable_success')}` });
            }

            if (subCommand === 'set') {
                let channel;

                if (isSlash) {
                    channel = interaction.options.getChannel('channel');
                } else {
                    channel = interaction.message.mentions.channels.first();
                    const args = interaction.args.slice();
                    if (args[0] === 'set') args.shift();

                    if (args.length > 0 && args[0].match(/<#\d+>/)) {
                        args.shift();
                    }
                }

                if (!channel) {
                    const prefix = await resolveHybridPrefix(interaction);
                    return replyFunc({ content: interaction.t('commands.levelup.no_channel', { prefix }), ephemeral: true });
                }

                await updateGuildSettingsAndInvalidate(guildId, {
                    'settings.levelUpNotifications': true,
                    'settings.levelUpChannel': channel.id
                });

                return replyFunc({ content: `${emojis.success} ${interaction.t('commands.levelup.setup_success', { channelId: channel.id })}` });
            }
        } catch (error) {
            logger.error('system', 'Error setting levelup:', error);
            return replyFunc({ content: `${emojis.error} ${interaction.t('system.error_occurred')}`, ephemeral: true });
        }
    }
};