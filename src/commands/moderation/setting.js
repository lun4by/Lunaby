const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, ChannelSelectMenuBuilder, ChannelType, PermissionsBitField } = require('discord.js');
const MariaModDB = require('../../services/database/MariaModDB.js');
const emojis = require('../../config/emojis.js');
const logger = require('../../utils/logger');
const { COLORS } = require('../../utils/embedUtils');
const { getCachedGuildSettings } = require('../../utils/guildLocale.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setting')
        .setDescription('Bảng điều khiển máy chủ (Server Dashboard)')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild),
    prefix: { name: 'setting', aliases: ['settings', 'config', 'dashboard'], description: 'Quản lý máy chủ' },
    cooldown: 5,

    async execute(interaction) {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
            const replyOptions = { content: `${emojis.error} ${interaction.t('commands.setting.need_manage_server')}`, ephemeral: true };
            return interaction.replied || interaction.deferred ? interaction.editReply(replyOptions) : interaction.reply(replyOptions);
        }

        const isSlash = !!interaction.isCommand;
        if (isSlash && !interaction.deferred && !interaction.replied) {
            await interaction.deferReply({ ephemeral: true });
        }

        const guildId = interaction.guild?.id || interaction.guildId;
        let currentPage = 'general';

        try {
            const sentMessage = await renderPage(interaction, guildId, currentPage, false);

            // Lấy message để tạo collector
            let message;
            if (isSlash) {
                message = await interaction.fetchReply();
            } else {
                message = sentMessage;
            }

            if (!message) {
                logger.error('setting', 'Failed to fetch message for creating collector');
                return;
            }

            const collector = message.createMessageComponentCollector({
                filter: i => i.user.id === interaction.user.id,
                time: 600000 // 10 minutes
            });

            collector.on('collect', async (i) => {
                try {
                    if (!i.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
                        return i.reply({ content: `${emojis.error} ${i.t('commands.setting.need_manage_server')}`, ephemeral: true });
                    }

                    const { customId } = i;

                    if (customId === 'setting_page_select') {
                        currentPage = i.values[0];
                        if (currentPage === 'close') {
                            await i.update({ content: `${emojis.success} ${i.t('commands.setting.closed')}`, embeds: [], components: [] });
                            return collector.stop('closed');
                        }
                        await renderPage(i, guildId, currentPage, true);
                    }
                    else if (customId === 'setting_toggle_level') {
                        const profile = await getCachedGuildSettings(guildId);
                        const newStatus = !(profile?.settings?.levelUpNotifications ?? true);
                        await MariaModDB.updateGuildSettings(guildId, {
                            'settings.levelUpNotifications': newStatus
                        });
                        await renderPage(i, guildId, currentPage, true);
                    }
                    else if (customId === 'setting_toggle_embed') {
                        const profile = await getCachedGuildSettings(guildId);
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
                } catch (err) {
                    logger.error('setting', `Collector error: ${err.message}`);
                    try {
                        if (!i.replied && !i.deferred) {
                            await i.reply({ content: `${emojis.error} ${i.t('commands.setting.general_error')}`, ephemeral: true });
                        }
                    } catch (e) { /* bỏ qua */ }
                }
            });

            collector.on('end', async (_, reason) => {
                if (reason === 'closed') return;
                try {
                    if (isSlash) {
                        await interaction.editReply({ content: interaction.t('commands.setting.session_expired'), components: [], embeds: [] });
                    } else if (message.editable) {
                        await message.edit({ content: interaction.t('commands.setting.session_expired'), components: [], embeds: [] });
                    }
                } catch (e) {
                    logger.error('setting', `Error removing components on end: ${e.message}`);
                }
            });

        } catch (error) {
            logger.error('setting', `Execute error: ${error.message}`);
            try {
                if (isSlash) {
                    await interaction.editReply({ content: `${emojis.error} ${interaction.t('commands.setting.load_error')}`, embeds: [], components: [] });
                } else {
                    await interaction.reply({ content: `${emojis.error} ${interaction.t('commands.setting.load_error')}` });
                }
            } catch (e) { /* bỏ qua */ }
        }
    }
};

