const { REST, Routes } = require('discord.js');
const { getCommandsJson, loadCommands } = require('./commandHandler');
const BlacklistService = require('../services/user/BlacklistService');
const { notifyBlacklistedGuildAndLeave } = require('../utils/blacklistUtils');
const logger = require('../utils/logger.js');
const MariaModDB = require('../services/database/MariaModDB.js');
const { getCachedGuildSettings } = require('../utils/guildLocale.js');
const { hasChannelPermission } = require('../utils/permissionUtils.js');

const guildCommandDeployDelayMs = 1000;
const defaultGuildProfile = { xp: { isActive: false, exceptions: [] } };

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
    const guildSettings = await getCachedGuildSettings(guild.id);

    if (guild.client && !guild.client.guildProfiles) {
      guild.client.guildProfiles = new Map();
    }

    if (guild.client?.guildProfiles) {
      guild.client.guildProfiles.set(guild.id, {
        xp: guildSettings?.xp || defaultGuildProfile.xp
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


async function ensureGuildAllowed(guild) {
  const blacklistEntry = await BlacklistService.isGuildBlacklisted(guild.id);
  if (!blacklistEntry) {
    return true;
  }

  await notifyBlacklistedGuildAndLeave(guild, blacklistEntry.reason);
  return false;
}

function resolveCommandsToRegister(client, commands) {
  return commands?.length ? commands : getCommandsJson(client);
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function findDefaultChannel(guild) {
  try {
    const canSend = (channel) =>
      channel.type === 0 && hasChannelPermission(channel, guild.members.me, 'SendMessages');

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
    if (!(await ensureGuildAllowed(guild))) {
      return;
    }

    await ensureGuildSettings(guild);

    const commandsToRegister = resolveCommandsToRegister(guild.client, commands);
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

    const commandsToRegister = resolveCommandsToRegister(client, commands);
    if (!commandsToRegister?.length) {
      logger.error('guild_deploy', 'No commands to deploy!');
      return;
    }

    let syncCount = 0;
    let deployCount = 0;
    let deployErrors = 0;

    for (const guild of guilds.values()) {
      if (!(await ensureGuildAllowed(guild))) {
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
        await sleep(guildCommandDeployDelayMs);
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
