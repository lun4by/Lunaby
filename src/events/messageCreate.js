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

      const [gSettings, blockedGuild, blockedUser] = await Promise.all([
        message.guildId ? MariaModDB.getGuildSettings(message.guildId) : Promise.resolve(null),
        shouldBlockGuild(message.guild),
        shouldBlockUser(message.author),
      ]);

      const locale = gSettings?.language || 'vi';
      message.t = (key, options) => i18nManager.t(key, locale, options);

      if (blockedGuild) {
        await notifyBlacklistedGuildAndLeave(message.guild, blockedGuild.reason);
        return;
      }

      if (blockedUser) {
        await notifyBlacklistedUser(message.author, blockedUser.reason);
        return;
      }

      const xpResult = await XPService.addXP(message);
      if (xpResult && xpResult.leveledUp) {
        try {
          if (gSettings?.settings?.levelUpChannel && gSettings?.settings?.levelUpNotifications) {
            const targetChannelId = gSettings.settings.levelUpChannel;
            const targetChannel = message.guild.channels.cache.get(targetChannelId) || await message.guild.channels.fetch(targetChannelId).catch(() => null);

            if (targetChannel && targetChannel.isTextBased()) {
              const attachment = await generateLevelUpCard(message.author, xpResult.previousLevel, xpResult.level);
              await targetChannel.send({
                content: message.t('system.levelup_congrats', {
                  user: message.author.toString(),
                  level: xpResult.level,
                }),
                files: [attachment]
              });
            }
          }
        } catch (err) {
          logger.error('levelup', 'Failed to send level up message:', err);
        }
      }

      const handled = await handlePrefixMessage(message, client);
      if (handled) return;

      await handleMentionMessage(message, client);
    } catch (error) {
      logger.error("message_event", "Error handling message:", error);
    }
  });

  logger.info("events", "Registered event: MessageCreate");
}

module.exports = { setupMessageCreateEvent };