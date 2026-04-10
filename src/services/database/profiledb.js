const mongoClient = require("./mongoClient.js");
const logger = require("../../utils/logger.js");

const userProfileCache = new Set();

const createProfileStructure = (userId) => ({
    _id: userId,
    data: {
        global_xp: 0,
        global_level: 1,
        role: 'user',
        consent: false,
        memory: {
            allowMemoryStorage: true,
            allowPersonalInfoExtraction: true,
            lastMemorySync: null,
        },
    },
});

const getProfileCollection = async () => {
    const db = mongoClient.getDb();
    return db.collection("user_profiles");
};

const createDefaultProfile = (userId) => {
    userProfileCache.add(userId);
    return createProfileStructure(userId);
};

const getProfile = async (userId) => {
    const collection = await getProfileCollection();
    let profile = await collection.findOne({ _id: userId });

    if (!profile) {
        try {
            const result = await collection.updateOne(
                { _id: userId },
                { $setOnInsert: createProfileStructure(userId) },
                { upsert: true }
            );
            if (result.upsertedId || result.matchedCount > 0) {
                userProfileCache.add(userId);
            }
        } catch (error) {
            if (!error.message.includes('duplicate key')) {
                logger.error("DATABASE", `Error khi tạo profile cho ${userId}:`, error);
            }
        }
        profile = await collection.findOne({ _id: userId });
    } else {
        userProfileCache.add(userId);
    }

    return profile;
};

module.exports = { createProfileStructure, getProfileCollection, createDefaultProfile, getProfile };