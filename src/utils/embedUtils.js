const { EmbedBuilder } = require('discord.js');

const COLORS = {
    MAL: 0x2e51a2,
    ERROR: 0xED4245,
    SUCCESS: 0x57F287,
    WARNING: 0xFEE75C,
    INFO: 0x5865F2,
    LUNABY: 0x7289da,
};

const STATUS_MAPS = {
    anime: {
        finished_airing: "Đã hoàn thành",
        currently_airing: "Đang phát sóng",
        not_yet_aired: "Chưa phát sóng",
    },
    manga: {
        finished: "Đã hoàn thành",
        currently_publishing: "Đang xuất bản",
        not_yet_published: "Chưa xuất bản",
    },
    season: { winter: "Đông", spring: "Xuân", summer: "Hạ", fall: "Thu" },
};

function formatStatus(type, status) {
    return STATUS_MAPS[type]?.[status] || "N/A";
}

function truncateText(text, maxLength = 500) {
    if (!text) return "";
    return text.length > maxLength ? text.substring(0, maxLength) + "..." : text;
}

function formatList(items, key = "name", limit = null) {
    if (!items?.length) return "N/A";
    const list = limit ? items.slice(0, limit) : items;
    return list.map(item => item[key] || item).join(", ");
}

function createBaseEmbed(title, color, description = null) {
    const embed = { color, title, timestamp: new Date() };
    if (description) embed.description = description;
    return embed;
}

function createMALEmbed(title, description = null) {
    return { ...createBaseEmbed(title, COLORS.MAL, description), footer: { text: "Powered by MyAnimeList API" } };
}

function createLunabyEmbed() {
    return new EmbedBuilder()
        .setColor(COLORS.LUNABY)
        .setTimestamp();
}

function createErrorEmbed(title, description) {
    const embed = new EmbedBuilder()
        .setColor(COLORS.ERROR)
        .setTitle(`${title}`);
    if (description) embed.setDescription(description);
    return embed;
}

function createSuccessEmbed(title, description = null) {
    const embed = new EmbedBuilder()
        .setColor(COLORS.SUCCESS)
        .setTitle(`${title}`);
    if (description) embed.setDescription(description);
    return embed;
}

function createInfoEmbed(title, description = null) {
    const embed = new EmbedBuilder()
        .setColor(COLORS.INFO)
        .setTitle(`${title}`);
    if (description) embed.setDescription(description);
    return embed;
}

module.exports = {
    COLORS,
    STATUS_MAPS,
    formatStatus,
    truncateText,
    formatList,
    createBaseEmbed,
    createMALEmbed,
    createLunabyEmbed,
    createErrorEmbed,
    createSuccessEmbed,
    createInfoEmbed
};