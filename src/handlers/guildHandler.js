const { REST, Routes } = require('discord.js');
const mongoClient = require('../services/database/mongoClient.js');
const { getCommandsJson, loadCommands } = require('./commandHandler');
const logger = require('../utils/logger.js');
const MariaModDB = require('../services/database/MariaModDB.js');

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
    const db = await mongoClient.getDbSafe();

    const guildData = {
      guildId: guild.id,
      name: guild.name,
      memberCount: guild.memberCount,
      ownerID: guild.ownerId,
      icon: guild.iconURL(),
      joinedAt: new Date(),
      settings: {
        welcomeChannel: null,
        moderationEnabled: true,
        autoRoles: []
      },
      xp: {
        isActive: true,
        exceptions: []
      }
    };

    await db.collection('guilds').updateOne(
      { guildId: guild.id },
      { $set: guildData },
      { upsert: true }
    );

    if (guild.client?.guildProfiles) {
      guild.client.guildProfiles.set(guild.id, { xp: guildData.xp });
    }

    logger.info('GUILD', `Đã lưu thông tin server ${guild.name} vào MongoDB`);
  } catch (error) {
    logger.error('GUILD', `Lỗi khi lưu thông tin guild vào MongoDB:`, error);
  }
}


async function removeGuildFromDB(guildId) {
  try {
    const db = await mongoClient.getDbSafe();
    await db.collection('guilds').deleteOne({ guildId });
    logger.info('GUILD', `Đã xóa thông tin server ID: ${guildId} khỏi MongoDB`);
  } catch (error) {
    logger.error('GUILD', `Lỗi khi xóa guild từ MongoDB:`, error);
  }
}


async function getGuildFromDB(guildId) {
  try {
    const db = await mongoClient.getDbSafe();
    return await db.collection('guilds').findOne({ guildId });
  } catch (error) {
    logger.error('GUILD', `Lỗi khi lấy thông tin guild từ MongoDB:`, error);
    return null;
  }
}

async function updateGuildSettings(guildId, settings) {
  try {
    const db = await mongoClient.getDbSafe();
    await db.collection('guilds').updateOne(
      { guildId },
      { $set: { settings } }
    );
    logger.info('GUILD', `Đã cập nhật cài đặt cho server ID: ${guildId}`);
    return true;
  } catch (error) {
    logger.error('GUILD', `Lỗi khi cập nhật cài đặt guild:`, error);
    return false;
  }
}


function findDefaultChannel(guild) {
  try {
    const canSend = (ch) => ch.type === 0 && ch.permissionsFor(guild.members.me).has('SendMessages');
    const nameMatch = (ch) => {
      const name = ch.name.toLowerCase();
      return name.includes('general') || name.includes('chung') || name.includes('welcome');
    };

    return guild.channels.cache.find(ch => canSend(ch) && nameMatch(ch))
      || guild.channels.cache.find(canSend)
      || null;
  } catch (error) {
    logger.error('GUILD', `Lỗi khi tìm kênh mặc định cho guild ${guild.name}:`, error);
    return null;
  }
}


async function handleGuildLeave(guild) {
  logger.info('GUILD', `Bot đã rời khỏi server: ${guild.name} (${guild.id})`);
  await sendGlobalLog(guild.client, `Bot rời khỏi guild: ${guild.name} (${guild.id})`);
  try {
    await removeGuildFromDB(guild.id);
  } catch (error) {
    logger.error('GUILD', `Lỗi khi xóa thông tin server ${guild.name}:`, error);
  }
}

