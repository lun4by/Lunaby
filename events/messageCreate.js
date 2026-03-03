const { Events } = require("discord.js");
const { handleMentionMessage } = require("../handlers/messageHandler");
const { handlePrefixMessage } = require("../handlers/prefixHandler");
const XPService = require("../services/XPService");
const guildProfileDB = require("../services/database/guildprofiledb");
const logger = require("../utils/logger.js");

function setupMessageCreateEvent(client) {
  client.on(Events.MessageCreate, async (message) => {
    try {
      if (message.author.bot) return;



      // Check prefix commands first
      const handled = await handlePrefixMessage(message, client);
      if (handled) return;

      await handleMentionMessage(message, client);
    } catch (error) {
      logger.error("MESSAGE_EVENT", "Lỗi khi xử lý message:", error);
    }
  });

  logger.info("EVENTS", "Đã đăng ký event: MessageCreate");
}

module.exports = { setupMessageCreateEvent };
