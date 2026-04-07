const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const logger = require('../../utils/logger');
const fs = require('fs');
const emojis = require('../../config/emojis.js');

const OWNER_ID = process.env.OWNER_ID;

const reply = (interaction, content) => interaction.reply({ content, ephemeral: true });

module.exports = {
    data: new SlashCommandBuilder()
        .setName('logger')
        .setDescription('Quản lý cài đặt hệ thống ghi log (chỉ dành cho owner)')
        .addSubcommand(sub => sub.setName('status').setDescription('Xem trạng thái hiện tại của hệ thống ghi log'))
        .addSubcommand(sub => sub.setName('enable').setDescription('Bật hệ thống ghi log'))
        .addSubcommand(sub => sub.setName('disable').setDescription('Tắt hệ thống ghi log'))
        .addSubcommand(sub => sub.setName('level').setDescription('Đặt mức độ ghi log')
            .addStringOption(opt => opt.setName('level').setDescription('Mức độ ghi log').setRequired(true)
                .addChoices(
                    { name: 'Debug - Chi tiết nhất', value: 'debug' },
                    { name: 'Info - Thông tin chung', value: 'info' },
                    { name: 'Warning - Cảnh báo', value: 'warn' },
                    { name: 'Error - Lỗi', value: 'error' }
                )))
        .addSubcommand(sub => sub.setName('category').setDescription('Bật/tắt ghi log cho một danh mục')
            .addStringOption(opt => opt.setName('category').setDescription('Danh mục ghi log').setRequired(true)
                .addChoices(
                    { name: 'MONITOR - Giám sát tin nhắn', value: 'MONITOR' },
                    { name: 'NEURAL - AI/NeuralNetworks', value: 'NEURAL' },
                    { name: 'COMMAND - Xử lý lệnh', value: 'COMMAND' },
                    { name: 'DATABASE - Cơ sở dữ liệu', value: 'DATABASE' },
                    { name: 'SYSTEM - Hệ thống', value: 'SYSTEM' },
                    { name: 'CHAT - Trò chuyện', value: 'CHAT' },
                    { name: 'API - Gọi API', value: 'API' }
                ))
            .addBooleanOption(opt => opt.setName('enabled').setDescription('Bật/tắt').setRequired(true)))
        .addSubcommand(sub => sub.setName('reset').setDescription('Khôi phục cài đặt ghi log về mặc định')),
    prefix: { name: 'logger', aliases: ['log'], description: 'Quản lý cài đặt hệ thống ghi log' },
    cooldown: 5,

    async execute(interaction) {
        if (interaction.user.id !== OWNER_ID) {
            return reply(interaction, interaction.t('commands.admin.logger.owner_only'));
        }

        const sub = interaction.options.getSubcommand();

        if (sub === 'status') {
            const config = logger.getConfig();
            const cats = Object.entries(config.categories).map(([k, v]) => `${k}: ${v ? emojis.success : emojis.error}`).join('\n');
            const statusText = config.enabled ? interaction.t('commands.admin.logger.enabled_status') : interaction.t('commands.admin.logger.disabled_status');
            const timeText = config.showTimestamp ? emojis.success : emojis.error;

            return reply(interaction, interaction.t('commands.admin.logger.status_title', {
                status: statusText,
                level: config.level.toUpperCase(),
                time: timeText,
                categories: cats
            }));
        }

        if (sub === 'enable') { logger.setEnabled(true); return reply(interaction, interaction.t('commands.admin.logger.enabled')); }
        if (sub === 'disable') { logger.setEnabled(false); return reply(interaction, interaction.t('commands.admin.logger.disabled')); }

        if (sub === 'level') {
            const level = interaction.options.getString('level');
            logger.setLevel(level);
            return reply(interaction, interaction.t('commands.admin.logger.set_level', { level: level.toUpperCase() }));
        }

        if (sub === 'category') {
            const category = interaction.options.getString('category');
            const enabled = interaction.options.getBoolean('enabled');
            logger.setCategoryEnabled(category, enabled);
            const msg = enabled ? interaction.t('commands.admin.logger.set_category_on', { category }) : interaction.t('commands.admin.logger.set_category_off', { category });
            return reply(interaction, msg);
        }

        if (sub === 'reset') { logger.resetConfig(); return reply(interaction, interaction.t('commands.admin.logger.reset')); }
    },
};