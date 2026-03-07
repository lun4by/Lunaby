const { Events } = require("discord.js");
const { handleGuildJoin, handleGuildLeave } = require("../handlers/guildHandler");
const logger = require("../utils/logger.js");
const MariaModDB = require('../services/database/MariaModDB.js');

const sendGlobalLog = async (client, message) => {
    const logChannelId = await MariaModDB.getBotSetting('global_log_channel');
    if (!logChannelId) return;

    const logChannel = await client.channels.fetch(logChannelId).catch(() => null);
    if (logChannel?.isTextBased()) {
        await logChannel.send(message);
    }
};

function setupGuildEvents(client) {

  client.on(Events.GuildCreate, async (guild) => {
    try {
      logger.info('GUILD_EVENT', `Bot tham gia guild mới: ${guild.name} (${guild.id})`);
      await sendGlobalLog(client, `Bot tham gia guild mới: ${guild.name} (${guild.id})`);
      await handleGuildJoin(guild, null);
    } catch (error) {
      logger.error('GUILD_EVENT', `Lỗi khi xử lý GuildCreate cho ${guild.name}:`, error);
    }
  });

  client.on(Events.GuildDelete, async (guild) => {
    try {
      logger.info('GUILD_EVENT', `Bot rời khỏi guild: ${guild.name} (${guild.id})`);
      await sendGlobalLog(client, `Bot rời khỏi guild: ${guild.name} (${guild.id})`);
      await handleGuildLeave(guild);
    } catch (error) {
      logger.error('GUILD_EVENT', `Lỗi khi xử lý GuildDelete cho ${guild.name}:`, error);
    }
  });

  logger.info("EVENTS", "Đã đăng ký events: GuildCreate, GuildDelete");
}

module.exports = { setupGuildEvents };