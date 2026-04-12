const { SlashCommandBuilder, ChannelType } = require('discord.js');
const MariaModDB = require('../../services/database/MariaModDB.js');
const emojis = require('../../config/emojis');
const {
    createHybridReply,
    deferHybridReply,
    isSlashCommandInteraction,
    resolveHybridPrefix,
} = require('../../utils/hybridCommand');

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
    cooldown: 5,

    async execute(interaction) {
        const isSlash = isSlashCommandInteraction(interaction);
        const userId = interaction.user.id;

        const logChannel = isSlash
            ? interaction.options.getChannel('channel')
            : interaction.message?.mentions?.channels?.first();

        if (!logChannel) {
            const prefix = await resolveHybridPrefix(interaction);
            return interaction.reply({ content: `${emojis.error} ${interaction.t('commands.admin.systemlog.invalid_channel', { prefix })}`, ephemeral: true });
        }

        await deferHybridReply(interaction, { ephemeral: true });
        const replyFunc = createHybridReply(interaction, { useEditReplyForSlash: isSlash });

        const isSuccess = await MariaModDB.setBotSetting('global_log_channel', logChannel.id, userId);

        const responseMessage = isSuccess
            ? `${emojis.success} ${interaction.t('commands.admin.systemlog.success', { id: logChannel.id })}`
            : `${emojis.error} ${interaction.t('commands.admin.systemlog.error')}`;

        return replyFunc({ content: responseMessage });
    },
};
