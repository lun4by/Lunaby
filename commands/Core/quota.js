const { SlashCommandBuilder } = require('discord.js');
const QuotaService = require('../../services/QuotaService');
const { createLunabyEmbed } = require('../../utils/embedUtils');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('quota')
        .setDescription('Kiểm tra số lượt trò chuyện với AI còn lại của bạn'),
    prefix: {
        name: 'quota',
        aliases: ['limit', 'usage'],
        description: 'Kiểm tra giới hạn sử dụng AI'
    },

    async execute(interaction) {
        if (!interaction.isCommand || !interaction.isCommand()) {
            return this.executePrefix(interaction.message || interaction, []);
        }

        const userId = interaction.user.id;
        const stats = await QuotaService.getUserMessageStats(userId);

        const embed = this.buildQuotaEmbed(interaction.user, stats);
        await interaction.reply({ embeds: [embed] });
    },

    async executePrefix(message, args) {
        const userId = message.author.id;
        const stats = await QuotaService.getUserMessageStats(userId);

        const embed = this.buildQuotaEmbed(message.author, stats);
        await message.reply({ embeds: [embed] });
    },

    buildQuotaEmbed(user, stats) {
        const remainingText = stats.limits.period === -1
            ? 'Vô hạn (Không giới hạn lượt)'
            : `${stats.remaining.messages} lượt`;

        const limitText = stats.limits.period === -1
            ? 'Vô hạn'
            : `${stats.limits.period} lượt`;

        const roleDisplay = stats.role.charAt(0).toUpperCase() + stats.role.slice(1);

        const embed = createLunabyEmbed()
            .setAuthor({ name: `Quota của ${user.tag}`, iconURL: user.displayAvatarURL() })
            .setTitle('📊 Thống kê sử dụng AI')
            .setDescription('Dưới đây là thông tin về số lượt trò chuyện với Lunaby AI của bạn.')
            .addFields(
                { name: '🔑 Cấp bậc', value: `\`${roleDisplay}\``, inline: true },
                { name: '🔄 Loại giới hạn', value: `30 Ngày`, inline: true },
                { name: '\u200B', value: '\u200B', inline: true },
                { name: '📈 Đã sử dụng', value: `**${stats.usage.current}** / ${limitText}`, inline: true },
                { name: '✅ Còn lại', value: `**${remainingText}**`, inline: true },
                { name: '\u200B', value: '\u200B', inline: true },
                { name: '🗓️ Trạng thái chu kỳ', value: `Đã dùng **${stats.usage.total}** lượt kể từ khi tạo tài khoản.\nChu kỳ sẽ làm mới vào: <t:${Math.floor(stats.nextReset / 1000)}:f> (<t:${Math.floor(stats.nextReset / 1000)}:R>)`, inline: false }
            );

        if (stats.limits.period !== -1 && stats.remaining.messages <= 10) {
            embed.setColor(0xE74C3C); // Red if running low
        }

        return embed;
    }
};
