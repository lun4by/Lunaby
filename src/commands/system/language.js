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
const i18nManager = require('../../services/i18n/i18nManager');
const viLocale = require('../../locales/vi.json');
const { createLunabyEmbed } = require('../../utils/embedUtils');
const { getGuildLocale, invalidateGuildLocaleCache } = require('../../utils/guildLocale.js');

const defaultLang = 'vi';
const fallbackLanguageConfig = viLocale?.commands?.language || {};
const fallbackLanguageMeta = fallbackLanguageConfig.languages || {};
const supportedLangs = Array.isArray(fallbackLanguageConfig.supported)
    ? fallbackLanguageConfig.supported
    : Object.keys(fallbackLanguageMeta);

function formatLanguageDisplay(meta, withCode = false) {
    if (!meta) return '';
    return withCode ? `${meta.flag} ${meta.label} - ${meta.code}` : `${meta.flag} ${meta.label}`;
}

const languageChoices = supportedLangs.map((lang) => ({
    name: formatLanguageDisplay(fallbackLanguageMeta[lang]),
    value: lang,
}));

function tByLang(lang, key, options = {}) {
    return i18nManager.t(key, lang || defaultLang, options);
}

function getLanguageCatalog(textLang = defaultLang) {
    const catalog = tByLang(textLang, 'commands.language.languages', { returnObjects: true });
    if (catalog && typeof catalog === 'object' && !Array.isArray(catalog)) {
        return catalog;
    }
    return fallbackLanguageMeta;
}

function getLanguageMeta(targetLang, textLang = defaultLang) {
    const catalog = getLanguageCatalog(textLang);
    return catalog[targetLang] || fallbackLanguageMeta[targetLang] || fallbackLanguageMeta[defaultLang];
}

function getLanguageDisplay(targetLang, textLang = defaultLang, withCode = false) {
    return formatLanguageDisplay(getLanguageMeta(targetLang, textLang), withCode);
}

function buildLanguageChangedText(targetLang, previousLang, guildName = '') {
    const from = getLanguageDisplay(previousLang, targetLang);
    const to = getLanguageDisplay(targetLang, targetLang);
    return tByLang(targetLang, 'commands.language.notice.changed', {
        guildName: guildName || (targetLang === 'vi' ? 'server này' : 'this server'),
        from,
        to,
    });
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('language')
        .setDescription('Thay đổi ngôn ngữ của bot cho server / Change the bot language for this server')
        .addStringOption(option =>
            option.setName('lang')
                .setDescription('Chọn ngôn ngữ của server / Select the server language')
                .setRequired(false)
                .addChoices(...languageChoices)),
    prefix: { name: 'language', aliases: ['lang'], description: 'Cài đặt ngôn ngữ server / Server language settings' },
    cooldown: 5,

    async execute(interaction) {
        if (!interaction.guildId || !interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
            return interaction.reply({
                content: `${emojis.error} ${interaction.t('system.no_permission')}`,
                ephemeral: true,
            });
        }

        let currentLang = await getGuildLocale(interaction.guildId, defaultLang);

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
                    content: tByLang(selectedLang, 'commands.language.notice.already_using', {
                        langDisplay: getLanguageDisplay(selectedLang, selectedLang),
                    }),
                    ephemeral: true,
                });
                return;
            }

            const previousLang = currentLang;
            await MariaModDB.updateGuildSettings(interaction.guildId, { language: selectedLang });
            invalidateGuildLocaleCache(interaction.guildId);
            currentLang = selectedLang;

            await i.update({
                embeds: [buildLanguageEmbed(selectedLang)],
                components: [buildLanguageRow(selectedLang)],
            });

            await i.followUp({
                content: buildLanguageChangedText(selectedLang, previousLang, interaction.guild?.name),
                ephemeral: true,
            }).catch(() => { });
        });

        collector.on('end', async (_, reason) => {
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
            .setPlaceholder(tByLang(currentLang, 'commands.language.placeholder'))
            .setDisabled(disabled)
            .addOptions(
                ...supportedLangs.map((lang) =>
                    new StringSelectMenuOptionBuilder()
                        .setLabel(getLanguageMeta(lang, currentLang).label)
                        .setValue(lang)
                        .setDefault(currentLang === lang)
                ),
            ),
    );
}

function buildLanguageEmbed(lang, changed = false) {
    const display = getLanguageDisplay(lang, lang, true);
    const currentMeta = getLanguageMeta(lang, lang);
    const currentLocaleValue = `${currentMeta.flag} \`${currentMeta.label}\``;

    return createLunabyEmbed()
        .setTitle(
            changed
                ? tByLang(lang, 'commands.language.title.updated')
                : tByLang(lang, 'commands.language.title.settings')
        )
        .setDescription(
            changed
                ? tByLang(lang, 'commands.language.description.updated', { langDisplay: display })
                : tByLang(lang, 'commands.language.description.settings')
        )
        .addFields({
            name: tByLang(lang, 'commands.language.field.current_locale'),
            value: currentLocaleValue,
            inline: false,
        })
        .setFooter({
            text: changed
                ? tByLang(lang, 'commands.language.footer.changed')
                : tByLang(lang, 'commands.language.footer.normal'),
        });
}