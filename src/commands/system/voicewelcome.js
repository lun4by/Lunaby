const {SlashCommandBuilder, PermissionFlagsBits, MessageFlags} = require('discord.js');
const logger = require('../../utils/core/logger.js');
const emojis = require('../../config/emojis.js');
const { resolveHybridPrefix } = require('../../utils/discord/hybridCommand');
const { updateGuildSettingsAndInvalidate } = require('../../utils/guild/guildSettings.js');
const { getGuildVoiceSettings } = require('../../utils/guild/guildLocale.js');

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
            const prefix = await resolveHybridPrefix(interaction);
            const reply = interaction.reply ? interaction.reply.bind(interaction) : interaction.message.reply.bind(interaction.message);
            return reply({ content: `${emojis.error} ${interaction.t('commands.voicewelcome.usage', { prefix })}` });
        }
    },
};

async function handleVoiceToggle(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
        const guildId = interaction.guild.id;
        const voiceSettings = await getGuildVoiceSettings(guildId);
        const currentEnabled = voiceSettings.enabled;
        const newEnabled = !currentEnabled;

        await updateGuildSettingsAndInvalidate(guildId, {
            'voiceToggle.isEnabled': newEnabled,
        });

        const message = newEnabled
            ? `${emojis.success} ${interaction.t('commands.voicewelcome.enabled')}`
            : `${emojis.success} ${interaction.t('commands.voicewelcome.disabled')}`;

        await interaction.editReply({ content: message });

        logger.info('setup', `Voice toggle ${newEnabled ? 'enabled' : 'disabled'} for guild ${interaction.guild.name} by ${interaction.user.tag}`);
    } catch (error) {
        logger.error('setup', 'Error handling voice toggle:', error);
        await interaction.editReply({
            content: `${emojis.error} ${interaction.t('system.error_occurred')}`,
        });
    }
}
