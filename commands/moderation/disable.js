const { SlashCommandBuilder, PermissionsBitField, ChannelType } = require('discord.js');
const MariaModDB = require('../../services/database/MariaModDB');
const enabledUtil = require('../../utils/enabledUtil');
const logger = require('../../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('disable')
        .setDescription('Tắt một lệnh hoặc nhiều lệnh trong kênh')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageChannels)
        .addStringOption(opt => opt.setName('commands').setDescription('Tên lệnh cần tắt (cách nhau bằng dấu phẩy) hoặc "all"').setRequired(true))
        .addChannelOption(opt => opt.setName('channel').setDescription('Kênh (mặc định: kênh hiện tại)').addChannelTypes(ChannelType.GuildText)),

    async execute(interaction) {
        try {
            let channel;
            let commandsStr = '';

            if (typeof interaction.options.getChannel === 'function') {
                channel = interaction.options.getChannel('channel') || interaction.channel;
                commandsStr = interaction.options.getString('commands') || '';
            } else {
                channel = interaction.channel;
                commandsStr = interaction.args ? interaction.args.join(',') : '';
            }

            const guildId = interaction.guildId;
            const channelId = channel.id;
            const userId = interaction.user.id;

            if (!commandsStr) {
                const embed = await enabledUtil.createEmbed(interaction, channel, guildId, channelId);
                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

            commandsStr = commandsStr.toLowerCase();
            const commands = commandsStr.split(',').map(c => c.trim()).filter(c => c);

            let validCommands = [];

            if (commands.includes('all')) {
                const allCommands = [...interaction.client.commands.keys()].filter(c => c !== 'disable' && c !== 'enable');
                await MariaModDB.disableAllCommands(guildId, channelId, allCommands, userId);
                return interaction.reply({
                    content: `⚙️ | Tất cả lệnh đã bị **tắt** trong <#${channelId}>!`,
                    ephemeral: true
                });
            }

            for (const cmd of commands) {
                if (interaction.client.commands.has(cmd)) {
                    if (cmd !== 'disable' && cmd !== 'enable') {
                        validCommands.push(cmd);
                    }
                }
            }

            if (validCommands.length === 0) {
                return interaction.reply({ content: 'Không tìm thấy lệnh hợp lệ nào để tắt.', ephemeral: true });
            }

            await MariaModDB.disableAllCommands(guildId, channelId, validCommands, userId);

            const embed = await enabledUtil.createEmbed(interaction, channel, guildId, channelId);
            return interaction.reply({ embeds: [embed], ephemeral: true });

        } catch (error) {
            logger.error('COMMAND', 'Error in disable command:', error);
            return interaction.reply({ content: 'Đã xảy ra lỗi. Vui lòng thử lại.', ephemeral: true });
        }
    },
};