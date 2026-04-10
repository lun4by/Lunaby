const { Events } = require("discord.js");
const { handleMentionMessage } = require("../handlers/messageHandler");
const { handlePrefixMessage } = require("../handlers/prefixHandler");
const XPService = require("../services/user/XPService");
const { generateLevelUpCard } = require("../services/canvas/levelUpCanvas");
const {
  notifyBlacklistedGuildAndLeave,
  notifyBlacklistedUser,
  shouldBlockGuild,
  shouldBlockUser,
} = require("../utils/blacklistUtils");
const logger = require("../utils/logger.js");
const i18nManager = require('../services/i18n/i18nManager');
const MariaModDB = require("../services/database/MariaModDB");

function setupMessageCreateEvent(client) {
  client.on(Events.MessageCreate, async (message) => {
    try {
      if (message.author.bot) return;
      if (!message.guild) return;

      let locale = 'vi';
      if (message.guildId) {
          const gSettings = await MariaModDB.getGuildSettings(message.guildId);
          locale = gSettings?.language || 'vi';
      }
      message.t = (key, options) => i18nManager.t(key, locale, options);

      const blockedGuild = message.guild ? await shouldBlockGuild(message.guild) : null;
      if (blockedGuild) {
        await notifyBlacklistedGuildAndLeave(message.guild, blockedGuild.reason);
        return;
      }

      const blockedUser = await shouldBlockUser(message.author);
      if (blockedUser) {
        await notifyBlacklistedUser(message.author, blockedUser.reason);
        return;
      }

      const xpResult = await XPService.addXP(message);
      if (xpResult && xpResult.leveledUp) {
        try {
          const settings = await MariaModDB.getGuildSettings(message.guild.id);

          if (settings?.settings?.levelUpChannel && settings?.settings?.levelUpNotifications) {
            const targetChannelId = settings.settings.levelUpChannel;
            const targetChannel = message.guild.channels.cache.get(targetChannelId) || await message.guild.channels.fetch(targetChannelId).catch(() => null);

            if (targetChannel && targetChannel.isTextBased()) {
              const attachment = await generateLevelUpCard(message.author, xpResult.previousLevel, xpResult.level);
              await targetChannel.send({
                content: `🎉 Chúc mừng ${message.author}! Bạn vừa đạt cấp **${xpResult.level}**!`,
                files: [attachment]
              });
            }
          }
        } catch (err) {
          logger.error('LEVELUP', 'Failed to send level up message:', err);
        }
      }

      const handled = await handlePrefixMessage(message, client);
      if (handled) return;

      await handleMentionMessage(message, client);
    } catch (error) {
      logger.error("MESSAGE_EVENT", "Error handling message:", error);
    }
  });

  logger.info("EVENTS", "Registered event: MessageCreate");
}

module.exports = { setupMessageCreateEvent };
