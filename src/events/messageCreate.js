const { Events } = require("discord.js");
const { handleMentionMessage } = require("../handlers/messageHandler");
const { handlePrefixMessage } = require("../handlers/prefixHandler");
const XPService = require("../services/user/XPService");
const { generateLevelUpCard } = require("../services/canvas/levelUpCanvas");
const { ensureMessageAllowed, resolveMessageContext } = require("./eventRuntime");
const logger = require("../utils/logger.js");

async function sendLevelUpNotification(message, guildSettings, xpResult) {
  if (!xpResult?.leveledUp || !guildSettings?.settings?.levelUpChannel || !guildSettings?.settings?.levelUpNotifications) {
    return;
  }

  const targetChannelId = guildSettings.settings.levelUpChannel;
  const targetChannel = message.guild.channels.cache.get(targetChannelId)
    || await message.guild.channels.fetch(targetChannelId).catch(() => null);

  if (!targetChannel?.isTextBased()) {
    return;
  }

  const attachment = await generateLevelUpCard(message.author, xpResult.previousLevel, xpResult.level);
  await targetChannel.send({
    content: message.t('system.levelup_congrats', {
      user: message.author.toString(),
      level: xpResult.level,
    }),
    files: [attachment],
  });
}

function setupMessageCreateEvent(client) {
  client.on(Events.MessageCreate, async (message) => {
    try {
      if (message.author.bot) return;
      if (!message.guild) return;

      const context = await resolveMessageContext(message);
      if (!(await ensureMessageAllowed(message, context))) {
        return;
      }

      const xpResult = await XPService.addXP(message);
      try {
        await sendLevelUpNotification(message, context.guildSettings, xpResult);
      } catch (err) {
        logger.error('levelup', 'Failed to send level up message:', err);
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
