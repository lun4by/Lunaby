const { SlashCommandBuilder, EmbedBuilder, PermissionsBitField, ChannelType } = require('discord.js');
const MariaModDB = require('../../services/database/MariaModDB');
const logger = require('../../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('toggle')
        .setDescription('Bật/tắt lệnh bot cho kênh')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild)
        .addSubcommand(sub => sub.setName('disable').setDescription('Tắt một lệnh trong kênh')
            .addStringOption(opt => opt.setName('command').setDescription('Tên lệnh cần tắt').setRequired(true))
            .addChannelOption(opt => opt.setName('channel').setDescription('Kênh (mặc định: kênh hiện tại)').addChannelTypes(ChannelType.GuildText)))
        .addSubcommand(sub => sub.setName('enable').setDescription('Bật lại một lệnh trong kênh')
            .addStringOption(opt => opt.setName('command').setDescription('Tên lệnh cần bật').setRequired(true))
            .addChannelOption(opt => opt.setName('channel').setDescription('Kênh (mặc định: kênh hiện tại)').addChannelTypes(ChannelType.GuildText)))
        .addSubcommand(sub => sub.setName('disable-all').setDescription('Tắt tất cả lệnh trong kênh')
            .addChannelOption(opt => opt.setName('channel').setDescription('Kênh (mặc định: kênh hiện tại)').addChannelTypes(ChannelType.GuildText)))
        .addSubcommand(sub => sub.setName('enable-all').setDescription('Bật tất cả lệnh trong kênh')
            .addChannelOption(opt => opt.setName('channel').setDescription('Kênh (mặc định: kênh hiện tại)').addChannelTypes(ChannelType.GuildText)))
        .addSubcommand(sub => sub.setName('list').setDescription('Xem danh sách lệnh bị tắt trong kênh')
            .addChannelOption(opt => opt.setName('channel').setDescription('Kênh (mặc định: kênh hiện tại)').addChannelTypes(ChannelType.GuildText))),

    async execute(interaction) {
        const sub = interaction.options.getSubcommand();
        const channel = interaction.options.getChannel('channel') || interaction.channel;
        const guildId = interaction.guildId;
        const channelId = channel.id;
        const userId = interaction.user.id;

        try {
            if (sub === 'disable') {
                const cmdName = interaction.options.getString('command').toLowerCase();
                if (!interaction.client.commands.has(cmdName)) {
                    return interaction.reply({ content: `Không tìm thấy lệnh \`${cmdName}\`.`, ephemeral: true });
                }
                if (cmdName === 'toggle') {
                    return interaction.reply({ content: 'Không thể tắt lệnh `toggle`.', ephemeral: true });
                }

                await MariaModDB.disableCommand(guildId, channelId, cmdName, userId);
                return interaction.reply({
                    content: `Đã **tắt** lệnh \`/${cmdName}\` trong <#${channelId}>.`,
                    ephemeral: true,
                });
            }

            if (sub === 'enable') {
                const cmdName = interaction.options.getString('command').toLowerCase();
                await MariaModDB.enableCommand(guildId, channelId, cmdName);
                return interaction.reply({
                    content: `Đã **bật** lại lệnh \`/${cmdName}\` trong <#${channelId}>.`,
                    ephemeral: true,
                });
            }

            if (sub === 'disable-all') {
                const allCommands = [...interaction.client.commands.keys()].filter(c => c !== 'toggle');
                await MariaModDB.disableAllCommands(guildId, channelId, allCommands, userId);
                return interaction.reply({
                    content: `Đã **tắt** tất cả lệnh (${allCommands.length}) trong <#${channelId}>.`,
                    ephemeral: true,
                });
            }

            if (sub === 'enable-all') {
                await MariaModDB.enableAllCommands(guildId, channelId);
                return interaction.reply({
                    content: `Đã **bật** tất cả lệnh trong <#${channelId}>.`,
                    ephemeral: true,
                });
            }

            if (sub === 'list') {
                const disabled = await MariaModDB.getDisabledCommands(guildId, channelId);

                const embed = new EmbedBuilder()
                    .setColor(disabled.length ? 0xE74C3C : 0x2ECC71)
                    .setTitle(`Lệnh trong #${channel.name}`)
                    .setTimestamp();

                if (disabled.length === 0) {
                    embed.setDescription('Tất cả lệnh đều đang **bật** trong kênh này.');
                } else {
                    const disabledSet = new Set(disabled);
                    const allCommands = [...interaction.client.commands.keys()].sort();

                    const enabled = allCommands.filter(c => !disabledSet.has(c));
                    const disabledList = allCommands.filter(c => disabledSet.has(c));

                    if (enabled.length) embed.addFields({ name: `✅ Đang bật (${enabled.length})`, value: enabled.map(c => `\`${c}\``).join(' '), inline: false });
                    if (disabledList.length) embed.addFields({ name: `❌ Đã tắt (${disabledList.length})`, value: disabledList.map(c => `\`${c}\``).join(' '), inline: false });
                }

                return interaction.reply({ embeds: [embed], ephemeral: true });
            }
        } catch (error) {
            logger.error('COMMAND', 'Error in toggle command:', error);
            return interaction.reply({ content: 'Đã xảy ra lỗi. Vui lòng thử lại.', ephemeral: true });
        }
    },
};