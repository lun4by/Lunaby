const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ButtonBuilder,
    ButtonStyle,
} = require('discord.js');
const MemoryService = require('../../services/ai/MemoryService.js');
const conversationManager = require('../../handlers/conversationManager.js');
const prompts = require('../../config/prompts.js');
const { DEFAULT_MODEL } = require('../../config/constants.js');
const emojis = require('../../config/emojis.js');
const logger = require('../../utils/logger.js');
const { COLORS } = require('../../utils/embedUtils.js');

const MENU_OPTIONS = [
    { value: 'personal_info', labelKey: 'commands.personalize.menu_info', descriptionKey: 'commands.personalize.menu_info_desc', emoji: emojis.personalize.info },
    { value: 'toggle_search', labelKey: 'commands.personalize.menu_search', descriptionKey: 'commands.personalize.menu_search_desc', emoji: emojis.personalize.search },
    { value: 'toggle_memory', labelKey: 'commands.personalize.menu_memory', descriptionKey: 'commands.personalize.menu_memory_desc', emoji: emojis.personalize.memory },
    { value: 'manage', labelKey: 'commands.personalize.menu_manage', descriptionKey: 'commands.personalize.menu_manage_desc', emoji: emojis.personalize.manage },
    { value: 'clear', labelKey: 'commands.personalize.menu_clear', descriptionKey: 'commands.personalize.menu_clear_desc', emoji: emojis.personalize.clear },
];

module.exports = {
    data: new SlashCommandBuilder()
        .setName('personalize')
        .setDescription('Tùy chỉnh trải nghiệm AI của bạn'),
    prefix: { name: 'personalize', aliases: ['ps', 'canhan'], description: 'Tùy chỉnh AI' },
    cooldown: 5,

    async execute(interaction) {
        const userId = interaction.user.id;

        const memory = await MemoryService.getUserMemory(userId);

        const mainEmbed = buildMainEmbed(memory, interaction);
        const row = buildSelectMenuRow(interaction);

        await interaction.reply({
            embeds: [mainEmbed],
            components: [row],
            ephemeral: true,
        });

        const message = await interaction.fetchReply();

        const collector = message.createMessageComponentCollector({
            time: 120000,
        });

        collector.on('collect', async (i) => {
            if (i.user.id !== interaction.user.id) {
                return i.reply({
                    content: interaction.t('system.only_caller_can_use'),
                    ephemeral: true,
                });
            }

            try {
                if (i.isStringSelectMenu()) {
                    await handleMenuSelection(i, userId, interaction);
                } else if (i.isButton()) {
                    await handleButtonClick(i, userId, interaction);
                } else if (i.isModalSubmit()) {
                    await handleModalSubmit(i, userId, interaction);
                }
            } catch (error) {
                logger.error('personalize', 'Error handling interaction:', error);
                const errMsg = interaction.t('commands.personalize.error_occurred');
                if (i.deferred || i.replied) {
                    await i.followUp({ content: errMsg, ephemeral: true }).catch(() => { });
                } else {
                    await i.reply({ content: errMsg, ephemeral: true }).catch(() => { });
                }
            }
        });

        collector.on('end', async () => {
            try {
                const disabledRow = new ActionRowBuilder().addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId('personalize-select')
                        .setPlaceholder(interaction.t('commands.personalize.menu_expired'))
                        .setDisabled(true)
                        .addOptions(new StringSelectMenuOptionBuilder().setLabel(interaction.t('commands.personalize.menu_expired_label')).setValue('expired'))
                );
                await interaction.editReply({ components: [disabledRow] });
            } catch { }
        });
    },
};

