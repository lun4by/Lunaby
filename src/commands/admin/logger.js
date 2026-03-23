const { SlashCommandBuilder } = require('discord.js');
const logger = require('../../utils/logger.js');

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
            return reply(interaction, 'Bạn không có quyền sử dụng lệnh này!');
        }

        const sub = interaction.options.getSubcommand();

        if (sub === 'status') {
            const config = logger.getConfig();
            const cats = Object.entries(config.categories).map(([k, v]) => `${k}: ${v ? '✅' : '❌'}`).join('\n');
            return reply(interaction,
                `**Trạng thái hệ thống ghi log:**\n` +
                `Trạng thái: ${config.enabled ? 'Đang bật' : 'Đã tắt'}\n` +
                `Mức độ: ${config.level.toUpperCase()}\n` +
                `Hiển thị thời gian: ${config.showTimestamp ? '✅' : '❌'}\n\n` +
                `**Danh mục:**\n${cats}`
            );
        }

        if (sub === 'enable') { logger.setEnabled(true); return reply(interaction, 'Đã bật hệ thống ghi log'); }
        if (sub === 'disable') { logger.setEnabled(false); return reply(interaction, 'Đã tắt hệ thống ghi log'); }

        if (sub === 'level') {
            const level = interaction.options.getString('level');
            logger.setLevel(level);
            return reply(interaction, `Đã đặt mức độ ghi log thành: ${level.toUpperCase()}`);
        }

        if (sub === 'category') {
            const category = interaction.options.getString('category');
            const enabled = interaction.options.getBoolean('enabled');
            logger.setCategoryEnabled(category, enabled);
            return reply(interaction, `Đã ${enabled ? 'bật' : 'tắt'} ghi log cho danh mục: ${category}`);
        }

        if (sub === 'reset') { logger.resetConfig(); return reply(interaction, 'Đã khôi phục cài đặt ghi log về mặc định'); }
    },
};