async function renderPage(interactionOrMessage, guildId, page, isUpdate) {
    const guildSettingsDB = await getCachedGuildSettings(guildId) || { settings: {} };
    const modSettingsDB = await MariaModDB.getSettings(guildId) || {};

    const levelUp = guildSettingsDB.settings?.levelUpNotifications ?? true;
    const useEmbeds = guildSettingsDB.settings?.useEmbeds ?? true;

    const logChannelId = modSettingsDB.logChannelId || null;
    const modActionLogs = modSettingsDB.modActionLogs !== false;
    const monitorLogs = modSettingsDB.monitorLogs !== false;

    const t = interactionOrMessage.t;

    const embed = new EmbedBuilder()
        .setTitle(t('commands.setting.embed_title'))
        .setColor(COLORS.LUNABY)
        .setTimestamp()
        .setFooter({ text: t('commands.setting.embed_footer') });

    const components = [];

    // Hàng 1: Bộ chọn trang
    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('setting_page_select')
        .setPlaceholder(t('commands.setting.menu_placeholder'))
        .addOptions([
            { label: t('commands.setting.menu_general'), description: t('commands.setting.menu_general_desc'), value: 'general', default: page === 'general' },
            { label: t('commands.setting.menu_logging'), description: t('commands.setting.menu_logging_desc'), value: 'logging', default: page === 'logging' },
            { label: t('commands.setting.menu_close'), description: t('commands.setting.menu_close_desc'), value: 'close', emoji: emojis.error }
        ]);
    components.push(new ActionRowBuilder().addComponents(selectMenu));

    if (page === 'general') {
        embed.setDescription(t('commands.setting.cat_general_desc'))
            .addFields(
                { name: t('commands.setting.field_levelup'), value: levelUp ? `${emojis.success} ${t('commands.setting.status_on')}` : `${emojis.error} ${t('commands.setting.status_off')}`, inline: true },
                { name: t('commands.setting.field_embed'), value: useEmbeds ? `${emojis.success} ${t('commands.setting.status_on')}` : `${emojis.error} ${t('commands.setting.status_off')}`, inline: true }
            );

        const btnRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('setting_toggle_level')
                .setLabel(levelUp ? t('commands.setting.btn_off_levelup') : t('commands.setting.btn_on_levelup'))
                .setStyle(levelUp ? ButtonStyle.Danger : ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId('setting_toggle_embed')
                .setLabel(useEmbeds ? t('commands.setting.btn_off_embed') : t('commands.setting.btn_on_embed'))
                .setStyle(useEmbeds ? ButtonStyle.Danger : ButtonStyle.Success)
        );
        components.push(btnRow);
    }
    else if (page === 'logging') {
        embed.setDescription(t('commands.setting.cat_logging_desc'))
            .addFields(
                { name: t('commands.setting.field_log_channel'), value: logChannelId ? `<#${logChannelId}>` : t('commands.setting.no_channel_set'), inline: false },
                { name: t('commands.setting.field_modlog'), value: modActionLogs ? `${emojis.success} ${t('commands.setting.short_on')}` : `${emojis.error} ${t('commands.setting.short_off')}`, inline: true },
                { name: t('commands.setting.field_monitor'), value: monitorLogs ? `${emojis.success} ${t('commands.setting.short_on')}` : `${emojis.error} ${t('commands.setting.short_off')}`, inline: true }
            );

        // Hàng 2: Menu chọn channel (chỉ hiển thị khi đã có channel log)
        const channelSelect = new ChannelSelectMenuBuilder()
            .setCustomId('setting_log_channel')
            .setPlaceholder(logChannelId ? t('commands.setting.channel_placeholder_change') : t('commands.setting.channel_placeholder_set'))
            .addChannelTypes(ChannelType.GuildText);

        components.push(new ActionRowBuilder().addComponents(channelSelect));

        // Hàng 3: Các button
        const logBtnRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('setting_toggle_modlog')
                .setLabel(modActionLogs ? t('commands.setting.btn_off_modlog') : t('commands.setting.btn_on_modlog'))
                .setStyle(modActionLogs ? ButtonStyle.Danger : ButtonStyle.Success)
                .setDisabled(!logChannelId),
            new ButtonBuilder()
                .setCustomId('setting_toggle_monitor')
                .setLabel(monitorLogs ? t('commands.setting.btn_off_monitor') : t('commands.setting.btn_on_monitor'))
                .setStyle(monitorLogs ? ButtonStyle.Danger : ButtonStyle.Success)
                .setDisabled(!logChannelId)
        );
        components.push(logBtnRow);
    }

    const isSlash = !!interactionOrMessage.isCommand;

    if (isUpdate) {
        await interactionOrMessage.update({ embeds: [embed], components, content: '' });
        return null;
    } else {
        if (isSlash) {
            await interactionOrMessage.editReply({ embeds: [embed], components, content: '' });
            return null; // Lệnh slash dùng interaction.fetchReply() bên ngoài
        } else {
            // Lệnh prefix: reply và trả về message để tạo collector
            const replyTarget = interactionOrMessage.message || interactionOrMessage;
            const sent = await replyTarget.reply({ embeds: [embed], components });
            return sent;
        }
    }
}
