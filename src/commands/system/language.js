const { SlashCommandBuilder, PermissionsBitField } = require('discord.js');
const MariaModDB = require('../../services/database/MariaModDB');
const emojis = require('../../config/emojis');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('language')
        .setDescription('Thay đổi ngôn ngữ hiển thị của bot / Change the bot language')
        .addStringOption(option =>
            option.setName('target')
                .setDescription('Thay đổi cho máy chủ (Server) hay cá nhân (Personal)?')
                .setRequired(true)
                .addChoices(
                    { name: 'Cá Nhân (Personal)', value: 'personal' },
                    { name: 'Máy Chủ (Server)', value: 'server' }
                ))
        .addStringOption(option =>
            option.setName('lang')
                .setDescription('Chọn ngôn ngữ / Select language')
                .setRequired(true)
                .addChoices(
                    { name: 'Tiếng Việt', value: 'vi' },
                    { name: 'English', value: 'en' }
                )),
    prefix: { name: 'language', aliases: ['lang'], description: 'Cài đặt ngôn ngữ / Language settings' },
    cooldown: 5,

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const isSlash = !!interaction.isCommand;

        let target = 'personal';
        let lang = 'vi';

        if (isSlash) {
            target = interaction.options.getString('target');
            lang = interaction.options.getString('lang');
        } else {
            const args = interaction.content.split(' ').slice(1);
            if (args.length < 2) {
                const PrefixDB = require('../../services/database/PrefixDB');
                const prefix = await PrefixDB.resolvePrefix(interaction.user?.id || interaction.author?.id, interaction.guild?.id);
                return interaction.editReply({
                    content: `${emojis.error} ${interaction.t('commands.language.usage', { prefix })}`
                });
            }
            target = args[0].toLowerCase() === 'server' ? 'server' : 'personal';
            lang = args[1].toLowerCase() === 'en' ? 'en' : 'vi';
        }

        if (target === 'server') {
            if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
                return interaction.editReply({
                    content: `${emojis.error} ${interaction.t('system.no_permission')}`
                });
            }

            await MariaModDB.updateGuildSettings(interaction.guildId, { 'language': lang });

            // Ép ngôn ngữ ngay lập tức cho câu trả lời này
            const manualT = require('../../services/i18n/i18nManager').t;
            const msg = manualT('system.language_changed', lang);

            return interaction.editReply({
                content: `${emojis.success} ${msg}`
            });
        } else {
            await MariaModDB.updateUserProfile(interaction.user.id, ['language'], [lang]);

            const manualT = require('../../services/i18n/i18nManager').t;
            const msg = manualT('system.language_changed_user', lang);

            return interaction.editReply({
                content: `${emojis.success} ${msg}`
            });
        }
    }
};