const { SlashCommandBuilder, PermissionsBitField, ChannelType } = require('discord.js');
const MariaModDB = require('../../services/database/MariaModDB');
const enabledUtil = require('../../utils/enabledUtil');
const logger = require('../../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('enable')
        .setDescription('Bật một lệnh hoặc nhiều lệnh trong kênh')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageChannels)
        .addStringOption(opt => opt.setName('commands').setDescription('Tên lệnh cần bật (cách nhau bằng dấu phẩy) hoặc "all"').setRequired(true))
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

            if (!commandsStr) {
                const embed = await enabledUtil.createEmbed(interaction, channel, guildId, channelId);
                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

            commandsStr = commandsStr.toLowerCase();
            const commands = commandsStr.split(',').map(c => c.trim()).filter(c => c);

            if (commands.includes('all')) {
                await MariaModDB.enableAllCommands(guildId, channelId);
                return interaction.reply({
                    content: `⚙️ | Tất cả lệnh đã được **bật** trong <#${channelId}>!`,
                    ephemeral: true
                });
            }

            let validCommands = [];

            for (const cmd of commands) {
                if (interaction.client.commands.has(cmd)) {
                    if (cmd !== 'disable' && cmd !== 'enable') {
                        await MariaModDB.enableCommand(guildId, channelId, cmd);
                        validCommands.push(cmd);
                    }
                }
            }

            if (validCommands.length === 0) {
                return interaction.reply({ content: 'Không tìm thấy lệnh hợp lệ nào để bật.', ephemeral: true });
            }

            const embed = await enabledUtil.createEmbed(interaction, channel, guildId, channelId);
            return interaction.reply({ embeds: [embed], ephemeral: true });

        } catch (error) {
            logger.error('COMMAND', 'Error in enable command:', error);
            return interaction.reply({ content: 'Đã xảy ra lỗi. Vui lòng thử lại.', ephemeral: true });
        }
    },
};