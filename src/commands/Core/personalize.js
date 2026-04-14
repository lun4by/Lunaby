const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
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

function truncateText(text, maxLength = 120) {
    if (!text) return text;
    return text.length > maxLength ? `${text.substring(0, maxLength - 3)}...` : text;
}

function formatProfileValue(value, fallback) {
    if (!value || value === fallback) {
        return `*${fallback}*`;
    }

    return truncateText(value, 120);
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

        const mainEmbed = buildMainEmbed(memory, interaction);
        const rows = buildActionButtonRows(interaction, memory);

        await interaction.reply({
            embeds: [mainEmbed],
            components: rows,
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
                await interaction.editReply({ components: buildActionButtonRows(interaction, latestMemory, true) });
            } catch { }
        });
    },
};

function buildMainEmbed(memory, interaction) {
    const baseDescription = interaction
        .t('commands.personalize.embed_desc')
        .replace('menu bên dưới', 'các nút bên dưới');
    const notSetText = interaction.t('commands.personalize.not_set');
    const occupation = memory?.personalInfo?.occupation || notSetText;
    const instructions = memory?.personalInfo?.customInstructions || notSetText;
    const searchHistory = isPrivacyEnabled(memory?.privacy?.allowSearchHistoryReference);
    const savedMemory = isPrivacyEnabled(memory?.privacy?.allowMemoryStorage);

    const occupationValue = formatProfileValue(occupation, notSetText);
    const instructionsValue = formatProfileValue(instructions, notSetText);
    const searchStatus = searchHistory
        ? `${emojis.statusOn} ${interaction.t('commands.personalize.status_on')}`
        : `${emojis.statusOff} ${interaction.t('commands.personalize.status_off')}`;
    const memoryStatus = savedMemory
        ? `${emojis.statusOn} ${interaction.t('commands.personalize.status_on')}`
        : `${emojis.statusOff} ${interaction.t('commands.personalize.status_off')}`;

    return new EmbedBuilder()
        .setColor(COLORS.LUNABY)
        .setTitle(interaction.t('commands.personalize.embed_title'))
        .setDescription([
            baseDescription,
            '',
            `${emojis.personalize.info} Cập nhật hồ sơ cá nhân để Lunaby trả lời phù hợp hơn.`,
            `${emojis.personalize.memory} Dùng các nút bên dưới để bật/tắt từng chế độ ngay lập tức.`
        ].join('\n'))
        .addFields(
            {
                name: `${emojis.personalize.info} ${interaction.t('commands.personalize.field_occupation')}`,
                value: occupationValue,
                inline: true,
            },
            {
                name: `${emojis.personalize.manage} ${interaction.t('commands.personalize.field_instructions')}`,
                value: instructionsValue,
                inline: true,
            },
            { name: '\u200B', value: '\u200B' },
            {
                name: `${emojis.personalize.search} ${interaction.t('commands.personalize.field_search')}`,
                value: searchStatus,
                inline: true,
            },
            {
                name: `${emojis.personalize.memory} ${interaction.t('commands.personalize.field_memory')}`,
                value: memoryStatus,
                inline: true,
            },
        )
        .setThumbnail(interaction.user.displayAvatarURL({ size: 128 }))
        .setFooter({ text: `@${interaction.user.username}` })
        .setTimestamp();
}

function buildActionButtonRows(interaction, memory = null, disabled = false) {
    const searchEnabled = isPrivacyEnabled(memory?.privacy?.allowSearchHistoryReference);
    const memoryEnabled = isPrivacyEnabled(memory?.privacy?.allowMemoryStorage);
    const row = new ActionRowBuilder().addComponents(
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
            .setEmoji(emojis.personalize.clear)
            .setStyle(ButtonStyle.Danger)
            .setDisabled(disabled)
    );

    return [row];
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
            components: buildActionButtonRows(interaction, updatedMemory),
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
            embeds: [
                buildMainEmbed(latestMemory, interaction),
                new EmbedBuilder().setColor(0xE74C3C).setDescription(interaction.t('commands.personalize.error_occurred')).setTimestamp(),
            ],
            components: buildActionButtonRows(interaction, latestMemory),
        });
    }

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
        components: buildActionButtonRows(interaction, updatedMemory),
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
            embeds: [
                buildMainEmbed(latestMemory, interaction),
                new EmbedBuilder().setColor(0xE74C3C).setDescription(interaction.t('commands.personalize.error_occurred')).setTimestamp(),
            ],
            components: buildActionButtonRows(interaction, latestMemory),
        });
    }

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
        components: buildActionButtonRows(interaction, updatedMemory),
    });

    autoRemoveNotification(i, updatedMemory, interaction);
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

            const successEmbed = new EmbedBuilder()
                .setColor(0x2ECC71)
                .setTitle(interaction.t('commands.personalize.clear_success_title'))
                .setDescription(interaction.t('commands.personalize.clear_success_desc'))
                .setTimestamp();

            const updatedMemory = await MemoryService.getUserMemory(userId);
            await i.update({
                embeds: [buildMainEmbed(updatedMemory, interaction), successEmbed],
                components: buildActionButtonRows(interaction, updatedMemory),
            });

            autoRemoveNotification(i, updatedMemory, interaction);

            logger.info('personalize', `User ${interaction.user.tag} cleared all data`);
        } catch (error) {
            logger.error('personalize', 'Error clearing data:', error);
            const latestMemory = await MemoryService.getUserMemory(userId);
            await i.update({
                embeds: [new EmbedBuilder().setColor(0xE74C3C).setDescription(interaction.t('commands.personalize.clear_error'))],
                components: buildActionButtonRows(interaction, latestMemory),
            });
        }
    } else if (i.customId === 'personalize_clear_cancel') {
        const updatedMemory = await MemoryService.getUserMemory(userId);
        await i.update({
            embeds: [buildMainEmbed(updatedMemory, interaction)],
            components: buildActionButtonRows(interaction, updatedMemory),
        });
    }
}

function autoRemoveNotification(i, memory, interaction) {
    setTimeout(async () => {
        try {
            await i.editReply({
                embeds: [buildMainEmbed(memory, interaction)],
                components: buildActionButtonRows(interaction, memory),
            });
        } catch { }
    }, 5000);
}