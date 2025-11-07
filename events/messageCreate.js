const { Events } = require("discord.js");
const { handleMentionMessage } = require("../handlers/messageHandler");
const XPService = require("../services/XPService");
const guildProfileDB = require("../services/guildprofiledb");
const logger = require("../utils/logger.js");

function setupMessageCreateEvent(client) {
  client.on(Events.MessageCreate, async (message) => {
    try {
      // Xử lý XP trước
      if (message.guild && !message.author.bot) {
        const xpResult = await XPService.addXP(message);
        
        if (xpResult && xpResult.leveledUp) {
          try {
            // Kiểm tra cài đặt guild trước khi gửi thông báo level-up
            const profile = await guildProfileDB.getGuildProfile(message.guild.id);
            const levelUpEnabled = profile?.settings?.levelUpNotifications !== false; // default true if not set

            if (levelUpEnabled) {
              await message.reply({
                content: `🎉 Chúc mừng <@${message.author.id}>! Bạn đã lên **Level ${xpResult.level}**!`,
                allowedMentions: { users: [message.author.id] }
              });
            } else {
              logger.debug('XP', `Level-up notification suppressed for guild ${message.guild.id} (disabled in settings)`);
            }
          } catch (err) {
            logger.debug('XP', 'Không thể gửi thông báo level up:', err.message);
          }
        }
      }

      await handleMentionMessage(message, client);
    } catch (error) {
      logger.error("MESSAGE_EVENT", "Lỗi khi xử lý message:", error);
    }
  });

  logger.info("EVENTS", "Đã đăng ký event: MessageCreate");
}

module.exports = { setupMessageCreateEvent };
