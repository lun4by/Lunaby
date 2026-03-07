const { SlashCommandBuilder, ChannelType } = require('discord.js');
const MariaModDB = require('../../services/database/MariaModDB.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('systemlog')
        .setDescription('Thiết lập kênh gửi log sự kiện global của bot (chỉ Owner/Admin)')
        .addChannelOption((option) =>
            option
                .setName('channel')
                .setDescription('Kênh để nhận log của bot')
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(true)
        ),
    prefix: {
        name: 'systemlog', aliases: [], description: 'Thiết lập kênh gửi log join/left của bot (chỉ Owner/Admin)', adminOnly: true
    },

    async execute(interaction) {
        const isSlash = interaction.isCommand && interaction.isCommand();
        const userId = interaction.user.id;

        const logChannel = isSlash
            ? interaction.options.getChannel('channel')
            : interaction.message?.mentions?.channels?.first();

        if (!logChannel) {
            return interaction.reply({ content: 'Vui lòng cung cấp hoặc mention một kênh hợp lệ (VD: `e.systemlog #log-channel`).', ephemeral: true });
        }

        if (isSlash && !interaction.deferred && !interaction.replied) {
            await interaction.deferReply({ ephemeral: true });
        }

        const replyFunc = isSlash ? (data) => interaction.editReply(data) : (data) => interaction.reply(data);

        const isSuccess = await MariaModDB.setBotSetting('global_log_channel', logChannel.id, userId);

        const responseMessage = isSuccess
            ? `Đã thiết lập kênh log global thành công tại <#${logChannel.id}>.`
            : 'Đã xảy ra lỗi khi lưu thiết lập kênh log vào database.';

        return replyFunc({ content: responseMessage });
    },
};