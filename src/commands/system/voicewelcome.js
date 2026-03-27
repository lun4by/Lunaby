const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const MariaModDB = require('../../services/database/MariaModDB.js');
const logger = require('../../utils/logger.js');
const emojis = require('../../config/emojis.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('voicewelcome')
        .setDescription('Cấu hình tính năng chào/tạm biệt khi vào/rời kênh voice')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand(sub =>
            sub
                .setName('toggle')
                .setDescription('Bật/tắt chào và tạm biệt khi vào/rời kênh voice')
        ),
    prefix: { name: 'voicewelcome', aliases: ['vwc'], description: 'Cấu hình tính năng voice welcome' },
    cooldown: 5,

    async execute(interaction) {
        const subCommand = interaction.options.getSubcommand();

        if (subCommand === 'toggle') {
            return handleVoiceToggle(interaction);
        } else {
            const PrefixDB = require('../../services/database/PrefixDB');
            const prefix = await PrefixDB.resolvePrefix(interaction.user?.id, interaction.guild?.id);
            const reply = interaction.reply ? interaction.reply.bind(interaction) : interaction.message.reply.bind(interaction.message);
            return reply({ content: `Vui lòng dùng: \`/voicewelcome toggle\` hoặc \`${prefix}voicewelcome toggle\`` });
        }
    },
};

async function handleVoiceToggle(interaction) {
    await interaction.deferReply({ ephemeral: true });

    try {
        const guildId = interaction.guild.id;
        const settings = await MariaModDB.getGuildSettings(guildId);
        const currentEnabled = settings?.voiceToggle?.isEnabled || false;
        const newEnabled = !currentEnabled;

        await MariaModDB.updateGuildSettings(guildId, {
            'voiceToggle.isEnabled': newEnabled,
        });

        const message = newEnabled
            ? `${emojis.success} **Voice Toggle đã bật!**\nLunaby sẽ chào/tạm biệt thành viên khi vào/rời kênh voice.`
            : `${emojis.success} **Voice Toggle đã tắt!**\nLunaby sẽ không còn chào/tạm biệt khi vào/rời kênh voice nữa.`;

        await interaction.editReply({ content: message });

        logger.info('SETUP', `Voice toggle ${newEnabled ? 'enabled' : 'disabled'} for guild ${interaction.guild.name} by ${interaction.user.tag}`);
    } catch (error) {
        logger.error('SETUP', 'Error handling voice toggle:', error);
        await interaction.editReply({
            content: 'Đã xảy ra lỗi khi cập nhật cài đặt. Vui lòng thử lại!',
        });
    }
}