const {
    SlashCommandBuilder,
    ActionRowBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags,
} = require('discord.js');
const MemoryService = require('../../services/ai/MemoryService.js');
const conversationManager = require('../../handlers/conversationManager.js');
const prompts = require('../../config/prompts.js');
const { DEFAULT_MODEL } = require('../../config/constants.js');
const emojis = require('../../config/emojis.js');
const logger = require('../../utils/core/logger.js');
const { COLORS } = require('../../utils/discord/embedUtils.js');

const { createContainer } = require('../../utils/discord/builderFactory');
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

function toButtonEmoji(emojiValue) {
    if (!emojiValue || typeof emojiValue !== 'string') return undefined;

    const customEmojiMatch = emojiValue.match(/^<(a?):([a-zA-Z0-9_]+):(\d+)>$/);
    if (customEmojiMatch) {
        const [, animatedFlag, name, id] = customEmojiMatch;
        return {
            id,
            name,
            animated: animatedFlag === 'a',
        };
    }

    return { name: emojiValue };
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

        const collector = message.createMessageComponentCollector();

        collector.on('collect', async (i) => {
            if (i.user.id !== interaction.user.id) {
                return i.reply({
                    content: interaction.t('system.only_caller_can_use'),
                    ephemeral: true,
                });
            }

            try {
                if (i.isButton()) {
                    await handleButtonClick(i, userId, interaction, collector);
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
    },
};

function buildMainCardText(interaction) {
    return [
        `## ${interaction.t('commands.personalize.embed_title')}`,
        interaction.t('commands.personalize.embed_desc'),
    ].join('\n');
}

function buildPersonalInfoCardText(memory, interaction) {
    const occupation = memory?.personalInfo?.occupation?.trim();
    const instructions = memory?.personalInfo?.customInstructions?.trim();
    const hasPersonalInfo = Boolean(occupation || instructions);
    return [
        `**${interaction.t('commands.personalize.instructions_title')}**`,
        hasPersonalInfo ? 'Đã thiết lập' : interaction.t('commands.personalize.not_set'),
    ].join('\n');
}

function buildSearchStatusText(memory, interaction) {
    const searchEnabled = isPrivacyEnabled(memory?.privacy?.allowSearchHistoryReference);
    const status = searchEnabled
        ? `${emojis.statusOn} ${interaction.t('commands.personalize.status_on')}`
        : `${emojis.statusOff} ${interaction.t('commands.personalize.status_off')}`;

    return [
        `**${interaction.t('commands.personalize.field_search')}**`,
        status,
    ].join('\n');
}

function buildMemoryStatusText(memory, interaction) {
    const memoryEnabled = isPrivacyEnabled(memory?.privacy?.allowMemoryStorage);
    const status = memoryEnabled
        ? `${emojis.statusOn} ${interaction.t('commands.personalize.status_on')}`
        : `${emojis.statusOff} ${interaction.t('commands.personalize.status_off')}`;

    return [
        `**${interaction.t('commands.personalize.field_memory')}**`,
        status,
    ].join('\n');
}

function buildPersonalizeComponents(interaction, memory, options = {}) {
    // Dựng UI.
    const { disabled = false, notice = null } = options;
    const searchEnabled = isPrivacyEnabled(memory?.privacy?.allowSearchHistoryReference);
    const memoryEnabled = isPrivacyEnabled(memory?.privacy?.allowMemoryStorage);
    const searchToggleLabel = interaction.t(
        searchEnabled ? 'commands.personalize.toggle_btn_on' : 'commands.personalize.toggle_btn_off'
    );
    const memoryToggleLabel = interaction.t(
        memoryEnabled ? 'commands.personalize.toggle_btn_on' : 'commands.personalize.toggle_btn_off'
    );
    const components = [];

    const mainContainer = createContainer()
        .setAccentColor(COLORS.LUNABY)
        .addTextDisplayComponents((textDisplay) =>
            textDisplay.setContent(buildMainCardText(interaction))
        )
        .addSectionComponents((section) =>
            section
                .addTextDisplayComponents((textDisplay) =>
                    textDisplay.setContent(buildPersonalInfoCardText(memory, interaction))
                )
                .setButtonAccessory((button) =>
                    button
                        .setCustomId('personalize_personal_info')
                        .setLabel(interaction.t('commands.personalize.btn_customize'))
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(disabled)
                )
        )
        .addSeparatorComponents((separator) => separator)
        .addSectionComponents((section) =>
            section
                .addTextDisplayComponents((textDisplay) =>
                    textDisplay.setContent(buildSearchStatusText(memory, interaction))
                )
                .setButtonAccessory((button) =>
                    button
                        .setCustomId('personalize_toggle_search')
                        .setLabel(searchToggleLabel)
                        .setStyle(searchEnabled ? ButtonStyle.Success : ButtonStyle.Danger)
                        .setDisabled(disabled)
                )
        )
        .addSectionComponents((section) =>
            section
                .addTextDisplayComponents((textDisplay) =>
                    textDisplay.setContent(buildMemoryStatusText(memory, interaction))
                )
                .setButtonAccessory((button) =>
                    button
                        .setCustomId('personalize_toggle_memory')
                        .setLabel(memoryToggleLabel)
                        .setStyle(memoryEnabled ? ButtonStyle.Success : ButtonStyle.Danger)
                        .setDisabled(disabled)
                )
        )
        .addSeparatorComponents((separator) => separator)
        .addActionRowComponents((actionRow) =>
            actionRow.setComponents(
                new ButtonBuilder()
                    .setCustomId('personalize_clear')
                    .setLabel(interaction.t('commands.personalize.menu_clear'))
                    .setStyle(ButtonStyle.Danger)
                    .setDisabled(disabled),
                new ButtonBuilder()
                    .setCustomId('personalize_close')
                    .setLabel(interaction.t('commands.personalize.menu_close'))
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(disabled)
            )
        );

    components.push(mainContainer);

    if (notice?.text) {
        const noticeContainer = createContainer()
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
        createContainer()
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
    await i.update({
        components: buildPersonalizeComponents(interaction, updatedMemory),
    });
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
    await i.update({
        components: buildPersonalizeComponents(interaction, updatedMemory),
    });
}

async function handleClear(i, userId, interaction) {
    await i.update({
        components: buildClearConfirmComponents(interaction),
    });
}

async function handleClose(i, collector, interaction) {
    if (collector && !collector.ended) {
        collector.stop('closed');
    }

    await i.deferUpdate().catch(() => { });
    await interaction.deleteReply().catch(() => { });
}

async function handleButtonClick(i, userId, interaction, collector) {
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

    if (i.customId === 'personalize_close') {
        return handleClose(i, collector, interaction);
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