const {
    SlashCommandBuilder,
    PermissionsBitField,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    ComponentType,
} = require('discord.js');
const MariaModDB = require('../../services/database/MariaModDB');
const emojis = require('../../config/emojis');
const { createLunabyEmbed } = require('../../utils/embedUtils');

const LANGUAGE_META = {
    vi: {
        flag: '🇻🇳',
        label: 'Tiếng Việt',
        code: 'vi-VN',
        description: 'Hiển thị bot bằng tiếng Việt',
    },
    en: {
        flag: '🇺🇸',
        label: 'English',
        code: 'en-US',
        description: 'Show the bot in English',
    },
};

function getLanguageDisplay(lang, withCode = false) {
    const meta = LANGUAGE_META[lang] || LANGUAGE_META.vi;
    return withCode ? `${meta.flag} ${meta.label} - ${meta.code}` : `${meta.flag} ${meta.label}`;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('language')
        .setDescription('Thay đổi ngôn ngữ của bot cho server / Change the bot language for this server')
        .addStringOption(option =>
            option.setName('lang')
                .setDescription('Chọn ngôn ngữ của server / Select the server language')
                .setRequired(false)
                .addChoices(
                    { name: getLanguageDisplay('vi', true), value: 'vi' },
                    { name: getLanguageDisplay('en', true), value: 'en' }
                )),
    prefix: { name: 'language', aliases: ['lang'], description: 'Cài đặt ngôn ngữ server / Server language settings' },
    cooldown: 5,

    async execute(interaction) {
        if (!interaction.guildId || !interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
            return interaction.reply({
                content: `${emojis.error} ${interaction.t('system.no_permission')}`,
                ephemeral: true,
            });
        }

        const guildSettings = await MariaModDB.getGuildSettings(interaction.guildId);
        let currentLang = guildSettings?.language || 'vi';

        await interaction.reply({
            embeds: [buildLanguageEmbed(currentLang)],
            components: [buildLanguageRow(currentLang)],
        });

        const message = await interaction.fetchReply();
        const collector = message.createMessageComponentCollector({
            componentType: ComponentType.StringSelect,
            time: 60000,
        });

        collector.on('collect', async (i) => {
            if (i.user.id !== interaction.user.id) {
                await i.reply({
                    content: interaction.t('system.only_caller_can_use'),
                    ephemeral: true,
                });
                return;
            }

            const selectedLang = i.values[0];

            if (selectedLang === currentLang) {
                await i.reply({
                    content: selectedLang === 'vi'
                        ? `${emojis.info} Server đang dùng ${getLanguageDisplay(selectedLang, true)} rồi.`
                        : `${emojis.info} This server is already using ${getLanguageDisplay(selectedLang, true)}.`,
                    ephemeral: true,
                });
                return;
            }

            await MariaModDB.updateGuildSettings(interaction.guildId, { language: selectedLang });
            currentLang = selectedLang;

            await i.update({
                embeds: [buildLanguageEmbed(selectedLang, true)],
                components: [buildLanguageRow(selectedLang, true)],
            });

            collector.stop('selected');
        });

        collector.on('end', async (_, reason) => {
            if (reason === 'selected') return;

            try {
                await interaction.editReply({
                    components: [buildLanguageRow(currentLang, true)],
                });
            } catch {
                // Bỏ qua lỗi dọn dẹp sau khi hết timeout.
            }
        });
    }
};

function buildLanguageRow(currentLang, disabled = false) {
    return new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('server-language-select')
            .setPlaceholder(currentLang === 'vi' ? 'Chọn ngôn ngữ cho server' : 'Select the server language')
            .setDisabled(disabled)
            .addOptions(
                new StringSelectMenuOptionBuilder()
                    .setLabel(getLanguageDisplay('vi', true))
                    .setDescription(LANGUAGE_META.vi.description)
                    .setValue('vi')
                    .setDefault(currentLang === 'vi'),
                new StringSelectMenuOptionBuilder()
                    .setLabel(getLanguageDisplay('en', true))
                    .setDescription(LANGUAGE_META.en.description)
                    .setValue('en')
                    .setDefault(currentLang === 'en'),
            ),
    );
}

function buildLanguageEmbed(lang, changed = false) {
    const isVi = lang === 'vi';

    return createLunabyEmbed()
        .setTitle(
            changed
                ? (isVi ? 'Ngôn ngữ server đã được cập nhật' : 'Server language updated')
                : (isVi ? 'Thiết lập ngôn ngữ server' : 'Server language settings')
        )
        .setDescription(
            changed
                ? (isVi
                    ? `${emojis.success} Bot hiện sẽ hiển thị bằng **${getLanguageDisplay('vi', true)}** trong server này.`
                    : `${emojis.success} The bot will now use **${getLanguageDisplay('en', true)}** in this server.`)
                : (isVi
                    ? 'Chọn ngôn ngữ bạn muốn dùng cho bot trong server từ menu bên dưới.'
                    : 'Choose the language you want the bot to use in this server from the menu below.')
        )
        .addFields({
            name: isVi ? 'Locale hiện tại' : 'Current locale',
            value: isVi ? `\`${getLanguageDisplay('vi', true)}\`` : `\`${getLanguageDisplay('en', true)}\``,
            inline: false,
        })
        .setFooter({
            text: changed
                ? (isVi ? 'Menu đã được khóa sau khi cập nhật.' : 'The menu was locked after updating.')
                : (isVi ? 'Menu sẽ tự tắt sau 60 giây.' : 'This menu will disable after 60 seconds.'),
        });
}