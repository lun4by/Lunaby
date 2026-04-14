const {
    SlashCommandBuilder,
    ActionRowBuilder,
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

const { createEmbed } = require('../../utils/discord/builderFactory');

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

        // Thêm mục Trang chủ lên đầu danh sách
        visibleCategories.unshift('home');

        const select = new StringSelectMenuBuilder()
            .setCustomId('category-select')
            .setPlaceholder(interaction.t('commands.help.select_placeholder'))
            .addOptions(buildSelectOptions(visibleCategories, interaction));

        const row = new ActionRowBuilder().addComponents(select);
        const banner = 'https://cdn.lunie.dev/Lunaby/Lunaby_Help.jpg';

        const welcomeEmbed = createEmbed()
            .setColor(COLORS.LUNABY)
            .setTitle(interaction.t('commands.help.embed_title'))
            .setDescription(interaction.t('commands.help.embed_desc'))
            .setImage(banner)
            .setFooter({ text: 'Made by s4ory' })
            .setTimestamp();

        await interaction.reply({
            embeds: [welcomeEmbed],
            components: [row],
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

            // Nếu người dùng chọn Trang chủ, quay lại embed chào mừng
            if (category === 'home') {
                return i.update({
                    embeds: [welcomeEmbed],
                    components: [row],
                });
            }

            const helpEmbed = buildHelpEmbed(category, visibleCategories, commandsPath, interaction);

            await i.update({
                embeds: [helpEmbed],
                components: [row],
            });
        });

        collector.on('end', async (collected) => {
            try {
                const disabledRow = new ActionRowBuilder().addComponents(
                    select.setDisabled(true),
                );

                if (collected.size === 0) {
                    await interaction.editReply({
                        content: interaction.t('commands.help.menu_expired'),
                        components: [disabledRow],
                    });
                } else {
                    await interaction.editReply({
                        components: [disabledRow],
                    });
                }
            } catch (error) {
                logger.error('help', 'Error when disabling the help menu:', error);
            }
        });
    },
};

function buildSelectOptions(categories, interaction) {
    const options = [];

    for (const folder of categories) {
        const metadata = getCategoryMetadata(folder, interaction);

        options.push(
            new StringSelectMenuOptionBuilder()
                .setLabel(metadata.label)
                .setDescription(metadata.description)
                .setValue(folder)
                .setEmoji(metadata.emoji),
        );
    }

    return options;
}

function buildHelpEmbed(category, visibleCategories, commandsPath, interaction) {
    const embed = createEmbed()
        .setColor(COLORS.LUNABY)
        .setTimestamp();

    const metadata = getCategoryMetadata(category, interaction);

    embed
        .setTitle(`${metadata.emoji} ${metadata.label}`)
        .setDescription(interaction.t('commands.help.category_details', { category: metadata.label }));

    const folderPath = path.join(commandsPath, category);
    const commandFiles = fs.readdirSync(folderPath).filter((file) => file.endsWith('.js'));

    const commandList = commandFiles.map((file) => {
        const command = require(path.join(folderPath, file));
        const description = interaction.t(`commands.${command.data.name}.desc`, { returnObjects: true });
        const textDesc = typeof description === 'string' ? description : (command.data.description || interaction.t('commands.help.no_description'));
        return `/${command.data.name} : ${textDesc}`;
    }).join('\n');

    embed.addFields({
        name: '\u200B',
        value: `\`\`\`${commandList || interaction.t('commands.help.no_commands')}\`\`\``,
    });

    return embed;
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
        'admin': { emoji: emojis.categories.folder },
        'core': { emoji: emojis.categories.core },
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