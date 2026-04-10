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

    if (guild.client?.guildProfiles) {
      guild.client.guildProfiles.set(guild.id, {
        xp: guildSettings?.xp || { isActive: false, exceptions: [] }
      });
    }

    logger.info('GUILD_DEPLOY', `Đã đồng bộ cấu hình server ${guild.name} vào MariaDB`);
  } catch (error) {
    logger.error('GUILD_DEPLOY', `Lỗi khi đồng bộ cấu hình guild vào MariaDB:`, error);
  }
}


async function removeGuildFromDB(guildId) {
  try {
    await MariaModDB.deleteGuildData(guildId);
    logger.info('GUILD_DEPLOY', `Đã xóa dữ liệu server ID: ${guildId} khỏi MariaDB`);
  } catch (error) {
    logger.error('GUILD_DEPLOY', `Lỗi khi xóa dữ liệu guild từ MariaDB:`, error);
  }
}


async function getGuildFromDB(guildId) {
  try {
    return await MariaModDB.getGuildSettings(guildId);
  } catch (error) {
    logger.error('GUILD_DEPLOY', `Lỗi khi lấy thông tin guild từ MariaDB:`, error);
    return null;
  }
}

async function updateGuildSettings(guildId, settings) {
  try {
    await MariaModDB.updateGuildSettings(guildId, settings);
    logger.info('GUILD_DEPLOY', `Đã cập nhật cài đặt cho server ID: ${guildId}`);
    return true;
  } catch (error) {
    logger.error('GUILD_DEPLOY', `Lỗi khi cập nhật cài đặt guild:`, error);
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
    logger.error('GUILD_DEPLOY', `Lỗi khi tìm kênh mặc định cho guild ${guild.name}:`, error);
    return null;
  }
}

async function handleGuildLeave(guild) {
  await sendGlobalLog(guild.client, `Bot rời khỏi guild: ${guild.name} (${guild.id})`);
  try {
    await removeGuildFromDB(guild.id);
  } catch (error) {
    logger.error('GUILD_DEPLOY', `Lỗi khi xóa thông tin server ${guild.name}:`, error);
  }
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
    logger.info('GUILD_DEPLOY', `Deploying ${commands.length} lệnh cho guild ${guildId}...`);

    const data = await rest.put(
      Routes.applicationGuildCommands(clientId, guildId),
      { body: commands }
    );

    logger.info('GUILD_DEPLOY', `Deploy thành công ${data.length} lệnh cho guild ${guildId}`);

    if (data.length !== commands.length) {
      logger.warn('GUILD_DEPLOY', `Số lệnh deploy (${commands.length}) khác với Discord xác nhận (${data.length})`);
    }

    return data;
  } catch (error) {
    logger.error('GUILD_DEPLOY', `Lỗi deploy cho guild ${guildId}:`, error);
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
      logger.error('GUILD_DEPLOY', `Không có lệnh nào để triển khai cho server ${guild.name}`);
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
    logger.error('GUILD_DEPLOY', `Lỗi khi xử lý guild mới ${guild.name}:`, error);
  }
}

async function syncAllGuilds(client, commands = null) {
  logger.info('GUILD_DEPLOY', 'Bắt đầu đồng bộ tất cả guilds...');

  try {
    if (!commands && (!client.commands || client.commands.size === 0)) {
      loadCommands(client);
    }

    const guilds = client.guilds.cache;
    if (guilds.size === 0) {
      logger.warn('GUILD_DEPLOY', 'Không có guild nào. Bot chưa được thêm vào server nào.');
      return;
    }

    const commandsToRegister = commands || getCommandsJson(client);
    if (!commandsToRegister?.length) {
      logger.error('GUILD_DEPLOY', 'Không có lệnh nào để triển khai!');
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
        logger.error('GUILD_DEPLOY', `Lỗi sync guild ${guild.name}:`, error);
      }

      try {
        await deployCommandsToGuild(guild.id, commandsToRegister, client);
        deployCount++;
        await new Promise((resolve) => setTimeout(resolve, GUILD_COMMAND_DEPLOY_DELAY_MS));
      } catch (error) {
        deployErrors++;
        logger.error('GUILD_DEPLOY', `Lỗi deploy cho guild ${guild.name}:`, error.message);
      }
    }

    logger.info('GUILD_DEPLOY', `Đồng bộ hoàn tất: Sync ${syncCount}/${guilds.size}, Deploy ${deployCount}/${guilds.size}${deployErrors > 0 ? `, Lỗi: ${deployErrors}` : ''}`);

  } catch (error) {
    logger.error('GUILD_DEPLOY', 'Lỗi nghiêm trọng khi đồng bộ guilds:', error);
    throw error;
  }
}

module.exports = {
  handleGuildJoin,
  handleGuildLeave,
  deployCommandsToGuild,
  syncAllGuilds,
};