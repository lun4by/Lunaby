const { REST, Routes } = require('discord.js');
const { getCommandsJson, loadCommands } = require('./commandHandler');
const BlacklistService = require('../services/user/BlacklistService');
const { notifyBlacklistedGuildAndLeave } = require('../utils/blacklistUtils');
const logger = require('../utils/logger.js');
const MariaModDB = require('../services/database/MariaModDB.js');

const GUILD_COMMAND_DEPLOY_DELAY_MS = 1000;

const sendGlobalLog = async (client, message) => {
  const logChannelId = await MariaModDB.getBotSetting('global_log_channel');
  if (!logChannelId) return;

  const logChannel = await client.channels.fetch(logChannelId).catch(() => null);
  if (logChannel?.isTextBased()) {
    await logChannel.send(message);
  }
};


async function storeGuildInDB(guild) {
  try {
    const guildSettings = await MariaModDB.getGuildSettings(guild.id);

    if (guild.client && !guild.client.guildProfiles) {
      guild.client.guildProfiles = new Map();
    }

    if (guild.client?.guildProfiles) {
      guild.client.guildProfiles.set(guild.id, {
        xp: guildSettings?.xp || { isActive: false, exceptions: [] }
      });
    }

    logger.info('guild_deploy', `Synchronized server config for ${guild.name} to MariaDB`);
    return guildSettings;
  } catch (error) {
    logger.error('guild_deploy', `Error while syncing guild config to MariaDB:`, error);
    throw error;
  }
}

async function ensureGuildSettings(guild) {
  return storeGuildInDB(guild);
}

async function warmGuildProfiles(client) {
  if (!client?.guilds?.cache) return;

  if (!client.guildProfiles) {
    client.guildProfiles = new Map();
  }

  let warmedCount = 0;
  for (const guild of client.guilds.cache.values()) {
    try {
      await ensureGuildSettings(guild);
      warmedCount++;
    } catch (error) {
      logger.error('guild_deploy', `Error while warming guild profile for ${guild.name}:`, error);
    }
  }

  logger.info('guild_deploy', `Guild profiles warmup completed: ${warmedCount}/${client.guilds.cache.size}`);
}


async function removeGuildFromDB(guildId) {
  try {
    await MariaModDB.deleteGuildData(guildId);
    logger.info('guild_deploy', `Deleted server data with ID: ${guildId} from MariaDB`);
  } catch (error) {
    logger.error('guild_deploy', `Error while deleting guild data from MariaDB:`, error);
  }
}


async function getGuildFromDB(guildId) {
  try {
    return await MariaModDB.getGuildSettings(guildId);
  } catch (error) {
    logger.error('guild_deploy', `Error while fetching guild data from MariaDB:`, error);
    return null;
  }
}

async function updateGuildSettings(guildId, settings) {
  try {
    await MariaModDB.updateGuildSettings(guildId, settings);
    logger.info('guild_deploy', `Updated settings for server ID: ${guildId}`);
    return true;
  } catch (error) {
    logger.error('guild_deploy', `Error while updating guild settings:`, error);
    return false;
  }
}

function findDefaultChannel(guild) {
  try {
    const canSend = (channel) =>
      channel.type === 0 && channel.permissionsFor(guild.members.me).has('SendMessages');

    const hasPreferredName = (channel) => {
      const name = channel.name.toLowerCase();
      return name.includes('general') || name.includes('chung') || name.includes('welcome');
    };

    return guild.channels.cache.find((channel) => canSend(channel) && hasPreferredName(channel))
      || guild.channels.cache.find(canSend)
      || null;
  } catch (error) {
    logger.error('guild_deploy', `Error while finding default channel for guild ${guild.name}:`, error);
    return null;
  }
}

async function handleGuildLeave(guild) {
  await sendGlobalLog(guild.client, `Bot rời khỏi guild: ${guild.name} (${guild.id})`);
  try {
    await removeGuildFromDB(guild.id);
  } catch (error) {
    logger.error('guild_deploy', `Error while deleting server data for ${guild.name}:`, error);
  }
}

