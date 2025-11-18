const { EmbedBuilder } = require("discord.js");
const mongoClient = require("../services/mongoClient.js");
const logger = require("./logger.js");


async function sendModLog(guild, embed, isModAction = true) {
  try {
    const db = mongoClient.getDb();

    const logSettings = await db.collection("mod_settings").findOne({
      guildId: guild.id,
    });

    let logChannel = null;

    if (logSettings && logSettings.logChannelId) {
      const shouldLog = isModAction
        ? logSettings.modActionLogs !== false
        : logSettings.monitorLogs !== false;

      if (shouldLog) {
        try {
          logChannel = await guild.channels.fetch(logSettings.logChannelId);
        } catch (error) {
          logger.error(
            "COMMAND",
            `Không thể tìm thấy kênh log ${logSettings.logChannelId}:`,
            error
          );
        }
      }
    }

    if (!logChannel) {
      logChannel = guild.channels.cache.find(
        (channel) =>
          channel.name.includes("mod-logs") ||
          channel.name.includes("mod-chat") ||
          channel.name.includes("admin") ||
          channel.name.includes("bot-logs")
      );
    }

    if (logChannel && logChannel.isTextBased()) {
      return await logChannel.send({ embeds: [embed] });
    }

    return null;
  } catch (error) {
    logger.error("COMMAND", "Lỗi khi gửi log moderation:", error);
    return null;
  }
}


function createModActionEmbed(options) {
  const embed = new EmbedBuilder()
    .setColor(options.color || 0x3498db)
    .setTitle(options.title || "Hành động Moderation")
    .setDescription(options.description || "")
    .setTimestamp();

  if (options.fields && Array.isArray(options.fields)) {
    for (const field of options.fields) {
      embed.addFields(field);
    }
  }

  if (options.footer) {
    embed.setFooter({ text: options.footer });
  }

  return embed;
}


async function getModLogChannel(guild, isModAction = true) {
  try {
    const db = mongoClient.getDb();

    const logSettings = await db.collection("mod_settings").findOne({
      guildId: guild.id,
    });

    let logChannel = null;

    if (logSettings && logSettings.logChannelId) {
      const shouldLog = isModAction
        ? logSettings.modActionLogs !== false
        : logSettings.monitorLogs !== false;

      if (shouldLog) {
        try {
          logChannel = await guild.channels.fetch(logSettings.logChannelId);
          if (logChannel && logChannel.isTextBased()) {
            return logChannel;
          }
        } catch (error) {
          logger.error(
            "COMMAND",
            `Không thể tìm thấy kênh log ${logSettings.logChannelId}:`,
            error
          );
        }
      }
    }

    logChannel = guild.channels.cache.find(
      (channel) =>
        channel.name.includes("mod-logs") ||
        channel.name.includes("mod-chat") ||
        channel.name.includes("admin") ||
        channel.name.includes("bot-logs")
    );

    if (logChannel && logChannel.isTextBased()) {
      return logChannel;
    }

    return null;
  } catch (error) {
    logger.error("COMMAND", "Lỗi khi lấy kênh log moderation:", error);
    return null;
  }
}

module.exports = {
  sendModLog,
  createModActionEmbed,
  getModLogChannel,
};