async function deployCommandsToGuild(guildId, existingCommands = null, client = null) {
  const token = process.env.DISCORD_TOKEN;
  const clientId = process.env.CLIENT_ID;

  if (!token) throw new Error('DISCORD_TOKEN không được thiết lập trong biến môi trường');
  if (!clientId) throw new Error('CLIENT_ID không được thiết lập trong biến môi trường');

  const commands = existingCommands || (client ? getCommandsJson(client) : []);
  if (!commands?.length) {
    logger.warn('GUILD', `Không có lệnh nào để triển khai cho guild ID: ${guildId}`);
    return [];
  }

  try {
    const rest = new REST({ version: '10' }).setToken(token);
    logger.info('GUILD', `Deploying ${commands.length} lệnh cho guild ${guildId}...`);

    const data = await rest.put(
      Routes.applicationGuildCommands(clientId, guildId),
      { body: commands }
    );

    logger.info('GUILD', `Deploy thành công ${data.length} lệnh cho guild ${guildId}`);

    if (data.length !== commands.length) {
      logger.warn('GUILD', `Số lệnh deploy (${commands.length}) khác với Discord xác nhận (${data.length})`);
    }

    return data;
  } catch (error) {
    logger.error('GUILD', `Lỗi deploy cho guild ${guildId}:`, error);
    throw error;
  }
}


async function handleGuildJoin(guild, commands) {
  logger.info('GUILD', `Bot tham gia guild: ${guild.name} (${guild.id}) - ${guild.memberCount} members`);
  await sendGlobalLog(guild.client, `Bot tham gia guild mới: ${guild.name} (${guild.id}) - ${guild.memberCount} members`);

  try {
    await storeGuildInDB(guild);

    const commandsToRegister = commands?.length ? commands : getCommandsJson(guild.client);
    if (!commandsToRegister?.length) {
      logger.error('GUILD', `Không có lệnh nào để triển khai cho server ${guild.name}`);
      return;
    }

    await deployCommandsToGuild(guild.id, commandsToRegister, guild.client);

    const defaultChannel = findDefaultChannel(guild);
    if (defaultChannel) {
      await defaultChannel.send({
        content: `Xin chào! Lunaby đã sẵn sàng hỗ trợ server **${guild.name}**!\n` +
          `Bạn có thể chat với mình bằng cách @Luna hoặc sử dụng các lệnh slash.\n` +
          `Cảm ơn đã thêm mình vào server!`
      });
    }
  } catch (error) {
    logger.error('GUILD', `Lỗi khi xử lý guild mới ${guild.name}:`, error);
  }
}


async function syncAllGuilds(client, commands = null) {
  logger.info('GUILD', 'Bắt đầu đồng bộ tất cả guilds...');

  try {
    await mongoClient.getDbSafe();

    if (!commands && (!client.commands || client.commands.size === 0)) {
      loadCommands(client);
    }

    const guilds = client.guilds.cache;
    if (guilds.size === 0) {
      logger.warn('GUILD', 'Không có guild nào. Bot chưa được thêm vào server nào.');
      return;
    }

    const commandsToRegister = commands || getCommandsJson(client);
    if (!commandsToRegister?.length) {
      logger.error('GUILD', 'Không có lệnh nào để triển khai!');
      return;
    }

    let syncCount = 0;
    let deployCount = 0;
    let deployErrors = 0;

    for (const guild of guilds.values()) {
      try {
        await storeGuildInDB(guild);
        syncCount++;
      } catch (error) {
        logger.error('GUILD', `Lỗi sync guild ${guild.name}:`, error);
      }

      try {
        await deployCommandsToGuild(guild.id, commandsToRegister, client);
        deployCount++;
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        deployErrors++;
        logger.error('GUILD', `Lỗi deploy cho guild ${guild.name}:`, error.message);
      }
    }

    logger.info('GUILD', `Đồng bộ hoàn tất: Sync ${syncCount}/${guilds.size}, Deploy ${deployCount}/${guilds.size}${deployErrors > 0 ? `, Lỗi: ${deployErrors}` : ''}`);

  } catch (error) {
    logger.error('GUILD', 'Lỗi nghiêm trọng khi đồng bộ guilds:', error);
    throw error;
  }
}

module.exports = {
  handleGuildJoin,
  handleGuildLeave,
  deployCommandsToGuild,
  syncAllGuilds,
  getGuildFromDB,
  updateGuildSettings,
  storeGuildInDB
};