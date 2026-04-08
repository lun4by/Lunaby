const { SlashCommandBuilder, PermissionsBitField } = require('discord.js');
const MariaModDB = require('../../services/database/MariaModDB');
const emojis = require('../../config/emojis');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('language')
        .setDescription('Thay đổi ngôn ngữ của bot cho server / Change the bot language for this server')
        .addStringOption(option =>
            option.setName('lang')
                .setDescription('Chọn ngôn ngữ của server / Select the server language')
                .setRequired(true)
                .addChoices(
                    { name: 'Tiếng Việt', value: 'vi' },
                    { name: 'English', value: 'en' }
                )),
    prefix: { name: 'language', aliases: ['lang'], description: 'Cài đặt ngôn ngữ server / Server language settings' },
    cooldown: 5,

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const isSlash = !!interaction.isCommand;

        let lang = 'vi';

        if (isSlash) {
            lang = interaction.options.getString('lang');
        } else {
            const args = interaction.content.split(' ').slice(1);
            if (args.length < 1) {
                const PrefixDB = require('../../services/database/PrefixDB');
                const prefix = await PrefixDB.resolvePrefix(interaction.user?.id || interaction.author?.id, interaction.guild?.id);
            return interaction.editReply({
                    content: `${emojis.error} ${interaction.t('commands.language.usage', { prefix })}`
                });
            }
            lang = args[0].toLowerCase() === 'en' ? 'en' : 'vi';
        }

        if (!interaction.guildId || !interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
                return interaction.editReply({
                content: `${emojis.error} ${interaction.t('system.no_permission')}`
            });
        }

        await MariaModDB.updateGuildSettings(interaction.guildId, { language: lang });

            // Ép ngôn ngữ ngay lập tức cho câu trả lời này
        const manualT = require('../../services/i18n/i18nManager').t;
        const msg = manualT('system.language_changed', lang);

        return interaction.editReply({
            content: `${emojis.success} ${msg}`
        });
    }
};