function buildMainEmbed(memory, interaction) {
    const occupation = memory?.personalInfo?.occupation || interaction.t('commands.personalize.not_set');
    const instructions = memory?.personalInfo?.customInstructions || interaction.t('commands.personalize.not_set');
    const searchHistory = memory?.privacy?.allowSearchHistoryReference !== false;
    const savedMemory = memory?.privacy?.allowMemoryStorage !== false;

    return new EmbedBuilder()
        .setColor(COLORS.LUNABY)
        .setTitle(interaction.t('commands.personalize.embed_title'))
        .setDescription(interaction.t('commands.personalize.embed_desc'))
        .addFields(
            { name: interaction.t('commands.personalize.field_occupation'), value: occupation, inline: true },
            { name: interaction.t('commands.personalize.field_instructions'), value: instructions.length > 80 ? instructions.substring(0, 80) + '...' : instructions, inline: true },
            { name: '\u200B', value: '\u200B' },
            { name: interaction.t('commands.personalize.field_search'), value: searchHistory ? `\`${emojis.statusOn} ${interaction.t('commands.personalize.status_on')}\`` : `\`${emojis.statusOff} ${interaction.t('commands.personalize.status_off')}\``, inline: true },
            { name: interaction.t('commands.personalize.field_memory'), value: savedMemory ? `\`${emojis.statusOn} ${interaction.t('commands.personalize.status_on')}\`` : `\`${emojis.statusOff} ${interaction.t('commands.personalize.status_off')}\``, inline: true },
        )
        .setTimestamp();
}

function buildSelectMenuRow(interaction) {
    const select = new StringSelectMenuBuilder()
        .setCustomId('personalize-select')
        .setPlaceholder(interaction.t('commands.personalize.select_ph'));

    for (const opt of MENU_OPTIONS) {
        select.addOptions(
            new StringSelectMenuOptionBuilder()
                .setLabel(interaction.t(opt.labelKey))
                .setDescription(interaction.t(opt.descriptionKey))
                .setValue(opt.value)
                .setEmoji(opt.emoji)
        );
    }

    return new ActionRowBuilder().addComponents(select);
}

async function handleMenuSelection(i, userId, interaction) {
    const selected = i.values[0];

    switch (selected) {
        case 'personal_info':
            return showPersonalInfoModal(i, userId, interaction);
        case 'toggle_search':
            return handleToggleSearch(i, userId, interaction);
        case 'toggle_memory':
            return handleToggleMemory(i, userId, interaction);
        case 'manage':
            return handleManageMemories(i, userId, interaction);
        case 'clear':
            return handleClear(i, userId, interaction);
    }
}

async function showPersonalInfoModal(i, userId, interaction) {
    const memory = await MemoryService.getUserMemory(userId);
    const currentOccupation = memory?.personalInfo?.occupation || '';
    const currentInstructions = memory?.personalInfo?.customInstructions || '';

    const modal = new ModalBuilder()
        .setCustomId(`personalize_personal_info_${userId}`)
        .setTitle(interaction.t('commands.personalize.modal_title_info'));

    const occupationInput = new TextInputBuilder()
        .setCustomId('occupation_input')
        .setLabel(interaction.t('commands.personalize.modal_occupation_label'))
        .setPlaceholder(interaction.t('commands.personalize.modal_occupation_ph'))
        .setStyle(TextInputStyle.Short)
        .setMaxLength(100)
        .setRequired(false);

    const instructionsInput = new TextInputBuilder()
        .setCustomId('instructions_input')
        .setLabel(interaction.t('commands.personalize.modal_instruction_label'))
        .setPlaceholder(interaction.t('commands.personalize.modal_instruction_ph'))
        .setStyle(TextInputStyle.Paragraph)
        .setMaxLength(500)
        .setRequired(false);

    if (currentOccupation) occupationInput.setValue(currentOccupation);
    if (currentInstructions) instructionsInput.setValue(currentInstructions);

    modal.addComponents(
        new ActionRowBuilder().addComponents(occupationInput),
        new ActionRowBuilder().addComponents(instructionsInput),
    );
    await i.showModal(modal);

    try {
        const modalInteraction = await i.awaitModalSubmit({
            filter: (mi) => mi.customId === `personalize_personal_info_${userId}` && mi.user.id === i.user.id,
            time: 120000,
        });

        const occupation = modalInteraction.fields.getTextInputValue('occupation_input').trim();
        const instructions = modalInteraction.fields.getTextInputValue('instructions_input').trim();

        await MemoryService.updateUserMemory(userId, {
            'personalInfo.occupation': occupation || null,
            'personalInfo.customInstructions': instructions || null,
        });

        const updatedMemory = await MemoryService.getUserMemory(userId);
        await modalInteraction.update({
            embeds: [buildMainEmbed(updatedMemory, interaction)],
            components: [buildSelectMenuRow(interaction)],
        });
    } catch { }
}

