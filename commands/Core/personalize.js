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
const MemoryService = require('../../services/MemoryService.js');
const logger = require('../../utils/logger.js');

const MENU_OPTIONS = [
    { value: 'occupation', label: 'Your occupation', description: 'Nhập nghề nghiệp của bạn', emoji: '✏️' },
    { value: 'instructions', label: 'Custom instructions', description: 'Tùy chỉnh cách Lunaby phản hồi bạn', emoji: '📝' },
    { value: 'toggle_search', label: 'Reference search history', description: 'Bật/tắt tham chiếu lịch sử tìm kiếm', emoji: '🔍' },
    { value: 'toggle_memory', label: 'Reference saved memories', description: 'Bật/tắt lưu trữ và sử dụng trí nhớ', emoji: '🧠' },
    { value: 'manage', label: 'Manage your saved memories', description: 'Xem trí nhớ Lunaby đã lưu về bạn', emoji: '📋' },
    { value: 'clear', label: 'Clear', description: 'Xóa toàn bộ lịch sử và trí nhớ', emoji: '🗑️' },
];

module.exports = {
    data: new SlashCommandBuilder()
        .setName('personalize')
        .setDescription('Tùy chỉnh trải nghiệm AI của bạn'),
    prefix: { name: 'personalize', aliases: ['ps', 'canhan'], description: 'Tùy chỉnh AI' },

    async execute(interaction) {
        const userId = interaction.guildId
            ? `${interaction.guildId}-${interaction.user.id}`
            : `DM-${interaction.user.id}`;

        const memory = await MemoryService.getUserMemory(userId);

        const mainEmbed = buildMainEmbed(memory);
        const row = buildSelectMenuRow();

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
                    content: '❌ Chỉ người dùng gọi lệnh mới có thể sử dụng menu này!',
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
                logger.error('PERSONALIZE', 'Error handling interaction:', error);
                const errMsg = 'Đã xảy ra lỗi. Vui lòng thử lại.';
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
                        .setPlaceholder('Menu đã hết hạn')
                        .setDisabled(true)
                        .addOptions(new StringSelectMenuOptionBuilder().setLabel('Hết hạn').setValue('expired'))
                );
                await interaction.editReply({ components: [disabledRow] });
            } catch { }
        });
    },
};

function buildMainEmbed(memory) {
    const occupation = memory?.personalInfo?.occupation || '_Chưa thiết lập_';
    const instructions = memory?.personalInfo?.customInstructions || '_Chưa thiết lập_';
    const searchHistory = memory?.privacy?.allowSearchHistoryReference !== false;
    const savedMemory = memory?.privacy?.allowMemoryStorage !== false;

    return new EmbedBuilder()
        .setColor(0x9B59B6)
        .setTitle('⚙️ Personalization')
        .setDescription('Tùy chỉnh cách Lunaby tương tác với bạn.\nChọn một mục từ menu bên dưới.')
        .addFields(
            { name: '✏️ Your occupation', value: occupation, inline: true },
            { name: '📝 Custom instructions', value: instructions.length > 80 ? instructions.substring(0, 80) + '...' : instructions, inline: true },
            { name: '\u200B', value: '\u200B' },
            { name: '🔍 Reference search history', value: searchHistory ? '`🟢 Bật`' : '`🔴 Tắt`', inline: true },
            { name: '🧠 Reference saved memories', value: savedMemory ? '`🟢 Bật`' : '`🔴 Tắt`', inline: true },
        )
        .setTimestamp();
}

function buildSelectMenuRow() {
    const select = new StringSelectMenuBuilder()
        .setCustomId('personalize-select')
        .setPlaceholder('Chọn một tùy chọn');

    for (const opt of MENU_OPTIONS) {
        select.addOptions(
            new StringSelectMenuOptionBuilder()
                .setLabel(opt.label)
                .setDescription(opt.description)
                .setValue(opt.value)
                .setEmoji(opt.emoji)
        );
    }

    return new ActionRowBuilder().addComponents(select);
}

async function handleMenuSelection(i, userId, interaction) {
    const selected = i.values[0];

    switch (selected) {
        case 'occupation':
            return showOccupationModal(i, userId);
        case 'instructions':
            return showInstructionsModal(i, userId);
        case 'toggle_search':
            return handleToggleSearch(i, userId, interaction);
        case 'toggle_memory':
            return handleToggleMemory(i, userId, interaction);
        case 'manage':
            return handleManageMemories(i, userId);
        case 'clear':
            return handleClear(i, userId, interaction);
    }
}

