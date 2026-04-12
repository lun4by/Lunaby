const MariaModDB = require('../../services/database/MariaModDB.js');

const guildSettingsCacheTtlMs = 15000;
const guildSettingsCache = new Map();

async function getCachedGuildSettings(guildId) {
    const cached = guildSettingsCache.get(guildId);
    const now = Date.now();

    if (cached && now - cached.ts < guildSettingsCacheTtlMs) {
        return cached.settings;
    }

    const settings = await MariaModDB.getGuildSettings(guildId);
    guildSettingsCache.set(guildId, { settings, ts: now });
    return settings;
}

async function getGuildLocale(guildId, fallbackLocale = 'vi') {
    const settings = await getCachedGuildSettings(guildId);
    return settings?.language || fallbackLocale;
}

async function getGuildVoiceSettings(guildId, fallbackLocale = 'vi') {
    const settings = await getCachedGuildSettings(guildId);

    return {
        enabled: Boolean(settings?.voiceToggle?.isEnabled),
        locale: settings?.language || fallbackLocale,
        settings,
    };
}

function invalidateGuildLocaleCache(guildId) {
    if (guildId) {
        guildSettingsCache.delete(guildId);
        return;
    }

    guildSettingsCache.clear();
}

module.exports = {
    invalidateGuildLocaleCache,
    getCachedGuildSettings,
    getGuildLocale,
    getGuildVoiceSettings,
};
