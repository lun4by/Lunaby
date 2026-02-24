const { MongoClient, ObjectId } = require("mongodb");
const mongoClient = require("./mongoClient.js");
const logger = require("../utils/logger.js");

logger.info("SYSTEM", "GuildProfileDB module đã được tải vào hệ thống");

const profileCache = new Set();


const guildProfileStructure = {
  _id: String,
  prefix: null,
  greeter: {
    welcome: {
      isEnabled: false,
      channel: null,
      message: null,
      embed: false,
      type: "default",
    },
    leaving: {
      isEnabled: false,
      channel: null,
      message: null,
      embed: null,
      type: "default",
    },
  },
  xp: {
    isActive: false,
    exceptions: [],
  },
  roles: {
    muted: null,
  },
  channels: {
    suggest: null,
  },
};


const getGuildProfileCollection = async () => {
  try {
    const db = mongoClient.getDb();
    // Bỏ thông báo debug để tránh spam console
    return db.collection("guild_profiles");
  } catch (error) {
    logger.error(
      "SYSTEM",
      "Lỗi khi truy cập collection guild_profiles:",
      error
    );
    throw error;
  }
};


const createDefaultGuildProfile = (guildId) => {
  if (!profileCache.has(guildId)) {
    // logger.info("SYSTEM", `Tạo profile mới cho guild: ${guildId}`);
    profileCache.add(guildId);
  }

  return {
    _id: guildId,
    ...guildProfileStructure,
  };
};


const getAllGuildProfiles = async () => {
  try {
    const collection = await getGuildProfileCollection();
    return await collection.find({}, { projection: { _id: 1, guildName: 1, xpSettings: 1 } }).toArray();
  } catch (error) {
    logger.error("SYSTEM", "Lỗi khi lấy tất cả hồ sơ guild:", error);
    return [];
  }
};


const getGuildProfile = async (guildId) => {
  try {
    const collection = await getGuildProfileCollection();

    // Tìm hồ sơ guild trong database
    let profile = await collection.findOne({ _id: guildId });

    // Nếu không tìm thấy, tạo mới
    if (!profile) {
      profile = createDefaultGuildProfile(guildId);
      await collection.insertOne(profile);
    } else {
      // Nếu đã tìm thấy, thêm vào cache để tránh in thông báo tạo mới sau này
      profileCache.add(guildId);
    }

    return profile;
  } catch (error) {
    logger.error("SYSTEM", `Lỗi khi lấy hồ sơ guild ${guildId}:`, error);
    throw error;
  }
};


const updateGuildProfile = async (guildId, updateData) => {
  try {
    const collection = await getGuildProfileCollection();

    // Cập nhật hoặc tạo mới nếu chưa tồn tại
    const result = await collection.updateOne(
      { _id: guildId },
      { $set: updateData },
      { upsert: true }
    );

    return result.acknowledged;
  } catch (error) {
    logger.error("SYSTEM", `Lỗi khi cập nhật hồ sơ guild ${guildId}:`, error);
    return false;
  }
};


const setXpChannelException = async (guildId, channelId, isException) => {
  try {
    const profile = await getGuildProfile(guildId);

    if (!profile.xp) {
      profile.xp = { isActive: true, exceptions: [] };
    }

    const exceptions = profile.xp.exceptions || [];
    const hasException = exceptions.includes(channelId);

    if (isException && !hasException) {
      // Thêm kênh vào danh sách ngoại lệ
      profile.xp.exceptions = [...exceptions, channelId];
    } else if (!isException && hasException) {
      // Xóa kênh khỏi danh sách ngoại lệ
      profile.xp.exceptions = exceptions.filter((id) => id !== channelId);
    } else {
      // Không có thay đổi
      return true;
    }

    return await updateGuildProfile(guildId, { xp: profile.xp });
  } catch (error) {
    logger.error(
      "SYSTEM",
      `Lỗi khi thiết lập ngoại lệ XP cho guild ${guildId}:`,
      error
    );
    return false;
  }
};


const toggleXpSystem = async (guildId, isActive) => {
  try {
    const profile = await getGuildProfile(guildId);

    if (!profile.xp) {
      profile.xp = { isActive, exceptions: [] };
    } else {
      profile.xp.isActive = isActive;
    }

    return await updateGuildProfile(guildId, { xp: profile.xp });
  } catch (error) {
    logger.error(
      "SYSTEM",
      `Lỗi khi ${isActive ? "bật" : "tắt"} XP cho guild ${guildId}:`,
      error
    );
    return false;
  }
};


const setupGuildProfileIndexes = async () => {
  try {
    const db = mongoClient.getDb();

    // Tạo index cho collections
    await db.collection("guild_profiles").createIndex({ _id: 1 });

    logger.info("SYSTEM", "Đã thiết lập indexes cho collection guild_profiles");
  } catch (error) {
    logger.error(
      "SYSTEM",
      "Lỗi khi thiết lập indexes cho guild_profiles:",
      error
    );
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
