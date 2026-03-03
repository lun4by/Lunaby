const MariaModDB = require('./database/MariaModDB');

const DEFAULT_GUILD_SETTINGS = {
    _id: null,
    prefix: null,
    greeter: {
        welcome: { isEnabled: false, channel: null, message: null, embed: false, type: "default" },
        leaving: { isEnabled: false, channel: null, message: null, embed: null, type: "default" },
    },
    xp: { isActive: false, exceptions: [] },
    roles: { muted: null },
    channels: { suggest: null },
};

const createDefaultGuildProfile = (guildId) => ({ ...DEFAULT_GUILD_SETTINGS, _id: guildId });

const getGuildProfile = async (guildId) => {
    return MariaModDB.getGuildSettings(guildId);
};

const updateGuildProfile = async (guildId, updateData) => {
    return MariaModDB.updateGuildSettings(guildId, updateData);
};

const setXpChannelException = async (guildId, channelId, isException) => {
    return MariaModDB.setXpException(guildId, channelId, isException);
};

const toggleXpSystem = async (guildId, isActive) => {
    return MariaModDB.toggleXp(guildId, isActive);
};

module.exports = {
    guildProfileStructure: DEFAULT_GUILD_SETTINGS,
    createDefaultGuildProfile,
    getGuildProfile,
    updateGuildProfile,
    setXpChannelException,
    toggleXpSystem,
};