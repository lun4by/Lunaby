const { SlashCommandBuilder } = require('discord.js');
const QuotaService = require('../../services/user/QuotaService');
const emojis = require('../../config/emojis');
const { COLORS } = require('../../utils/discord/embedUtils');

const { createEmbed } = require('../../utils/discord/builderFactory');
const UNLIMITED = -1;

const ROLE_META = {
    owner: { label: 'Owner', color: 0xF1C40F },
    admin: { label: 'Admin', color: 0xE74C3C },
    pro: { label: 'Pro', color: COLORS.LUNABY },
    user: { label: 'User', color: COLORS.LUNABY },
};

function formatQuotaValue(current, max) {
    if (max === UNLIMITED) {
        return `**${current}** / ∞`;
    }

    return `**${current}** / **${max}**`;
}

function getProgressText(current, max) {
    if (max === UNLIMITED) {
        return '∞';
    }

    const ratio = Math.min(Math.max(current / Math.max(max, 1), 0), 1);
    return `${Math.round(ratio * 100)}%`;
}

function getUsageRatio(current, max) {
    if (max === UNLIMITED) {
        return 0;
    }

    return Math.min(Math.max(current / Math.max(max, 1), 0), 1);
}

function resolveEmbedColor(baseColor, messageRatio, imageRatio) {
    const maxRatio = Math.max(messageRatio, imageRatio);

    if (maxRatio >= 0.95) {
        return 0xE74C3C;
    }

    if (maxRatio >= 0.75) {
        return 0xE67E22;
    }

    return baseColor;
}

function formatRemaining(interaction, remaining) {
    if (remaining === UNLIMITED) {
        return '∞';
    }

    return interaction.t('commands.quota.remaining', { count: remaining });
}

function buildUsageField(icon, title, current, max, remaining, interaction) {
    const progress = getProgressText(current, max);
    const quota = formatQuotaValue(current, max);
    const remainingText = formatRemaining(interaction, remaining);

    return {
        name: `${icon} ${title}`,
        value: `> - Đã dùng: ${quota} (${progress})
                > - Còn lại: ${remainingText}`.trim(),
        inline: true,
    };
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
        const roleMeta = ROLE_META[stats.role] || ROLE_META.user;

        const msgCurrent = stats.usage.current;
        const msgMax = stats.limits.period;
        const msgRemaining = stats.remaining.messages;

        const imgCurrent = stats.imageUsage.current;
        const imgMax = stats.limits.imagePeriod;
        const imgRemaining = stats.remaining.images;

        const resetTimestamp = Math.floor(stats.nextReset / 1000);
        const daysLeft = stats.remaining.days;

        const messageRatio = getUsageRatio(msgCurrent, msgMax);
        const imageRatio = getUsageRatio(imgCurrent, imgMax);
        const embedColor = resolveEmbedColor(roleMeta.color, messageRatio, imageRatio);

        const embed = createEmbed()
            .setColor(embedColor)
            .setTitle('Quota Dashboard')
            .setAuthor({
                name: user.globalName || user.username,
                iconURL: user.displayAvatarURL({ size: 64 })
            })
            .setDescription(
                `Gói hiện tại: **${roleMeta.label}**\n` +
                `Reset: <t:${resetTimestamp}:R> (${interaction.t('commands.quota.reset_in', { days: daysLeft })})`
            )
            .addFields(
                buildUsageField(emojis.quota.pro, 'Lunaby Pro', msgCurrent, msgMax, msgRemaining, interaction),
                buildUsageField(emojis.quota.vision, 'Lunaby Vision', imgCurrent, imgMax, imgRemaining, interaction),
                {
                    name: 'Tổng quan',
                    value:
                        `> - ${interaction.t('commands.quota.total_usage')} **${stats.usage.total}** Lunaby Pro · **${stats.imageUsage.total}** Lunaby Vision\n` +
                        `> - ${interaction.t('commands.quota.current_cycle')} **${stats.usage.current}** Pro · **${stats.imageUsage.current}** Vision`,
                    inline: false,
                },
            )
            .setFooter({ text: 'Lunaby Quota' })
            .setTimestamp();

        return embed;
    }
};