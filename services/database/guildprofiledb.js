const mongoClient = require("./mongoClient.js");
const logger = require("../../utils/logger.js");

const profileCache = new Set();

const guildProfileStructure = {
    _id: String,
    prefix: null,
    greeter: {
        welcome: { isEnabled: false, channel: null, message: null, embed: false, type: "default" },
        leaving: { isEnabled: false, channel: null, message: null, embed: null, type: "default" },
    },
    xp: { isActive: false, exceptions: [] },
    roles: { muted: null },
    channels: { suggest: null },
};

const getGuildProfileCollection = async () => {
    const db = mongoClient.getDb();
    return db.collection("guild_profiles");
};

const createDefaultGuildProfile = (guildId) => {
    profileCache.add(guildId);
    return { _id: guildId, ...guildProfileStructure };
};

const getAllGuildProfiles = async () => {
    try {
        const collection = await getGuildProfileCollection();
        return await collection.find({}, { projection: { _id: 1, guildName: 1, xpSettings: 1 } }).toArray();
    } catch (error) {
        logger.error("DATABASE", "Lỗi khi lấy tất cả hồ sơ guild:", error);
        return [];
    }
};

const getGuildProfile = async (guildId) => {
    try {
        const collection = await getGuildProfileCollection();
        let profile = await collection.findOne({ _id: guildId });

        if (!profile) {
            profile = createDefaultGuildProfile(guildId);
            await collection.insertOne(profile);
        } else {
            profileCache.add(guildId);
        }

        return profile;
    } catch (error) {
        logger.error("DATABASE", `Lỗi khi lấy hồ sơ guild ${guildId}:`, error);
        throw error;
    }
};

const updateGuildProfile = async (guildId, updateData) => {
    try {
        const collection = await getGuildProfileCollection();
        const result = await collection.updateOne(
            { _id: guildId },
            { $set: updateData },
            { upsert: true }
        );
        return result.acknowledged;
    } catch (error) {
        logger.error("DATABASE", `Lỗi khi cập nhật hồ sơ guild ${guildId}:`, error);
        return false;
    }
};

const setXpChannelException = async (guildId, channelId, isException) => {
    try {
        const profile = await getGuildProfile(guildId);
        const exceptions = profile.xp?.exceptions || [];
        const hasException = exceptions.includes(channelId);

        if (isException && !hasException) {
            profile.xp.exceptions = [...exceptions, channelId];
        } else if (!isException && hasException) {
            profile.xp.exceptions = exceptions.filter((id) => id !== channelId);
        } else {
            return true;
        }

        return await updateGuildProfile(guildId, { xp: profile.xp });
    } catch (error) {
        logger.error("DATABASE", `Lỗi khi thiết lập ngoại lệ XP cho guild ${guildId}:`, error);
        return false;
    }
};

const toggleXpSystem = async (guildId, isActive) => {
    try {
        const profile = await getGuildProfile(guildId);
        profile.xp = { ...profile.xp, isActive, exceptions: profile.xp?.exceptions || [] };
        return await updateGuildProfile(guildId, { xp: profile.xp });
    } catch (error) {
        logger.error("DATABASE", `Lỗi khi ${isActive ? "bật" : "tắt"} XP cho guild ${guildId}:`, error);
        return false;
    }
};

const setupGuildProfileIndexes = async () => {
    try {
        const db = mongoClient.getDb();
        await db.collection("guild_profiles").createIndex({ _id: 1 });
    } catch (error) {
        logger.error("DATABASE", "Lỗi khi thiết lập indexes cho guild_profiles:", error);
        throw error;
    }
};

module.exports = {
    guildProfileStructure,
    getGuildProfileCollection,
    createDefaultGuildProfile,
    getGuildProfile,
    getAllGuildProfiles,
    updateGuildProfile,
    setXpChannelException,
    toggleXpSystem,
    setupGuildProfileIndexes,
};
