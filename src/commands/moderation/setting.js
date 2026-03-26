const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    ChannelSelectMenuBuilder,
    ChannelType,
    PermissionsBitField,
} = require('discord.js');

const MariaModDB = require('../../services/database/MariaModDB');
const logger = require('../../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setting')
        .setDescription('Bảng điều khiển máy chủ (Server Dashboard)')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild),
    prefix: { name: 'setting', aliases: ['settings', 'config', 'dashboard'], description: 'Quản lý máy chủ' },
    cooldown: 5,

    async execute(interaction) {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
            const replyOptions = { content: '❌ Bạn cần quyền **Manage Server** để sử dụng lệnh này.', ephemeral: true };
            return interaction.replied || interaction.deferred ? interaction.editReply(replyOptions) : interaction.reply(replyOptions);
        }

        const isSlash = !!interaction.isCommand;
        if (isSlash && !interaction.deferred && !interaction.replied) {
            await interaction.deferReply({ ephemeral: true });
        }

        const guildId = interaction.guild?.id || interaction.guildId;
        let currentPage = 'general';

        try {
            await renderPage(interaction, guildId, currentPage, false);

            const replyObj = isSlash ? interaction : (interaction.message || interaction);
            const message = await replyObj.fetchReply();

            const collector = message.createMessageComponentCollector({
                filter: i => i.user.id === interaction.user.id,
                time: 600000 // 10 minutes
            });

            collector.on('collect', async (i) => {
                if (!i.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
                    return i.reply({ content: '❌ Bạn cần quyền **Manage Server**.', ephemeral: true });
                }

                const { customId } = i;

                if (customId === 'setting_page_select') {
                    currentPage = i.values[0];
                    if (currentPage === 'close') {
                        await i.update({ content: '✅ Đã đóng bảng điều khiển.', embeds: [], components: [] });
                        return collector.stop('closed');
                    }
                    await renderPage(i, guildId, currentPage, true);
                } 
                else if (customId === 'setting_toggle_level') {
                    const profile = await MariaModDB.getGuildSettings(guildId);
                    const newStatus = !(profile?.settings?.levelUpNotifications ?? true);
                    await MariaModDB.updateGuildSettings(guildId, {
                        'settings.levelUpNotifications': newStatus
                    });
                    await renderPage(i, guildId, currentPage, true);
                }
                else if (customId === 'setting_toggle_embed') {
                    const profile = await MariaModDB.getGuildSettings(guildId);
                    const newStatus = !(profile?.settings?.useEmbeds ?? true);
                    await MariaModDB.updateGuildSettings(guildId, {
                        'settings.useEmbeds': newStatus
                    });
                    await renderPage(i, guildId, currentPage, true);
                }
                else if (customId === 'setting_log_channel') {
                    const channelId = i.values[0];
                    const modSettings = await MariaModDB.getSettings(guildId) || {};
                    await MariaModDB.setSettings(guildId, {
                        logChannelId: channelId,
                        modActionLogs: modSettings.modActionLogs !== false,
                        monitorLogs: modSettings.monitorLogs !== false,
                        updatedBy: interaction.user.id
                    });
                    await renderPage(i, guildId, currentPage, true);
                }
                else if (customId === 'setting_toggle_modlog') {
                    const modSettings = await MariaModDB.getSettings(guildId) || {};
                    const newStatus = modSettings.modActionLogs === false;
                    await MariaModDB.setSettings(guildId, {
                        logChannelId: modSettings.logChannelId || null,
                        modActionLogs: newStatus,
                        monitorLogs: modSettings.monitorLogs !== false,
                        updatedBy: interaction.user.id
                    });
                    await renderPage(i, guildId, currentPage, true);
                }
                else if (customId === 'setting_toggle_monitor') {
                    const modSettings = await MariaModDB.getSettings(guildId) || {};
                    const newStatus = modSettings.monitorLogs === false;
                    await MariaModDB.setSettings(guildId, {
                        logChannelId: modSettings.logChannelId || null,
                        modActionLogs: modSettings.modActionLogs !== false,
                        monitorLogs: newStatus,
                        updatedBy: interaction.user.id
                    });
                    await renderPage(i, guildId, currentPage, true);
                }
            });

            collector.on('end', async (_, reason) => {
                if (reason === 'closed') return;
                try {
                    const editFunc = isSlash ? (data) => interaction.editReply(data) : (data) => replyObj.edit(data);
                    await editFunc({ content: '⏱️ Phiên thao tác đã hết hạn (10 phút).', components: [] });
                } catch (e) {
                    logger.error('SETTING', `Error removing components on end: ${e.message}`);
                }
            });

        } catch (error) {
            logger.error('SETTING', `Execute error: ${error.message}`);
            const editFunc = isSlash ? (data) => interaction.editReply(data) : (data) => replyObj.edit(data);
            await editFunc({ content: '❌ Không thể tải bảng cài đặt.', embeds: [], components: [] });
        }
    }
};

