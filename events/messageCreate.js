const { Events } = require("discord.js");
const { handleMentionMessage } = require("../handlers/messageHandler");
const XPService = require("../services/XPService");
const guildProfileDB = require("../services/guildprofiledb");
const logger = require("../utils/logger.js");

function setupMessageCreateEvent(client) {
  client.on(Events.MessageCreate, async (message) => {
    try {
      if (message.author.bot) return;

      // XP system disabled
      // if (message.guild) {
      //   const xpResult = await XPService.addXP(message);
      //   
      //   if (xpResult && xpResult.leveledUp) {
      //     try {
      //       const profile = await guildProfileDB.getGuildProfile(message.guild.id);
      //       const levelUpEnabled = profile?.settings?.levelUpNotifications !== false;
      //       if (levelUpEnabled) {
      //         await message.reply({
      //           content: `🎉 Chúc mừng <@${message.author.id}>! Bạn đã lên **Level ${xpResult.level}**!`,
      //           allowedMentions: { users: [message.author.id] }
      //         });
      //       }
      //     } catch (err) {
      //       logger.debug('XP', 'Không thể gửi thông báo level up:', err.message);
      //     }
      //   }
      // }

      await handleMentionMessage(message, client);
    } catch (error) {
      logger.error("MESSAGE_EVENT", "Lỗi khi xử lý message:", error);
    }
  });

  logger.info("EVENTS", "Đã đăng ký event: MessageCreate");
}

module.exports = { setupMessageCreateEvent };