async function showOccupationModal(i, userId) {
    const memory = await MemoryService.getUserMemory(userId);
    const currentOccupation = memory?.personalInfo?.occupation || '';

    const modal = new ModalBuilder()
        .setCustomId(`personalize_occupation_${userId}`)
        .setTitle('Your occupation');

    const input = new TextInputBuilder()
        .setCustomId('occupation_input')
        .setLabel('Nghề nghiệp')
        .setPlaceholder('Engineer, student, designer...')
        .setStyle(TextInputStyle.Short)
        .setMaxLength(100)
        .setRequired(false);

    if (currentOccupation) input.setValue(currentOccupation);

    modal.addComponents(new ActionRowBuilder().addComponents(input));
    await i.showModal(modal);

    try {
        const modalInteraction = await i.awaitModalSubmit({
            filter: (mi) => mi.customId === `personalize_occupation_${userId}` && mi.user.id === i.user.id,
            time: 120000,
        });

        const value = modalInteraction.fields.getTextInputValue('occupation_input').trim();

        if (value) {
            await MemoryService.updateUserMemory(userId, { 'personalInfo.occupation': value });
        } else {
            await MemoryService.updateUserMemory(userId, { 'personalInfo.occupation': null });
        }

        const updatedMemory = await MemoryService.getUserMemory(userId);
        await modalInteraction.update({
            embeds: [buildMainEmbed(updatedMemory)],
            components: [buildSelectMenuRow()],
        });
    } catch { }
}