async function handleToggleSearch(i, userId, interaction) {
    const memory = await MemoryService.getUserMemory(userId);
    const current = memory?.privacy?.allowSearchHistoryReference !== false;
    const newValue = !current;

    await MemoryService.updatePrivacySettings(userId, { allowSearchHistoryReference: newValue });

    const updatedMemory = await MemoryService.getUserMemory(userId);
    const statusText = newValue
        ? `${emojis.statusOn} ${interaction.t('commands.personalize.search_on')}`
        : `${emojis.statusOff} ${interaction.t('commands.personalize.search_off')}`;

    const embed = new EmbedBuilder()
        .setColor(newValue ? 0x2ECC71 : 0xE74C3C)
        .setDescription(statusText)
        .setTimestamp();

    await i.update({
        embeds: [buildMainEmbed(updatedMemory, interaction), embed],
        components: [buildSelectMenuRow(interaction)],
    });

    autoRemoveNotification(i, updatedMemory, interaction);
}

async function handleToggleMemory(i, userId, interaction) {
    const memory = await MemoryService.getUserMemory(userId);
    const current = memory?.privacy?.allowMemoryStorage !== false;
    const newValue = !current;

    await MemoryService.updatePrivacySettings(userId, { allowMemoryStorage: newValue });

    const updatedMemory = await MemoryService.getUserMemory(userId);
    const statusText = newValue
        ? `${emojis.statusOn} ${interaction.t('commands.personalize.memory_on')}`
        : `${emojis.statusOff} ${interaction.t('commands.personalize.memory_off')}`;

    const embed = new EmbedBuilder()
        .setColor(newValue ? 0x2ECC71 : 0xE74C3C)
        .setDescription(statusText)
        .setTimestamp();

    await i.update({
        embeds: [buildMainEmbed(updatedMemory, interaction), embed],
        components: [buildSelectMenuRow(interaction)],
    });

    autoRemoveNotification(i, updatedMemory, interaction);
}

async function handleManageMemories(i, userId, interaction) {
    const summary = await MemoryService.getMemorySummary(userId);

    if (!summary) {
        return i.update({
            embeds: [buildMainEmbed(await MemoryService.getUserMemory(userId), interaction),
            new EmbedBuilder().setColor(0xE74C3C).setDescription(interaction.t('commands.personalize.manage_error'))],
            components: [buildSelectMenuRow(interaction)],
        });
    }

    const embed = new EmbedBuilder()
        .setColor(0x3498DB)
        .setTitle(interaction.t('commands.personalize.manage_title'))
        .setTimestamp();

    const personalInfo = [];
    if (summary.personalInfo.name) personalInfo.push(interaction.t('commands.personalize.manage_pi_name', { value: summary.personalInfo.name }));
    if (summary.personalInfo.nickname) personalInfo.push(interaction.t('commands.personalize.manage_pi_nickname', { value: summary.personalInfo.nickname }));
    if (summary.personalInfo.age) personalInfo.push(interaction.t('commands.personalize.manage_pi_age', { value: summary.personalInfo.age }));
    if (summary.personalInfo.location) personalInfo.push(interaction.t('commands.personalize.manage_pi_location', { value: summary.personalInfo.location }));
    if (summary.personalInfo.occupation) personalInfo.push(interaction.t('commands.personalize.manage_pi_occupation', { value: summary.personalInfo.occupation }));

    if (personalInfo.length > 0) {
        embed.addFields({ name: interaction.t('commands.personalize.manage_field_pi'), value: personalInfo.join('\n'), inline: false });
    }

    const preferences = [];
    if (summary.preferences.likes.length > 0) preferences.push(interaction.t('commands.personalize.manage_pref_likes', { value: summary.preferences.likes.slice(0, 5).join(', ') }));
    if (summary.preferences.hobbies.length > 0) preferences.push(interaction.t('commands.personalize.manage_pref_hobbies', { value: summary.preferences.hobbies.slice(0, 5).join(', ') }));
    if (summary.preferences.topics.length > 0) preferences.push(interaction.t('commands.personalize.manage_pref_topics', { value: summary.preferences.topics.slice(0, 5).join(', ') }));

    if (preferences.length > 0) {
        embed.addFields({ name: interaction.t('commands.personalize.manage_field_pref'), value: preferences.join('\n'), inline: false });
    }

    if (summary.importantMemories.length > 0) {
        const memoryList = summary.importantMemories
            .slice(0, 5)
            .map((mem, idx) => `${idx + 1}. ${mem.content} (${emojis.personalize.importance} ${mem.importance}/10)`)
            .join('\n');
        embed.addFields({ name: interaction.t('commands.personalize.manage_field_imp'), value: memoryList, inline: false });
    }

    embed.addFields({
        name: interaction.t('commands.personalize.manage_stats'),
        value: [
            interaction.t('commands.personalize.manage_stats_total', { total: summary.totalMemories }),
            interaction.t('commands.personalize.manage_stats_msgs', { msgs: summary.interactionStats.totalMessages }),
            interaction.t('commands.personalize.manage_stats_first', { time: Math.floor(new Date(summary.interactionStats.firstInteraction).getTime() / 1000) }),
        ].join('\n'),
        inline: false,
    });

    if (summary.totalMemories === 0 && personalInfo.length === 0 && preferences.length === 0) {
        embed.setDescription(interaction.t('commands.personalize.manage_no_data'));
    }

    await i.update({
        embeds: [buildMainEmbed(await MemoryService.getUserMemory(userId), interaction), embed],
        components: [buildSelectMenuRow(interaction)],
    });
}

