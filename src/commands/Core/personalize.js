const {
    SlashCommandBuilder,
    ActionRowBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ButtonBuilder,
    ButtonStyle,
    ContainerBuilder,
    MessageFlags,
} = require('discord.js');
const MemoryService = require('../../services/ai/MemoryService.js');
const conversationManager = require('../../handlers/conversationManager.js');
const prompts = require('../../config/prompts.js');
const { DEFAULT_MODEL } = require('../../config/constants.js');
const emojis = require('../../config/emojis.js');
const logger = require('../../utils/core/logger.js');
const { COLORS } = require('../../utils/discord/embedUtils.js');

function isPrivacyEnabled(value) {
    if (value === false || value === 0) return false;
    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (normalized === 'false' || normalized === '0' || normalized === 'off' || normalized === 'no') {
            return false;
        }
    }
    return true;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('personalize')
        .setDescription('Tùy chỉnh trải nghiệm AI của bạn'),
    prefix: { name: 'personalize', aliases: ['ps', 'canhan'], description: 'Tùy chỉnh AI' },
    cooldown: 5,

    async execute(interaction) {
        const userId = interaction.user.id;

        const memory = await MemoryService.getUserMemory(userId);
        const components = buildPersonalizeComponents(interaction, memory);

        await interaction.reply({
            components,
            flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
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
                if (i.isButton()) {
                    await handleButtonClick(i, userId, interaction);
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
                const latestMemory = await MemoryService.getUserMemory(userId);
                await interaction.editReply({
                    components: buildPersonalizeComponents(interaction, latestMemory, { disabled: true }),
                });
            } catch { }
        });
    },
};

function buildMainCardText(memory, interaction) {
    const occupation = memory?.personalInfo?.occupation || interaction.t('commands.personalize.not_set');
    const instructions = memory?.personalInfo?.customInstructions || interaction.t('commands.personalize.not_set');
    const searchHistory = isPrivacyEnabled(memory?.privacy?.allowSearchHistoryReference);
    const savedMemory = isPrivacyEnabled(memory?.privacy?.allowMemoryStorage);

    const safeInstructions = instructions.length > 80 ? `${instructions.substring(0, 80)}...` : instructions;
    const searchStatus = searchHistory
        ? `${emojis.statusOn} ${interaction.t('commands.personalize.status_on')}`
        : `${emojis.statusOff} ${interaction.t('commands.personalize.status_off')}`;
    const memoryStatus = savedMemory
        ? `${emojis.statusOn} ${interaction.t('commands.personalize.status_on')}`
        : `${emojis.statusOff} ${interaction.t('commands.personalize.status_off')}`;

    return [
        `## ${interaction.t('commands.personalize.embed_title')}`,
        interaction.t('commands.personalize.embed_desc'),
        '',
        `**${interaction.t('commands.personalize.field_occupation')}**`,
        occupation,
        '',
        `**${interaction.t('commands.personalize.field_instructions')}**`,
        safeInstructions,
        '',
        `**${interaction.t('commands.personalize.field_search')}**`,
        searchStatus,
        `**${interaction.t('commands.personalize.field_memory')}**`,
        memoryStatus,
    ].join('\n');
}

function buildActionButtons(interaction, memory = null, disabled = false) {
    const searchEnabled = isPrivacyEnabled(memory?.privacy?.allowSearchHistoryReference);
    const memoryEnabled = isPrivacyEnabled(memory?.privacy?.allowMemoryStorage);
    return [
        new ButtonBuilder()
            .setCustomId('personalize_personal_info')
            .setLabel(interaction.t('commands.personalize.menu_info'))
            .setEmoji(emojis.personalize.info)
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(disabled),
        new ButtonBuilder()
            .setCustomId('personalize_toggle_search')
            .setLabel(interaction.t('commands.personalize.menu_search'))
            .setEmoji(emojis.personalize.search)
            .setStyle(searchEnabled ? ButtonStyle.Success : ButtonStyle.Danger)
            .setDisabled(disabled),
        new ButtonBuilder()
            .setCustomId('personalize_toggle_memory')
            .setLabel(interaction.t('commands.personalize.menu_memory'))
            .setEmoji(emojis.personalize.memory)
            .setStyle(memoryEnabled ? ButtonStyle.Success : ButtonStyle.Danger)
            .setDisabled(disabled),
        new ButtonBuilder()
            .setCustomId('personalize_clear')
            .setLabel(interaction.t('commands.personalize.menu_clear'))
            .setStyle(ButtonStyle.Danger)
            .setDisabled(disabled)
    ];
}

function buildPersonalizeComponents(interaction, memory, options = {}) {
    const { disabled = false, notice = null } = options;
    const components = [];

    const mainContainer = new ContainerBuilder()
        .setAccentColor(COLORS.LUNABY)
        .addTextDisplayComponents((textDisplay) =>
            textDisplay.setContent(buildMainCardText(memory, interaction))
        )
        .addActionRowComponents((actionRow) =>
            actionRow.setComponents(...buildActionButtons(interaction, memory, disabled))
        );

    components.push(mainContainer);

    if (notice?.text) {
        const noticeContainer = new ContainerBuilder()
            .setAccentColor(notice.color || COLORS.LUNABY)
            .addTextDisplayComponents((textDisplay) => textDisplay.setContent(notice.text));

        components.push(noticeContainer);
    }

    return components;
}

