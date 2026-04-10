const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const MariaModDB = require('../../services/database/MariaModDB.js');
const logger = require('../../utils/logger');
const emojis = require('../../config/emojis.js');

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
        const isSlash = interaction.isCommand && interaction.isCommand();
        const guildId = interaction.guild?.id;

        if (!guildId) return;

        const subCommand = interaction.options.getSubcommand();

        if (!subCommand) {
            const PrefixDB = require('../../services/database/PrefixDB');
            const prefix = await PrefixDB.resolvePrefix(interaction.user?.id, interaction.guild?.id);
            return (interaction.message || interaction).reply({
                content: `Cách dùng:\n- Bật: \`${prefix}votelog set #channel\`\n- Tắt: \`${prefix}votelog disable\`\n- Xem trạng thái: \`${prefix}votelog status\``
            });
        }

        if (isSlash && !interaction.deferred && !interaction.replied) {
            await interaction.deferReply({ ephemeral: true });
        }

        const replyObj = isSlash ? interaction : (interaction.message || interaction);
        const replyFunc = isSlash ? (data) => interaction.editReply(data) : (data) => replyObj.reply(data);

        try {
            if (subCommand === 'disable') {
                await MariaModDB.updateGuildSettings(guildId, {
                    'channels.voteLog': null
                });
                return replyFunc({ content: `${emojis.success} Đã tắt thông báo vote Top.gg.` });
            }

            if (subCommand === 'status') {
                const settings = await MariaModDB.getGuildSettings(guildId);
                const channelId = settings.channels?.voteLog;

                if (channelId) {
                    return replyFunc({ content: `${emojis.info} Vote log đang được gửi tại <#${channelId}>` });
                } else {
                    return replyFunc({ content: `${emojis.info} Vote log chưa được thiết lập.` });
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
                    const PrefixDB = require('../../services/database/PrefixDB');
                    const prefix = await PrefixDB.resolvePrefix(interaction.user?.id, interaction.guild?.id);
                    return replyFunc({
                        content: `Vui lòng cung cấp kênh hợp lệ.\nVí dụ: \`${prefix}votelog set #vote-logs\``,
                        ephemeral: true
                    });
                }

                await MariaModDB.updateGuildSettings(guildId, {
                    'channels.voteLog': channel.id
                });

                return replyFunc({
                    content: `${emojis.success} Đã thiết lập kênh thông báo vote tại <#${channel.id}>.`
                });
            }
        } catch (error) {
            logger.error('SYSTEM', 'Error setting vote log:', error);
            return replyFunc({ content: `${emojis.error} Đã có lỗi xảy ra khi lưu thiết lập vote log.`, ephemeral: true });
        }
    }
};