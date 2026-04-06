const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const QuotaService = require('../../services/user/QuotaService');
const { COLORS } = require('../../utils/embedUtils');

const ROLE_BADGES = {
    owner: 'Owner',
    admin: 'Admin',
    pro: 'Pro',
    user: 'User'
};

const ROLE_COLORS = {
    owner: 0xFFD700,
    admin: 0xE74C3C,
    pro: COLORS.LUNABY,
    user: COLORS.LUNABY
};

function createProgressBar(current, max, length = 10) {
    if (max === -1) return '`' + '▰'.repeat(length) + '` ∞';
    const ratio = Math.min(current / max, 1);
    const filled = Math.round(ratio * length);
    const empty = length - filled;
    const percent = Math.round(ratio * 100);
    return '`' + '▰'.repeat(filled) + '▱'.repeat(empty) + '` ' + percent + '%';
}

function formatQuotaValue(current, max) {
    if (max === -1) return `**${current}** / ∞`;
    return `**${current}** / **${max}**`;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('quota')
        .setDescription('Kiểm tra số lượt sử dụng Lunaby Pro và Lunaby Vision còn lại của bạn'),
    prefix: { name: 'quota', aliases: ['limit', 'usage'], description: 'Kiểm tra lượt sử dụng Lunaby Pro và Lunaby Vision' },
    cooldown: 5,

    async execute(interaction) {
        const userId = interaction.user.id;
        const stats = await QuotaService.getUserMessageStats(userId);

        const embed = this.buildQuotaEmbed(interaction.user, stats, interaction);
        await interaction.reply({ embeds: [embed] });
    },

    buildQuotaEmbed(user, stats, interaction) {
        const roleBadge = ROLE_BADGES[stats.role] || ROLE_BADGES.user;
        const roleColor = ROLE_COLORS[stats.role] || ROLE_COLORS.user;

        const msgCurrent = stats.usage.current;
        const msgMax = stats.limits.period;
        const msgRemaining = stats.remaining.messages;

        const imgCurrent = stats.imageUsage.current;
        const imgMax = stats.limits.imagePeriod;
        const imgRemaining = stats.remaining.images;

        const resetTimestamp = Math.floor(stats.nextReset / 1000);
        const daysLeft = stats.remaining.days;

        // Màu sắc theo tình trạng sử dụng
        let embedColor = roleColor;
        if (msgMax !== -1) {
            const usageRatio = msgCurrent / msgMax;
            if (usageRatio >= 0.95) embedColor = 0xE74C3C;      // Đỏ - gần hết
            else if (usageRatio >= 0.75) embedColor = 0xE67E22;  // Cam - cảnh báo
        }

        const msgBar = createProgressBar(msgCurrent, msgMax);
        const imgBar = createProgressBar(imgCurrent, imgMax);

        const msgRemainingText = msgMax === -1 ? '∞' : interaction.t('commands.quota.remaining', { count: msgRemaining });
        const imgRemainingText = imgMax === -1 ? '∞' : interaction.t('commands.quota.remaining', { count: imgRemaining });

        const embed = new EmbedBuilder()
            .setColor(embedColor)
            .setAuthor({
                name: user.globalName || user.username,
                iconURL: user.displayAvatarURL({ size: 64 })
            })
            .setDescription(
                `### ${roleBadge}\n` +
                `**💬 Lunaby Pro**\n` +
                `${msgBar}\n` +
                `${formatQuotaValue(msgCurrent, msgMax)} · ${msgRemainingText}\n\n` +
                `**🎨 Lunaby Vision**\n` +
                `${imgBar}\n` +
                `${formatQuotaValue(imgCurrent, imgMax)} · ${imgRemainingText}\n` +
                `${interaction.t('commands.quota.total_usage')} **${stats.usage.total}** Lunaby Pro · **${stats.imageUsage.total}** Lunaby Vision\n` +
                `${interaction.t('commands.quota.reset_in', { days: daysLeft })} · <t:${resetTimestamp}:R>`
            )
            .setFooter({ text: 'Lunaby · Quota System' })
            .setTimestamp();

        return embed;
    }
};