async function deployCommandsToGuild(guildId, existingCommands = null, client = null) {
  const token = process.env.DISCORD_TOKEN;
  const clientId = process.env.CLIENT_ID;

  if (!token) throw new Error('DISCORD_TOKEN is not configured');
  if (!clientId) throw new Error('CLIENT_ID is not configured');

  const commands = existingCommands || (client ? getCommandsJson(client) : []);
  if (!commands?.length) {
    logger.warn('guild', `No commands to deploy for guild ID: ${guildId}`);
    return [];
  }

  try {
    const rest = new REST({ version: '10' }).setToken(token);
    logger.info('guild_deploy', `Deploying ${commands.length} commands for guild ${guildId}...`);

    const data = await rest.put(
      Routes.applicationGuildCommands(clientId, guildId),
      { body: commands }
    );

    logger.info('guild_deploy', `Deploy succeeded: ${data.length} commands for guild ${guildId}`);

    if (data.length !== commands.length) {
      logger.warn('guild_deploy', `Deployed command count (${commands.length}) differs from Discord confirmed count (${data.length})`);
    }

    return data;
  } catch (error) {
    logger.error('guild_deploy', `Error deploying commands for guild ${guildId}:`, error);
    throw error;
  }
}

async function handleGuildJoin(guild, commands) {
  await sendGlobalLog(guild.client, `Bot tham gia guild mới: ${guild.name} (${guild.id}) - ${guild.memberCount} members`);

  try {
    const blacklistEntry = await BlacklistService.isGuildBlacklisted(guild.id);
    if (blacklistEntry) {
      await notifyBlacklistedGuildAndLeave(guild, blacklistEntry.reason);
      return;
    }

    await ensureGuildSettings(guild);

    const commandsToRegister = commands?.length ? commands : getCommandsJson(guild.client);
    if (!commandsToRegister?.length) {
      logger.error('guild_deploy', `No commands to deploy for server ${guild.name}`);
      return;
    }

    await deployCommandsToGuild(guild.id, commandsToRegister, guild.client);

    const defaultChannel = findDefaultChannel(guild);
    if (defaultChannel) {
      await defaultChannel.send({
        content: `Xin chào! Lunaby đã sẵn sàng hỗ trợ server **${guild.name}**!\n`
          + 'Bạn có thể chat với mình bằng cách @Luna hoặc sử dụng các lệnh slash.\n'
          + 'Cảm ơn đã thêm mình vào server!',
      });
    }
  } catch (error) {
    logger.error('guild_deploy', `Error while processing new guild ${guild.name}:`, error);
  }
}

async function syncAllGuilds(client, commands = null) {
  logger.info('guild_deploy', 'Starting synchronization for all guilds...');

  try {
    if (!commands && (!client.commands || client.commands.size === 0)) {
      loadCommands(client);
    }

    const guilds = client.guilds.cache;
    if (guilds.size === 0) {
      logger.warn('guild_deploy', 'No guilds found. The bot has not been added to any server yet.');
      return;
    }

    const commandsToRegister = commands || getCommandsJson(client);
    if (!commandsToRegister?.length) {
      logger.error('guild_deploy', 'No commands to deploy!');
      return;
    }

    let syncCount = 0;
    let deployCount = 0;
    let deployErrors = 0;

    for (const guild of guilds.values()) {
      const blacklistEntry = await BlacklistService.isGuildBlacklisted(guild.id);
      if (blacklistEntry) {
        await notifyBlacklistedGuildAndLeave(guild, blacklistEntry.reason);
        continue;
      }

      try {
        await ensureGuildSettings(guild);
        syncCount++;
      } catch (error) {
        logger.error('guild_deploy', `Error syncing guild ${guild.name}:`, error);
      }

      try {
        await deployCommandsToGuild(guild.id, commandsToRegister, client);
        deployCount++;
        await new Promise((resolve) => setTimeout(resolve, GUILD_COMMAND_DEPLOY_DELAY_MS));
      } catch (error) {
        deployErrors++;
        logger.error('guild_deploy', `Error deploying commands for guild ${guild.name}:`, error.message);
      }
    }

    logger.info('guild_deploy', `Synchronization completed: Sync ${syncCount}/${guilds.size}, Deploy ${deployCount}/${guilds.size}${deployErrors > 0 ? `, Errors: ${deployErrors}` : ''}`);

  } catch (error) {
    logger.error('guild_deploy', 'Critical error while syncing guilds:', error);
    throw error;
  }
}

module.exports = {
  handleGuildJoin,
  handleGuildLeave,
  deployCommandsToGuild,
  ensureGuildSettings,
  warmGuildProfiles,
  syncAllGuilds,
};