function buildClearConfirmComponents(interaction) {
    const confirmText = [
        `## ${interaction.t('commands.personalize.clear_confirm_title')}`,
        interaction.t('commands.personalize.clear_confirm_desc'),
    ].join('\n');

    return [
        new ContainerBuilder()
            .setAccentColor(0xE74C3C)
            .addTextDisplayComponents((textDisplay) => textDisplay.setContent(confirmText))
            .addActionRowComponents((actionRow) =>
                actionRow.setComponents(
                    new ButtonBuilder()
                        .setCustomId('personalize_clear_confirm')
                        .setLabel(interaction.t('commands.personalize.clear_btn_confirm'))
                        .setStyle(ButtonStyle.Danger),
                    new ButtonBuilder()
                        .setCustomId('personalize_clear_cancel')
                        .setLabel(interaction.t('commands.personalize.clear_btn_cancel'))
                        .setStyle(ButtonStyle.Secondary)
                )
            ),
    ];
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
            components: buildPersonalizeComponents(interaction, updatedMemory),
        });
    } catch { }
}

async function handleToggleSearch(i, userId, interaction) {
    const memory = await MemoryService.getUserMemory(userId);
    const current = isPrivacyEnabled(memory?.privacy?.allowSearchHistoryReference);
    const newValue = !current;

    const updated = await MemoryService.updatePrivacySettings(userId, { allowSearchHistoryReference: newValue });
    if (!updated) {
        const latestMemory = await MemoryService.getUserMemory(userId);
        return i.update({
            components: buildPersonalizeComponents(interaction, latestMemory, {
                notice: {
                    color: 0xE74C3C,
                    text: interaction.t('commands.personalize.error_occurred'),
                },
            }),
        });
    }

    const updatedMemory = await MemoryService.getUserMemory(userId);
    const statusText = newValue
        ? `${emojis.statusOn} ${interaction.t('commands.personalize.search_on')}`
        : `${emojis.statusOff} ${interaction.t('commands.personalize.search_off')}`;

    await i.update({
        components: buildPersonalizeComponents(interaction, updatedMemory, {
            notice: {
                color: newValue ? 0x2ECC71 : 0xE74C3C,
                text: statusText,
            },
        }),
    });

    autoRemoveNotification(i, updatedMemory, interaction);
}

async function handleToggleMemory(i, userId, interaction) {
    const memory = await MemoryService.getUserMemory(userId);
    const current = isPrivacyEnabled(memory?.privacy?.allowMemoryStorage);
    const newValue = !current;

    const updated = await MemoryService.updatePrivacySettings(userId, { allowMemoryStorage: newValue });
    if (!updated) {
        const latestMemory = await MemoryService.getUserMemory(userId);
        return i.update({
            components: buildPersonalizeComponents(interaction, latestMemory, {
                notice: {
                    color: 0xE74C3C,
                    text: interaction.t('commands.personalize.error_occurred'),
                },
            }),
        });
    }

    const updatedMemory = await MemoryService.getUserMemory(userId);
    const statusText = newValue
        ? `${emojis.statusOn} ${interaction.t('commands.personalize.memory_on')}`
        : `${emojis.statusOff} ${interaction.t('commands.personalize.memory_off')}`;

    await i.update({
        components: buildPersonalizeComponents(interaction, updatedMemory, {
            notice: {
                color: newValue ? 0x2ECC71 : 0xE74C3C,
                text: statusText,
            },
        }),
    });

    autoRemoveNotification(i, updatedMemory, interaction);
}

async function handleClear(i, userId, interaction) {
    await i.update({
        components: buildClearConfirmComponents(interaction),
    });
}

async function handleButtonClick(i, userId, interaction) {
    if (i.customId === 'personalize_personal_info') {
        return showPersonalInfoModal(i, userId, interaction);
    }

    if (i.customId === 'personalize_toggle_search') {
        return handleToggleSearch(i, userId, interaction);
    }

    if (i.customId === 'personalize_toggle_memory') {
        return handleToggleMemory(i, userId, interaction);
    }

    if (i.customId === 'personalize_clear') {
        return handleClear(i, userId, interaction);
    }

    if (i.customId === 'personalize_clear_confirm') {
        try {
            const memoryCleared = await MemoryService.clearUserMemories(userId);
            const conversationReset = await conversationManager.resetConversation(userId, prompts.system.main, DEFAULT_MODEL);

            if (!memoryCleared || !conversationReset) {
                throw new Error('Không thể xóa toàn bộ dữ liệu người dùng');
            }

            const updatedMemory = await MemoryService.getUserMemory(userId);
            await i.update({
                components: buildPersonalizeComponents(interaction, updatedMemory, {
                    notice: {
                        color: 0x2ECC71,
                        text: `${interaction.t('commands.personalize.clear_success_title')}\n${interaction.t('commands.personalize.clear_success_desc')}`,
                    },
                }),
            });

            autoRemoveNotification(i, updatedMemory, interaction);

            logger.info('personalize', `User ${interaction.user.tag} cleared all data`);
        } catch (error) {
            logger.error('personalize', 'Error clearing data:', error);
            const latestMemory = await MemoryService.getUserMemory(userId);
            await i.update({
                components: buildPersonalizeComponents(interaction, latestMemory, {
                    notice: {
                        color: 0xE74C3C,
                        text: interaction.t('commands.personalize.clear_error'),
                    },
                }),
            });
        }
    } else if (i.customId === 'personalize_clear_cancel') {
        const updatedMemory = await MemoryService.getUserMemory(userId);
        await i.update({
            components: buildPersonalizeComponents(interaction, updatedMemory),
        });
    }
}

function autoRemoveNotification(i, memory, interaction) {
    setTimeout(async () => {
        try {
            await i.editReply({
                components: buildPersonalizeComponents(interaction, memory),
            });
        } catch { }
    }, 5000);
}