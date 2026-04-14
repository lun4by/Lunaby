const {
    SlashCommandBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    ComponentType,
    MessageFlags,
} = require('discord.js');
const fs = require('fs');
const path = require('path');
const logger = require('../../utils/core/logger');
const emojis = require('../../config/emojis');
const { COLORS } = require('../../utils/discord/embedUtils');

const { createContainer } = require('../../utils/discord/builderFactory');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('Hiển thị danh sách lệnh và thông tin trợ giúp'),
    prefix: { name: 'help', aliases: ['h', 'commands'], description: 'Trợ giúp' },
    cooldown: 5,

    async execute(interaction) {
        const isOwner = interaction.user.id === process.env.OWNER_ID;

        const commandsPath = path.join(__dirname, '../');
        const commandFolders = fs.readdirSync(commandsPath, { withFileTypes: true })
            .filter((dirent) => dirent.isDirectory())
            .map((dirent) => dirent.name);

        const visibleCategories = commandFolders.filter((folder) => {
            if (isOwner) return true;
            return folder !== 'admin';
        });

        visibleCategories.unshift('home');

        let currentCategory = 'home';

        await interaction.reply({
            components: buildHelpComponents({
                category: currentCategory,
                visibleCategories,
                commandsPath,
                interaction,
            }),
            flags: MessageFlags.IsComponentsV2,
        });

        const message = await interaction.fetchReply();

        const collector = message.createMessageComponentCollector({
            time: 60000,
            componentType: ComponentType.StringSelect,
        });

        collector.on('collect', async (i) => {
            if (i.user.id !== interaction.user.id) {
                return i.reply({
                    content: interaction.t('system.only_caller_can_use'),
                    flags: MessageFlags.Ephemeral,
                });
            }

            const category = i.values[0];

            if (category === 'admin' && !isOwner) {
                return i.reply({
                    content: interaction.t('commands.help.no_view_permission'),
                    flags: MessageFlags.Ephemeral,
                });
            }

            currentCategory = category;

            await i.update({
                components: buildHelpComponents({
                    category,
                    visibleCategories,
                    commandsPath,
                    interaction,
                }),
            });
        });

        collector.on('end', async () => {
            try {
                await interaction.editReply({
                    components: buildHelpComponents({
                        category: currentCategory,
                        visibleCategories,
                        commandsPath,
                        interaction,
                        disabled: true,
                        expired: true,
                    }),
                });
            } catch (error) {
                logger.error('help', 'Error when disabling the help menu:', error);
            }
        });
    },
};

function buildSelectMenu(categories, interaction, selectedCategory, disabled = false) {
    return new StringSelectMenuBuilder()
        .setCustomId('category-select')
        .setPlaceholder(interaction.t('commands.help.select_placeholder'))
        .setDisabled(disabled)
        .addOptions(buildSelectOptions(categories, interaction, selectedCategory));
}

function buildSelectOptions(categories, interaction, selectedCategory) {
    const options = [];

    for (const folder of categories) {
        const metadata = getCategoryMetadata(folder, interaction);

        options.push(
            new StringSelectMenuOptionBuilder()
                .setLabel(metadata.label)
                .setDescription(metadata.description)
                .setValue(folder)
                .setEmoji(metadata.emoji)
                .setDefault(folder === selectedCategory),
        );
    }

    return options;
}

function buildHelpComponents({
    category,
    visibleCategories,
    commandsPath,
    interaction,
    disabled = false,
    expired = false,
}) {
    const container = createContainer().setAccentColor(COLORS.LUNABY);
    const select = buildSelectMenu(visibleCategories, interaction, category, disabled);

    container.addActionRowComponents((actionRow) =>
        actionRow.setComponents(select)
    );

    container.addTextDisplayComponents((textDisplay) =>
        textDisplay.setContent(
            category === 'home'
                ? buildHomeContent(visibleCategories, interaction)
                : buildCategoryContent(category, commandsPath, interaction)
        )
    );

    if (expired) {
        container.addSeparatorComponents((separator) => separator);
        container.addTextDisplayComponents((textDisplay) =>
            textDisplay.setContent(`> ${interaction.t('commands.help.menu_expired')}`)
        );
    }

    return [container];
}

function buildHomeContent(visibleCategories, interaction) {
    const categoryLines = visibleCategories
        .filter((category) => category !== 'home')
        .map((category) => {
            const metadata = getCategoryMetadata(category, interaction);
            return `- ${metadata.emoji} **${metadata.label}**: ${metadata.description}`;
        })
        .join('\n');

    return [
        `## ${interaction.t('commands.help.embed_title')}`,
        interaction.t('commands.help.embed_desc'),
        categoryLines,
    ].filter(Boolean).join('\n\n');
}

function buildCategoryContent(category, commandsPath, interaction) {
    const metadata = getCategoryMetadata(category, interaction);
    const folderPath = path.join(commandsPath, category);

    if (!fs.existsSync(folderPath) || !fs.statSync(folderPath).isDirectory()) {
        return `## ${metadata.emoji} ${metadata.label}\n\n${interaction.t('commands.help.no_commands')}`;
    }

    const commandFiles = fs.readdirSync(folderPath)
        .filter((file) => file.endsWith('.js'))
        .sort((a, b) => a.localeCompare(b));

    const commandList = commandFiles
        .map((file) => {
            const command = require(path.join(folderPath, file));
            const key = `commands.${command.data.name}.desc`;
            const translated = interaction.t(key);
            const hasTranslation = translated && translated !== key;
            const description = hasTranslation
                ? translated
                : (command.data.description || interaction.t('commands.help.no_description'));

            return `- /${command.data.name}: ${description}`;
        })
        .join('\n');

    return [
        `## ${metadata.emoji} ${metadata.label}`,
        interaction.t('commands.help.category_details', { category: metadata.label }),
        commandList || interaction.t('commands.help.no_commands'),
    ].join('\n\n');
}

function getCategoryMetadata(category, interaction) {
    let label = capitalizeFirstLetter(category);
    let desc = `Danh mục ${label}`;
    
    // Cấu trúc mặc định trước khi thử fallback
    const keyPath = `commands.help.categories.${category}`;
    const trans = interaction.t(keyPath, { returnObjects: true });
    
    if (trans && typeof trans === 'object') {
        label = trans.label || label;
        desc = trans.desc || desc;
    }

    const categoryMap = {
        'home': { emoji: emojis.categories.home },
        'AIcore': { emoji: emojis.categories.aiCore },
        'Core': { emoji: emojis.categories.core },
        'moderation': { emoji: emojis.categories.moderation },
        'economy': { emoji: emojis.categories.economy },
        'social': { emoji: emojis.categories.social },
        'system': { emoji: emojis.categories.system },
        'fun': { emoji: emojis.categories.fun },
    };

    const emoji = categoryMap[category]?.emoji || emojis.categories.folder;

    return { label, description: desc, emoji };
}

function capitalizeFirstLetter(value) {
    return value.charAt(0).toUpperCase() + value.slice(1);
}
