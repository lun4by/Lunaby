const { SlashCommandBuilder, ChannelType } = require('discord.js');
const RoleService = require('../../services/RoleService.js');
const MariaModDB = require('../../services/database/MariaModDB.js');

const checkPermissions = async (userId) => {
    const role = await RoleService.getUserRole(userId);
    return role === 'owner' || role === 'admin';
};

const getTargetChannel = (interaction) => {
    return interaction.options?.getChannel('channel') || interaction.mentions?.channels?.first();
};

const sendResponse = (interaction, content) => {
    if (interaction.reply && !interaction.replied) {
        return interaction.reply({ content, ephemeral: true });
    }
    if (interaction.editReply) {
        return interaction.editReply({ content });
    }
    return interaction.channel.send({ content });
};

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
        const userId = interaction.user?.id || interaction.author?.id;
        const hasPermission = await checkPermissions(userId);

        if (!hasPermission) {
            return sendResponse(interaction, 'Bạn không có quyền sử dụng lệnh này (Yêu cầu Owner hoặc Admin).');
        }

        const logChannel = getTargetChannel(interaction);

        if (!logChannel) {
            return sendResponse(interaction, 'Vui lòng cung cấp một kênh hợp lệ.');
        }

        if (interaction.deferReply) {
            await interaction.deferReply({ ephemeral: true });
        }

        const isSuccess = await MariaModDB.setBotSetting('global_log_channel', logChannel.id, userId);

        const responseMessage = isSuccess
            ? `Đã thiết lập kênh log global thành công tại <#${logChannel.id}>.`
            : 'Đã xảy ra lỗi khi lưu thiết lập kênh log vào database.';

        return sendResponse(interaction, responseMessage);
    },
};