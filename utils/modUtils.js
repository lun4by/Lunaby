const MariaModDB = require("../services/database/MariaModDB.js");
const logger = require("./logger.js");

async function logModAction(options) {
  try {
    const success = await MariaModDB.addModLog(
      options.guildId,
      options.targetId,
      options.moderatorId,
      options.action,
      {
        reason: options.reason || "Không có lý do",
        duration: options.duration || null,
        count: options.count || null,
      }
    );

    if (!success) {
      logger.error("MODERATION", "Không thể lưu hành động moderation vào MariaDB");
    }

    return success;
  } catch (error) {
    logger.error("MODERATION", "Lỗi khi lưu hành động moderation:", error);
    throw error;
  }
}

async function getModLogs(options) {
  try {
    return await MariaModDB.getModLogs({
      guildId: options.guildId,
      targetId: options.targetId || null,
      action: options.action || null,
      limit: options.limit || 10,
    });
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
