const { SlashCommandBuilder, ChannelType } = require('discord.js');
const MariaModDB = require('../../services/database/MariaModDB.js');

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
    async execute(interaction) {
        const isSlash = interaction.isCommand && interaction.isCommand();
        const guildId = interaction.guild?.id;

        if (!guildId) return;

        const subCommand = interaction.options.getSubcommand();

        if (!subCommand) {
            return (interaction.message || interaction).reply({ content: 'Cách dùng:\n- Bật: `e.welcome set #channel [tin nhắn]`\n- Tắt: `e.welcome disable`' });
        }

        if (isSlash && !interaction.deferred && !interaction.replied) {
            await interaction.deferReply({ ephemeral: true });
        }

        const replyObj = isSlash ? interaction : (interaction.message || interaction);
        const replyFunc = isSlash ? (data) => interaction.editReply(data) : (data) => replyObj.reply(data);

        try {
            if (subCommand === 'disable') {
                await MariaModDB.updateGuildSettings(guildId, {
                    'greeter.welcome.isEnabled': false
                });
                return replyFunc({ content: '✅|Đã tắt tính năng thông báo chào mừng thành viên mới.' });
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
                    return replyFunc({ content: 'Vui lòng cung cấp kênh và lời chào mừng hợp lệ.\nVí dụ: `e.welcome set #welcome Chào mừng {user} đến với {server}!`', ephemeral: true });
                }

                await MariaModDB.updateGuildSettings(guildId, {
                    'greeter.welcome.isEnabled': true,
                    'greeter.welcome.channel': channel.id,
                    'greeter.welcome.message': message
                });

                return replyFunc({ content: `✅|Đã thiết lập thành công thông báo chào mừng tại kênh <#${channel.id}>.\nNội dung: \`${message}\`` });
            }
        } catch (error) {
            console.error('Error setting welcome:', error);
            return replyFunc({ content: '❌|Đã có lỗi xảy ra khi lưu thiết lập chào mừng.', ephemeral: true });
        }
    }
};