/**
 * Shared embed utilities for Discord embeds
 * Reduces code duplication across services
 */

// Brand colors
const COLORS = {
    MAL: 0x2e51a2,
    ERROR: 0xff0000,
    SUCCESS: 0x00ff00,
    WARNING: 0xffff00,
    INFO: 0x0099ff,
    LUNABY: 0x7289da,
};

// Status mapping for MyAnimeList
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
    season: {
        winter: "Đông",
        spring: "Xuân",
        summer: "Hạ",
        fall: "Thu",
    },
};

/**
 * Get localized status string
 * @param {string} type - 'anime' | 'manga' | 'season'
 * @param {string} status - Status key
 * @returns {string} Localized status string
 */
function formatStatus(type, status) {
    return STATUS_MAPS[type]?.[status] || "N/A";
}

/**
 * Create a base embed with standard footer
 * @param {string} title - Embed title
 * @param {number} color - Embed color (hex)
 * @param {string} [description] - Optional description
 * @returns {Object} Embed object
 */
function createBaseEmbed(title, color, description = null) {
    const embed = {
        color,
        title,
        timestamp: new Date(),
    };
    if (description) embed.description = description;
    return embed;
}

/**
 * Create a MAL-styled embed
 * @param {string} title - Embed title
 * @param {string} [description] - Optional description
 * @returns {Object} Embed object with MAL styling
 */
function createMALEmbed(title, description = null) {
    return {
        ...createBaseEmbed(title, COLORS.MAL, description),
        footer: { text: "Powered by MyAnimeList API" },
    };
}

/**
 * Create an error embed
 * @param {string} title - Error title
 * @param {string} description - Error description
 * @returns {Object} Error embed object
 */
function createErrorEmbed(title, description) {
    return createBaseEmbed(title, COLORS.ERROR, description);
}

/**
 * Truncate text with ellipsis
 * @param {string} text - Text to truncate
 * @param {number} maxLength - Maximum length
 * @returns {string} Truncated text
 */
function truncateText(text, maxLength = 500) {
    if (!text) return "";
    return text.length > maxLength ? text.substring(0, maxLength) + "..." : text;
}

/**
 * Format a list of items into a single line
 * @param {Array<Object>} items - Array of items
 * @param {string} key - Key to extract from each item
 * @param {number} limit - Max items to include
 * @returns {string} Comma-separated string
 */
function formatList(items, key = "name", limit = null) {
    if (!items?.length) return "N/A";
    const list = limit ? items.slice(0, limit) : items;
    return list.map((item) => item[key] || item).join(", ");
}

module.exports = {
    COLORS,
    STATUS_MAPS,
    formatStatus,
    createBaseEmbed,
    createMALEmbed,
    createErrorEmbed,
    truncateText,
    formatList,
};
