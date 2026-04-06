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
            const prefix = await PrefixDB.resolvePrefix(interaction.user?.id || interaction.author?.id, interaction.guild?.id);
            const reply = interaction.reply ? interaction.reply.bind(interaction) : interaction.message.reply.bind(interaction.message);
            return reply({ content: `${emojis.error} ${interaction.t('commands.voicewelcome.usage', { prefix })}` });
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
            ? `${emojis.success} ${interaction.t('commands.voicewelcome.enabled')}`
            : `${emojis.success} ${interaction.t('commands.voicewelcome.disabled')}`;

        await interaction.editReply({ content: message });

        logger.info('SETUP', `Voice toggle ${newEnabled ? 'enabled' : 'disabled'} for guild ${interaction.guild.name} by ${interaction.user.tag}`);
    } catch (error) {
        logger.error('SETUP', 'Error handling voice toggle:', error);
        await interaction.editReply({
            content: `${emojis.error} ${interaction.t('system.error_occurred')}`,
        });
    }
}
