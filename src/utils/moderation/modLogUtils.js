const { EmbedBuilder } = require("discord.js");
const MariaModDB = require('../../services/database/MariaModDB.js');
const logger = require("../core/logger.js");

const { createEmbed } = require('../discord/builderFactory');
const FALLBACK_CHANNEL_NAMES = ["mod-logs", "mod-chat", "admin", "bot-logs"];

async function getModLogChannel(guild, isModAction = true) {
  try {
    const logSettings = await MariaModDB.getSettings(guild.id);

    if (logSettings?.logChannelId) {
      const shouldLog = isModAction ? logSettings.modActionLogs !== false : logSettings.monitorLogs !== false;
      if (shouldLog) {
        try {
          const channel = await guild.channels.fetch(logSettings.logChannelId);
          if (channel?.isTextBased()) return channel;
        } catch (error) {
          logger.error("command", `Failed to find log channel ${logSettings.logChannelId}:`, error);
        }
      }
    }

    const fallback = guild.channels.cache.find(ch =>
      ch.isTextBased() && FALLBACK_CHANNEL_NAMES.some(name => ch.name.includes(name))
    );
    return fallback || null;
  } catch (error) {
    logger.error("command", "Error while fetching moderation log channel:", error);
    return null;
  }
}

async function sendModLog(guild, embed, isModAction = true) {
  try {
    const logChannel = await getModLogChannel(guild, isModAction);
    return logChannel ? await logChannel.send({ embeds: [embed] }) : null;
  } catch (error) {
    logger.error("command", "Error while sending moderation log:", error);
    return null;
  }
}

function createModActionEmbed(options) {
  const embed = createEmbed()
    .setColor(options.color || 0x3498db)
    .setTitle(options.title || "Hành động Moderation")
    .setDescription(options.description || "")
    .setTimestamp();

  if (Array.isArray(options.fields)) embed.addFields(...options.fields);
  if (options.footer) embed.setFooter({ text: options.footer });

  return embed;
}

module.exports = { 
  sendModLog, 
  createModActionEmbed, 
  getModLogChannel 
};