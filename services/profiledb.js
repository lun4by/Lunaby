const { MongoClient, ObjectId } = require("mongodb");
const mongoClient = require("./mongoClient.js");
const logger = require("../utils/logger.js");

logger.info("SYSTEM", "ProfileDB module đã được tải vào hệ thống");

const userProfileCache = new Set();

const createProfileStructure = (userId) => ({
  _id: userId,
  data: {
    global_xp: 0,
    global_level: 1,
    role: 'user',
    consent: false,
    profile: {
      bio: "No bio written.",
      background: null,
      pattern: null,
      emblem: null,
      hat: null,
      wreath: null,
      color: null,
      birthday: null,
      inventory: [],
      social: {
        twitter: null,
        youtube: null,
        twitch: null,
        website: null,
      },
      custom_status: null,
      badges: [],
      frame: null,
      effect: null,
    },
    economy: {
      bank: null,
      wallet: null,
      streak: {
        alltime: 0,
        current: 0,
        timestamp: 0,
      },
      shard: null,
    },
    reputation: {
      points: 0,
      givenBy: [],
      lastGiven: 0,
    },
    tips: {
      given: 0,
      received: 0,
      timestamp: 0,
    },
    xp: [],
    vote: {
      notification: true,
    },
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
  if (!userProfileCache.has(userId)) {
    logger.info("SYSTEM", `Tạo profile mới cho người dùng: ${userId}`);
    userProfileCache.add(userId);
  }

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
        logger.info("SYSTEM", `Tạo profile mới cho người dùng: ${userId}`);
        userProfileCache.add(userId);
      }
    } catch (error) {
      if (!error.message.includes('duplicate key')) {
        logger.error("DATABASE", `Lỗi khi tạo profile cho ${userId}:`, error);
      }
    }
    
    profile = await collection.findOne({ _id: userId });
  } else {
    userProfileCache.add(userId);
  }

  return profile;
};

module.exports = {
  createProfileStructure,
  getProfileCollection,
  createDefaultProfile,
  getProfile,
};
