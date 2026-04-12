const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const logger = require('../../utils/core/logger');
const emojis = require('../../config/emojis.js');
const {
    createHybridReply,
    deferHybridReply,
    getHybridSubcommand,
    isSlashCommandInteraction,
    resolveHybridPrefix,
} = require('../../utils/discord/hybridCommand');
const { updateGuildSettingsAndInvalidate } = require('../../utils/guild/guildSettings.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('welcome')
        .setDescription('Cài đặt thông báo chào mừng thành viên mới')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand(subcmd =>
            subcmd.setName('set')
                .setDescription('Thiết lập kênh và tin nhắn chào mừng')
                .addChannelOption(option =>
                    option.setName('channel')
                        .setDescription('Kênh gửi thông báo chào mừng')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('message')
                        .setDescription('Tin nhắn chào mừng (Dùng {user} để tag, {server} cho tên server, {count} cho số thành viên)')
                        .setRequired(true))
        )
        .addSubcommand(subcmd =>
            subcmd.setName('disable')
                .setDescription('Tắt thông báo chào mừng')
        ),
    prefix: { name: 'welcome', aliases: ['setwelcome'], description: 'Cài đặt thông báo chào mừng thành viên mới (chỉ Admin)' },
    cooldown: 5,
    async execute(interaction) {
        const isSlash = isSlashCommandInteraction(interaction);
        const guildId = interaction.guild?.id;

        if (!guildId) return;

        const subCommand = getHybridSubcommand(interaction);

        if (!subCommand) {
            const prefix = await resolveHybridPrefix(interaction);
            return (interaction.message || interaction).reply({ content: interaction.t('commands.welcome.usage', { prefix }) });
        }

        await deferHybridReply(interaction, { ephemeral: true });
        const replyFunc = createHybridReply(interaction, { useEditReplyForSlash: isSlash });

        try {
            if (subCommand === 'disable') {
                await updateGuildSettingsAndInvalidate(guildId, {
                    'greeter.welcome.isEnabled': false
                });
                return replyFunc({ content: `${emojis.success} ${interaction.t('commands.welcome.disable_success')}` });
            }

            if (subCommand === 'set') {
                let channel, message;

                if (isSlash) {
                    channel = interaction.options.getChannel('channel');
                    message = interaction.options.getString('message');
                } else {
                    channel = interaction.message.mentions.channels.first();
                    const args = interaction.args.slice();
                    if (args[0] === 'set') args.shift();

                    if (args.length > 0 && args[0].match(/<#\d+>/)) {
                        args.shift();
                    }

                    message = args.join(' ');
                }

                if (!channel || !message) {
                    const prefix = await resolveHybridPrefix(interaction);
                    return replyFunc({ content: interaction.t('commands.welcome.no_channel', { prefix }), ephemeral: true });
                }

                await updateGuildSettingsAndInvalidate(guildId, {
                    'greeter.welcome.isEnabled': true,
                    'greeter.welcome.channel': channel.id,
                    'greeter.welcome.message': message
                });

                return replyFunc({ content: `${emojis.success} ${interaction.t('commands.welcome.setup_success', { channelId: channel.id, message })}` });
            }
        } catch (error) {
            logger.error('system', 'Error setting welcome:', error);
            return replyFunc({ content: `${emojis.error} ${interaction.t('system.error_occurred')}`, ephemeral: true });
        }
    }
};