async function showInstructionsModal(i, userId) {
    const memory = await MemoryService.getUserMemory(userId);
    const currentInstructions = memory?.personalInfo?.customInstructions || '';

    const modal = new ModalBuilder()
        .setCustomId(`personalize_instructions_${userId}`)
        .setTitle('Custom instructions');

    const input = new TextInputBuilder()
        .setCustomId('instructions_input')
        .setLabel('Hướng dẫn tùy chỉnh')
        .setPlaceholder('Sở thích, phong cách trả lời mong muốn...')
        .setStyle(TextInputStyle.Paragraph)
        .setMaxLength(500)
        .setRequired(false);

    if (currentInstructions) input.setValue(currentInstructions);

    modal.addComponents(new ActionRowBuilder().addComponents(input));
    await i.showModal(modal);

    try {
        const modalInteraction = await i.awaitModalSubmit({
            filter: (mi) => mi.customId === `personalize_instructions_${userId}` && mi.user.id === i.user.id,
            time: 120000,
        });

        const value = modalInteraction.fields.getTextInputValue('instructions_input').trim();

        if (value) {
            await MemoryService.updateUserMemory(userId, { 'personalInfo.customInstructions': value });
        } else {
            await MemoryService.updateUserMemory(userId, { 'personalInfo.customInstructions': null });
        }

        const updatedMemory = await MemoryService.getUserMemory(userId);
        await modalInteraction.update({
            embeds: [buildMainEmbed(updatedMemory)],
            components: [buildSelectMenuRow()],
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
        ? '🟢 **Đã bật** Reference search history\nLunaby sẽ sử dụng lịch sử cuộc hội thoại khi trả lời bạn.'
        : '🔴 **Đã tắt** Reference search history\nLunaby sẽ không tham chiếu lịch sử cuộc hội thoại.';

    const embed = new EmbedBuilder()
        .setColor(newValue ? 0x2ECC71 : 0xE74C3C)
        .setDescription(statusText)
        .setTimestamp();

    await i.update({
        embeds: [buildMainEmbed(updatedMemory), embed],
        components: [buildSelectMenuRow()],
    });

    autoRemoveNotification(i, updatedMemory);
}

async function handleToggleMemory(i, userId, interaction) {
    const memory = await MemoryService.getUserMemory(userId);
    const current = memory?.privacy?.allowMemoryStorage !== false;
    const newValue = !current;

    await MemoryService.updatePrivacySettings(userId, { allowMemoryStorage: newValue });

    const updatedMemory = await MemoryService.getUserMemory(userId);
    const statusText = newValue
        ? '🟢 **Đã bật** Reference saved memories\nLunaby sẽ lưu trữ và sử dụng trí nhớ về bạn.'
        : '🔴 **Đã tắt** Reference saved memories\nLunaby sẽ không lưu trữ trí nhớ về cuộc trò chuyện.';

    const embed = new EmbedBuilder()
        .setColor(newValue ? 0x2ECC71 : 0xE74C3C)
        .setDescription(statusText)
        .setTimestamp();

    await i.update({
        embeds: [buildMainEmbed(updatedMemory), embed],
        components: [buildSelectMenuRow()],
    });

    autoRemoveNotification(i, updatedMemory);
}

async function handleManageMemories(i, userId) {
    const summary = await MemoryService.getMemorySummary(userId);

    if (!summary) {
        return i.update({
            embeds: [buildMainEmbed(await MemoryService.getUserMemory(userId)),
            new EmbedBuilder().setColor(0xE74C3C).setDescription('Không thể lấy thông tin trí nhớ.')],
            components: [buildSelectMenuRow()],
        });
    }

    const embed = new EmbedBuilder()
        .setColor(0x3498DB)
        .setTitle('📋 Trí nhớ đã lưu')
        .setTimestamp();

    const personalInfo = [];
    if (summary.personalInfo.name) personalInfo.push(`**Tên:** ${summary.personalInfo.name}`);
    if (summary.personalInfo.nickname) personalInfo.push(`**Nickname:** ${summary.personalInfo.nickname}`);
    if (summary.personalInfo.age) personalInfo.push(`**Tuổi:** ${summary.personalInfo.age}`);
    if (summary.personalInfo.location) personalInfo.push(`**Vị trí:** ${summary.personalInfo.location}`);
    if (summary.personalInfo.occupation) personalInfo.push(`**Nghề nghiệp:** ${summary.personalInfo.occupation}`);

    if (personalInfo.length > 0) {
        embed.addFields({ name: '👤 Thông tin cá nhân', value: personalInfo.join('\n'), inline: false });
    }

    const preferences = [];
    if (summary.preferences.likes.length > 0) preferences.push(`**Thích:** ${summary.preferences.likes.slice(0, 5).join(', ')}`);
    if (summary.preferences.hobbies.length > 0) preferences.push(`**Sở thích:** ${summary.preferences.hobbies.slice(0, 5).join(', ')}`);
    if (summary.preferences.topics.length > 0) preferences.push(`**Chủ đề:** ${summary.preferences.topics.slice(0, 5).join(', ')}`);

    if (preferences.length > 0) {
        embed.addFields({ name: '❤️ Sở thích', value: preferences.join('\n'), inline: false });
    }

    if (summary.importantMemories.length > 0) {
        const memoryList = summary.importantMemories
            .slice(0, 5)
            .map((mem, idx) => `${idx + 1}. ${mem.content} (⭐ ${mem.importance}/10)`)
            .join('\n');
        embed.addFields({ name: '💭 Trí nhớ quan trọng', value: memoryList, inline: false });
    }

    embed.addFields({
        name: '📊 Thống kê',
        value: [
            `**Tổng trí nhớ:** ${summary.totalMemories}`,
            `**Tổng tin nhắn:** ${summary.interactionStats.totalMessages}`,
            `**Lần đầu:** <t:${Math.floor(new Date(summary.interactionStats.firstInteraction).getTime() / 1000)}:R>`,
        ].join('\n'),
        inline: false,
    });

    if (summary.totalMemories === 0 && personalInfo.length === 0 && preferences.length === 0) {
        embed.setDescription('Chưa có trí nhớ nào được lưu. Hãy bắt đầu trò chuyện với Lunaby!');
    }

    await i.update({
        embeds: [buildMainEmbed(await MemoryService.getUserMemory(userId)), embed],
        components: [buildSelectMenuRow()],
    });
}

async function handleClear(i, userId, interaction) {
    const confirmEmbed = new EmbedBuilder()
        .setColor(0xE74C3C)
        .setTitle('⚠️ Xác nhận xóa dữ liệu')
        .setDescription('Bạn có chắc chắn muốn xóa **toàn bộ** lịch sử trò chuyện và trí nhớ?\n\n**Hành động này không thể hoàn tác!**')
        .setTimestamp();

    const buttonRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('personalize_clear_confirm')
            .setLabel('Xóa toàn bộ')
            .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
            .setCustomId('personalize_clear_cancel')
            .setLabel('Hủy')
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
            await MemoryService.clearUserMemories(userId);

            const storageDB = require('../../services/storagedb.js');
            const prompts = require('../../config/prompts.js');
            const { DEFAULT_MODEL } = require('../../config/constants.js');
            await storageDB.clearConversationHistory(interaction.user.id, prompts.system.main, DEFAULT_MODEL);

            const successEmbed = new EmbedBuilder()
                .setColor(0x2ECC71)
                .setTitle('Đã xóa dữ liệu')
                .setDescription('Toàn bộ lịch sử trò chuyện và trí nhớ đã được xóa.\nChúng ta có thể bắt đầu lại từ đầu! 💫')
                .setTimestamp();

            const updatedMemory = await MemoryService.getUserMemory(userId);
            await i.update({
                embeds: [buildMainEmbed(updatedMemory), successEmbed],
                components: [buildSelectMenuRow()],
            });

            autoRemoveNotification(i, updatedMemory);

            logger.info('PERSONALIZE', `User ${interaction.user.tag} cleared all data`);
        } catch (error) {
            logger.error('PERSONALIZE', 'Error clearing data:', error);
            await i.update({
                embeds: [new EmbedBuilder().setColor(0xE74C3C).setDescription('Không thể xóa dữ liệu. Vui lòng thử lại sau.')],
                components: [buildSelectMenuRow()],
            });
        }
    } else if (i.customId === 'personalize_clear_cancel') {
        const updatedMemory = await MemoryService.getUserMemory(userId);
        await i.update({
            embeds: [buildMainEmbed(updatedMemory)],
            components: [buildSelectMenuRow()],
        });
    }
}

function autoRemoveNotification(i, memory) {
    setTimeout(async () => {
        try {
            await i.editReply({
                embeds: [buildMainEmbed(memory)],
                components: [buildSelectMenuRow()],
            });
        } catch { }
    }, 5000);
}
