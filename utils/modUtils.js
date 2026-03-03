const MariaModDB = require("../services/database/MariaModDB.js");
const logger = require("./logger.js");

async function logModAction({ guildId, targetId, moderatorId, action, reason, duration, count }) {
  try {
    const success = await MariaModDB.addModLog(guildId, targetId, moderatorId, action, {
      reason: reason || "Không có lý do",
      duration: duration || null,
      count: count || null,
    });
    if (!success) logger.error("MODERATION", "Không thể lưu hành động moderation vào MariaDB");
    return success;
  } catch (error) {
    logger.error("MODERATION", "Lỗi khi lưu hành động moderation:", error);
    throw error;
  }
}

async function getModLogs({ guildId, targetId = null, action = null, limit = 10 }) {
  try {
    return await MariaModDB.getModLogs({ guildId, targetId, action, limit });
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