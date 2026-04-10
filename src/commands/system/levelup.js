const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const MariaModDB = require('../../services/database/MariaModDB.js');
const logger = require('../../utils/logger');
const emojis = require('../../config/emojis.js');

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
        const isSlash = !!interaction.isCommand;
        const guildId = interaction.guild?.id;

        if (!guildId) return;

        let subCommand = null;
        if (isSlash) {
            subCommand = interaction.options.getSubcommand();
        } else if (interaction.args && interaction.args.length > 0) {
            subCommand = interaction.args[0].toLowerCase();
        }

        if (!subCommand || !['set', 'disable'].includes(subCommand)) {
            const PrefixDB = require('../../services/database/PrefixDB');
            const prefix = await PrefixDB.resolvePrefix(interaction.user?.id, interaction.guild?.id);
            return (interaction.message || interaction).reply({ content: `Cách dùng:\n- Bật hiện kênh: \`${prefix}levelup set #channel\`\n- Tắt thông báo: \`${prefix}levelup disable\`` });
        }

        if (isSlash && !interaction.deferred && !interaction.replied) {
            await interaction.deferReply({ ephemeral: true });
        }

        const replyObj = isSlash ? interaction : (interaction.message || interaction);
        const replyFunc = isSlash ? (data) => interaction.editReply(data) : (data) => replyObj.reply(data);

        try {
            if (subCommand === 'disable') {
                await MariaModDB.updateGuildSettings(guildId, {
                    'settings.levelUpNotifications': false,
                    'settings.levelUpChannel': null
                });
                return replyFunc({ content: `${emojis.success} Đã tắt chức năng thông báo chúc mừng thăng cấp.` });
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
                    const PrefixDB = require('../../services/database/PrefixDB');
                    const prefix = await PrefixDB.resolvePrefix(interaction.user?.id, interaction.guild?.id);
                    return replyFunc({ content: `Vui lòng tag kênh hợp lệ.\nVí dụ: \`${prefix}levelup set #bot-chat\``, ephemeral: true });
                }

                await MariaModDB.updateGuildSettings(guildId, {
                    'settings.levelUpNotifications': true,
                    'settings.levelUpChannel': channel.id
                });

                return replyFunc({ content: `${emojis.success} Đã thiết lập thông báo chúc mừng thăng cấp tại kênh <#${channel.id}>.` });
            }
        } catch (error) {
            logger.error('SYSTEM', 'Error setting levelup:', error);
            return replyFunc({ content: `${emojis.error} Đã có lỗi xảy ra khi lưu thiết lập.`, ephemeral: true });
        }
    }
};