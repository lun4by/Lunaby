const mongoClient = require("../services/mongoClient.js");


async function logModAction(options) {
  try {
    const db = mongoClient.getDb();

    // Tạo collection log nếu chưa tồn tại
    try {
      await db.createCollection("modlog");
    } catch (error) {
      // Bỏ qua lỗi nếu collection đã tồn tại
    }

    // Chuẩn bị dữ liệu cơ bản
    const logData = {
      guildId: options.guildId,
      targetId: options.targetId,
      moderatorId: options.moderatorId,
      action: options.action,
      reason: options.reason || "Không có lý do",
      timestamp: Date.now(),
    };

    // Thêm các thông tin tùy chọn
    if (options.duration) {
      logData.duration = options.duration;
    }

    if (options.count) {
      logData.count = options.count;
    }

    // Lưu vào DB
    const result = await db.collection("modlog").insertOne(logData);

    return { ...logData, _id: result.insertedId };
  } catch (error) {
    logger.error("MODERATION", "Lỗi khi lưu hành động moderation:", error);
    throw error;
  }
}


async function getModLogs(options) {
  try {
    const db = mongoClient.getDb();

    // Tạo bộ lọc
    const filter = { guildId: options.guildId };

    if (options.targetId) {
      filter.targetId = options.targetId;
    }

    if (options.action) {
      filter.action = options.action;
    }

    // Truy vấn và sắp xếp kết quả
    const logs = await db
      .collection("modlog")
      .find(filter, { projection: { _id: 0, guildId: 1, targetId: 1, moderatorId: 1, action: 1, reason: 1, timestamp: 1, duration: 1, count: 1 } })
      .sort({ timestamp: -1 })
      .limit(options.limit || 10)
      .toArray();

    return logs;
  } catch (error) {
    logger.error("MODERATION", "Lỗi khi lấy danh sách hành động moderation:", error);
    throw error;
  }
}


function formatDuration(minutes) {
  if (minutes < 60) {
    return `${minutes} phút`;
  } else if (minutes < 1440) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours} giờ${mins > 0 ? ` ${mins} phút` : ""}`;
  } else {
    const days = Math.floor(minutes / 1440);
    const hours = Math.floor((minutes % 1440) / 60);
    return `${days} ngày${hours > 0 ? ` ${hours} giờ` : ""}`;
  }
}

module.exports = {
  logModAction,
  getModLogs,
  formatDuration,
};
