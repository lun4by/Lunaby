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

async function ensureGuildSettings(guild) {
  try {
    await MariaModDB.getGuildSettings(guild.id);
    logger.info('GUILD', `Ensured guild settings for ${guild.name} in MariaDB`);
  } catch (error) {
    logger.error('GUILD', `Error ensuring guild settings for ${guild.name}:`, error);
    throw error;
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
    logger.error('GUILD', `Error finding default channel for guild ${guild.name}:`, error);
    return null;
  }
}

async function handleGuildLeave(guild) {
  logger.info('GUILD', `Bot left server: ${guild.name} (${guild.id})`);
  await sendGlobalLog(guild.client, `Bot left guild: ${guild.name} (${guild.id})`);
}

async function deployCommandsToGuild(guildId, existingCommands = null, client = null) {
  const token = process.env.DISCORD_TOKEN;
  const clientId = process.env.CLIENT_ID;

  if (!token) throw new Error('DISCORD_TOKEN is not configured');
  if (!clientId) throw new Error('CLIENT_ID is not configured');

  const commands = existingCommands || (client ? getCommandsJson(client) : []);
  if (!commands?.length) {
    logger.warn('GUILD', `No commands to deploy for guild ID: ${guildId}`);
    return [];
  }

  try {
    const rest = new REST({ version: '10' }).setToken(token);
    logger.info('GUILD', `Deploying ${commands.length} commands for guild ${guildId}...`);

    const data = await rest.put(
      Routes.applicationGuildCommands(clientId, guildId),
      { body: commands }
    );

    logger.info('GUILD', `Successfully deployed ${data.length} commands for guild ${guildId}`);

    if (data.length !== commands.length) {
      logger.warn('GUILD', `Number of deployed commands (${commands.length}) differs from Discord confirmation (${data.length})`);
    }

    return data;
  } catch (error) {
    logger.error('GUILD', `Deploy error for guild ${guildId}:`, error);
    throw error;
  }
}

async function handleGuildJoin(guild, commands) {
  logger.info('GUILD', `Bot joined guild: ${guild.name} (${guild.id}) - ${guild.memberCount} members`);
  await sendGlobalLog(guild.client, `Bot joined new guild: ${guild.name} (${guild.id}) - ${guild.memberCount} members`);

  try {
    const blacklistEntry = await BlacklistService.isGuildBlacklisted(guild.id);
    if (blacklistEntry) {
      await notifyBlacklistedGuildAndLeave(guild, blacklistEntry.reason);
      return;
    }

    await ensureGuildSettings(guild);

    const commandsToRegister = commands?.length ? commands : getCommandsJson(guild.client);
    if (!commandsToRegister?.length) {
      logger.error('GUILD', `No commands to deploy for server ${guild.name}`);
      return;
    }

    await deployCommandsToGuild(guild.id, commandsToRegister, guild.client);

    const defaultChannel = findDefaultChannel(guild);
    if (defaultChannel) {
      await defaultChannel.send({
        content: `Xin chao! Lunaby da san sang ho tro server **${guild.name}**!\n`
          + 'Ban co the chat voi minh bang cach @Luna hoac su dung cac lenh slash.\n'
          + 'Cam on da them minh vao server!'
      });
    }
  } catch (error) {
    logger.error('GUILD', `Error handling new guild ${guild.name}:`, error);
  }
}

async function syncAllGuilds(client, commands = null) {
  logger.info('GUILD', 'Started syncing all guilds...');

  try {
    if (!commands && (!client.commands || client.commands.size === 0)) {
      loadCommands(client);
    }

    const guilds = client.guilds.cache;
    if (guilds.size === 0) {
      logger.warn('GUILD', 'No guilds found. Bot is not in any server.');
      return;
    }

    const commandsToRegister = commands || getCommandsJson(client);
    if (!commandsToRegister?.length) {
      logger.error('GUILD', 'No commands to deploy!');
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
        logger.error('GUILD', `Error syncing guild ${guild.name}:`, error);
      }

      try {
        await deployCommandsToGuild(guild.id, commandsToRegister, client);
        deployCount++;
        await new Promise((resolve) => setTimeout(resolve, GUILD_COMMAND_DEPLOY_DELAY_MS));
      } catch (error) {
        deployErrors++;
        logger.error('GUILD', `Deploy error for guild ${guild.name}:`, error.message);
      }
    }

    logger.info(
      'GUILD',
      `Sync complete: Sync ${syncCount}/${guilds.size}, Deploy ${deployCount}/${guilds.size}${deployErrors > 0 ? `, Error: ${deployErrors}` : ''}`
    );
  } catch (error) {
    logger.error('GUILD', 'Critical error while syncing guilds:', error);
    throw error;
  }
}

module.exports = {
  handleGuildJoin,
  handleGuildLeave,
  deployCommandsToGuild,
  syncAllGuilds,
};