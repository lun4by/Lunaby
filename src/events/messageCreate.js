const { Events } = require("discord.js");
const { handleMentionMessage } = require("../handlers/messageHandler");
const { handlePrefixMessage } = require("../handlers/prefixHandler");
const XPService = require("../services/user/XPService");
const { generateLevelUpCard } = require("../services/canvas/levelUpCanvas");
const logger = require("../utils/logger.js");

function setupMessageCreateEvent(client) {
  client.on(Events.MessageCreate, async (message) => {
    try {
      if (message.author.bot) return;

      const xpResult = await XPService.addXP(message);
      if (xpResult && xpResult.leveledUp) {
        try {
          const attachment = await generateLevelUpCard(message.author, xpResult.previousLevel, xpResult.level);
          await message.channel.send({
            content: `🎉 Chúc mừng ${message.author}! Bạn vừa đạt cấp **${xpResult.level}**!`,
            files: [attachment]
          });
        } catch (err) {
          logger.error('LEVELUP', 'Failed to send level up message:', err);
        }
      }

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