async function renderPage(interactionOrMessage, guildId, page, isUpdate) {
    const guildSettingsDB = await MariaModDB.getGuildSettings(guildId) || { settings: {} };
    const modSettingsDB = await MariaModDB.getSettings(guildId) || {};

    const levelUp = guildSettingsDB.settings?.levelUpNotifications ?? true;
    const useEmbeds = guildSettingsDB.settings?.useEmbeds ?? true;

    const logChannelId = modSettingsDB.logChannelId || null;
    const modActionLogs = modSettingsDB.modActionLogs !== false;
    const monitorLogs = modSettingsDB.monitorLogs !== false;

    const embed = new EmbedBuilder()
        .setTitle('⚙️ Bảng Điều Khiển Server (Dashboard)')
        .setColor(0x9B59B6)
        .setTimestamp()
        .setFooter({ text: `Tự động đóng sau 10 phút.` });

    const components = [];

    // Row 1: The Page Selector
    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('setting_page_select')
        .setPlaceholder('Chọn danh mục cấu hình...')
        .addOptions([
            { label: '⚙️ Cài đặt chung', description: 'Các tùy chọn về hiển thị, bot hoạt động', value: 'general', default: page === 'general' },
            { label: '🛡️ Cài đặt nhật ký (Logs)', description: 'Thiết lập Kênh ghi log và Kiểm duyệt', value: 'logging', default: page === 'logging' },
            { label: '✖️ Đóng', description: 'Thoát bảng điều khiển', value: 'close' }
        ]);
    components.push(new ActionRowBuilder().addComponents(selectMenu));

    if (page === 'general') {
        embed.setDescription('**⚙️ Danh mục: Cài đặt Chung**\nĐiều chỉnh cách bot tương tác và gửi thông báo trong máy chủ.')
             .addFields(
                 { name: '🔔 Thông báo Level-up', value: levelUp ? '✅ Đã Bật' : '❌ Đã Tắt', inline: true },
                 { name: '📋 Sử dụng Embed', value: useEmbeds ? '✅ Đã Bật' : '❌ Đã Tắt', inline: true }
             );

        const btnRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('setting_toggle_level')
                .setLabel(levelUp ? 'Tắt Level-up' : 'Bật Level-up')
                .setStyle(levelUp ? ButtonStyle.Danger : ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId('setting_toggle_embed')
                .setLabel(useEmbeds ? 'Tắt Embed' : 'Bật Embed')
                .setStyle(useEmbeds ? ButtonStyle.Danger : ButtonStyle.Success)
        );
        components.push(btnRow);
    } 
    else if (page === 'logging') {
        embed.setDescription('**🛡️ Danh mục: Nhật ký sự kiện (Logs)**\nCho phép bot ghi chép lại các lệnh cấm, đá, hoặc sự kiện quan trọng vào một kênh an toàn.')
             .addFields(
                 { name: '📝 Kênh báo cáo (Log Channel)', value: logChannelId ? `<#${logChannelId}>` : 'Chưa thiết lập (Vui lòng chọn ở Menu dưới)', inline: false },
                 { name: '🔨 Báo cáo Kiểm duyệt (Ban/Kick/Mute)', value: modActionLogs ? '✅ Bật' : '❌ Tắt', inline: true },
                 { name: '📡 Báo cáo Mở rộng (Sự kiện phụ)', value: monitorLogs ? '✅ Bật' : '❌ Tắt', inline: true }
             );

        // Row 2: Channel Select Menu
        const channelSelect = new ChannelSelectMenuBuilder()
            .setCustomId('setting_log_channel')
            .setPlaceholder(logChannelId ? 'Thay đổi kênh lưu Log...' : 'Thiết lập kênh lưu Log...')
            .addChannelTypes(ChannelType.GuildText);
        
        components.push(new ActionRowBuilder().addComponents(channelSelect));

        // Row 3: Buttons
        const logBtnRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('setting_toggle_modlog')
                .setLabel(modActionLogs ? 'Tắt Báo cáo Kiểm duyệt' : 'Bật Báo cáo Kiểm duyệt')
                .setStyle(modActionLogs ? ButtonStyle.Danger : ButtonStyle.Success)
                .setDisabled(!logChannelId),
            new ButtonBuilder()
                .setCustomId('setting_toggle_monitor')
                .setLabel(monitorLogs ? 'Tắt Báo cáo Mở rộng' : 'Bật Báo cáo Mở rộng')
                .setStyle(monitorLogs ? ButtonStyle.Danger : ButtonStyle.Success)
                .setDisabled(!logChannelId)
        );
        components.push(logBtnRow);
    }

    const isSlash = !!interactionOrMessage.isCommand;

    if (isUpdate) {
        await interactionOrMessage.update({ embeds: [embed], components, content: '' });
    } else {
        const editFunc = isSlash ? (data) => interactionOrMessage.editReply(data) : (data) => interactionOrMessage.message ? interactionOrMessage.message.reply(data) : interactionOrMessage.reply(data);
        
        // Cần đảm bảo rằng khi dùng lệnh Text (không phải isUpdate) ta có thể update
        if (!isSlash && interactionOrMessage.deferred === undefined) {
            await interactionOrMessage.reply({ embeds: [embed], components });
        } else {
            await interactionOrMessage.editReply({ embeds: [embed], components, content: '' });
        }
    }
}