async function handleClear(i, userId, interaction) {
    const confirmEmbed = new EmbedBuilder()
        .setColor(0xE74C3C)
        .setTitle(interaction.t('commands.personalize.clear_confirm_title'))
        .setDescription(interaction.t('commands.personalize.clear_confirm_desc'))
        .setTimestamp();

    const buttonRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('personalize_clear_confirm')
            .setLabel(interaction.t('commands.personalize.clear_btn_confirm'))
            .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
            .setCustomId('personalize_clear_cancel')
            .setLabel(interaction.t('commands.personalize.clear_btn_cancel'))
            .setStyle(ButtonStyle.Secondary),
    );

    await i.update({
        embeds: [confirmEmbed],
        components: [buttonRow],
    });
}

async function handleButtonClick(i, userId, interaction) {
    if (i.customId === 'personalize_clear_confirm') {
        try {
            const memoryCleared = await MemoryService.clearUserMemories(userId);
            const conversationReset = await conversationManager.resetConversation(userId, prompts.system.main, DEFAULT_MODEL);

            if (!memoryCleared || !conversationReset) {
                throw new Error('Không thể xóa toàn bộ dữ liệu người dùng');
            }

            const successEmbed = new EmbedBuilder()
                .setColor(0x2ECC71)
                .setTitle(interaction.t('commands.personalize.clear_success_title'))
                .setDescription(interaction.t('commands.personalize.clear_success_desc'))
                .setTimestamp();

            const updatedMemory = await MemoryService.getUserMemory(userId);
            await i.update({
                embeds: [buildMainEmbed(updatedMemory, interaction), successEmbed],
                components: [buildSelectMenuRow(interaction)],
            });

            autoRemoveNotification(i, updatedMemory, interaction);

            logger.info('personalize', `User ${interaction.user.tag} cleared all data`);
        } catch (error) {
            logger.error('personalize', 'Error clearing data:', error);
            await i.update({
                embeds: [new EmbedBuilder().setColor(0xE74C3C).setDescription(interaction.t('commands.personalize.clear_error'))],
                components: [buildSelectMenuRow(interaction)],
            });
        }
    } else if (i.customId === 'personalize_clear_cancel') {
        const updatedMemory = await MemoryService.getUserMemory(userId);
        await i.update({
            embeds: [buildMainEmbed(updatedMemory, interaction)],
            components: [buildSelectMenuRow(interaction)],
        });
    }
}

function autoRemoveNotification(i, memory, interaction) {
    setTimeout(async () => {
        try {
            await i.editReply({
                embeds: [buildMainEmbed(memory, interaction)],
                components: [buildSelectMenuRow(interaction)],
            });
        } catch { }
    }, 5000);
}