const { Events } = require("discord.js");
const { handleGuildJoin, handleGuildLeave } = require("../handlers/guildHandler");
const logger = require("../utils/logger.js");

function setupGuildEvents(client) {

  client.on(Events.GuildCreate, async (guild) => {
    try {
      await handleGuildJoin(guild, null);
    } catch (error) {
      logger.error('guild_event', `Error handling GuildCreate for ${guild.name}:`, error);
    }
  });

  client.on(Events.GuildDelete, async (guild) => {
    try {
      await handleGuildLeave(guild);
    } catch (error) {
      logger.error('guild_event', `Error handling GuildDelete for ${guild.name}:`, error);
    }
  });

  logger.info("events", "Registered events: GuildCreate, GuildDelete");
}

module.exports = { setupGuildEvents };