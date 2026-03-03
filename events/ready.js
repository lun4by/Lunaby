const mongoClient = require('../services/database/mongoClient.js');
const mariaClient = require('../services/database/mariaClient.js');
const MariaBlacklistDB = require('../services/database/MariaBlacklistDB.js');
const PrefixDB = require('../services/database/PrefixDB.js');
const MariaModDB = require('../services/database/MariaModDB.js');
const storageDB = require('../services/storagedb.js');
const initSystem = require('../services/initSystem.js');
const GuildProfileDB = require('../services/guildprofiledb.js');
const { syncAllGuilds } = require('../handlers/guildHandler');
const CommandsJSONService = require('../services/CommandsJSONService');
const logger = require('../utils/logger.js');

async function startbot(client, loadCommands) {
  client.once('ready', async () => {
    console.log(`
    ██╗     ██╗   ██╗███╗   ██╗ █████╗ ██████╗ ██╗   ██╗
    ██║     ██║   ██║████╗  ██║██╔══██╗██╔══██╗╚██╗ ██╔╝
    ██║     ██║   ██║██╔██╗ ██║███████║██████╔╝ ╚████╔╝ 
    ██║     ██║   ██║██║╚██╗██║██╔══██║██╔══██╗  ╚██╔╝  
    ███████╗╚██████╔╝██║ ╚████║██║  ██║██████╔╝   ██║   
    ╚══════╝ ╚═════╝ ╚═╝  ╚═══╝╚═╝  ╚═╝╚═════╝    ╚═╝   
    `);

    try {
      await mongoClient.connect();
      await storageDB.setupCollections();
      initSystem.markReady('mongodb');
      logger.info('SYSTEM', `Đã kết nối thành công đến MongoDB!`);
    } catch (error) {
      logger.error('SYSTEM', 'Lỗi khi khởi tạo kết nối MongoDB:', error);
      initSystem.markReady('mongodb');
      logger.warn('SYSTEM', 'Bot sẽ hoạt động mà không có khả năng lưu trữ lâu dài.');
    }

    try {
      await mariaClient.connect();
      await MariaBlacklistDB.initTables();
      await MariaBlacklistDB.initializeDefaultBlacklist();
      await PrefixDB.initTables();
      await MariaModDB.initTables();
      initSystem.markReady('mariadb');
      logger.info('SYSTEM', 'Đã kết nối thành công đến MariaDB!');
    } catch (error) {
      logger.error('SYSTEM', 'Lỗi khi khởi tạo MariaDB:', error);
      initSystem.markReady('mariadb');
      logger.warn('SYSTEM', 'Bot sẽ hoạt động mà không có MariaDB (blacklist/prefix disabled).');
    }

    try {
      await storageDB.initializeConversationHistory();
      initSystem.markReady('conversationHistory');
    } catch (error) {
      logger.error('SYSTEM', 'Lỗi khi khởi tạo cấu trúc lịch sử cuộc trò chuyện:', error);
      initSystem.markReady('conversationHistory');
    }

    try {
      await storageDB.initializeProfiles();
      const db = mongoClient.getDb();
      await db.collection('user_profiles').createIndex({ 'data.global_xp': -1 });
      await db.collection('user_profiles').createIndex({ 'data.xp.id': 1 });
      initSystem.markReady('profiles');
    } catch (error) {
      logger.error('SYSTEM', 'Lỗi khi khởi tạo hệ thống profile người dùng:', error);
      initSystem.markReady('profiles');
    }

    try {
      const commandCount = loadCommands(client);
      logger.info('SYSTEM', `Đã tải tổng cộng ${commandCount} lệnh!`);
      initSystem.markReady('commands');
    } catch (error) {
      logger.error('SYSTEM', 'Lỗi khi tải commands:', error);
      initSystem.markReady('commands');
    }

    try {
      const success = await CommandsJSONService.generateCommandsJSON();
      if (success) {
        logger.info('SYSTEM', 'Đã tự động tạo file JSON lệnh thành công!');
      } else {
        logger.warn('SYSTEM', 'Không thể tạo file JSON lệnh tự động');
      }
    } catch (error) {
      logger.error('SYSTEM', 'Lỗi khi tạo file JSON lệnh tự động:', error);
    }

    try {
      await GuildProfileDB.setupGuildProfileIndexes();
      for (const [guildId, guild] of client.guilds.cache) {
        try {
          await GuildProfileDB.getGuildProfile(guildId);
        } catch (err) {
          logger.error('SYSTEM', `Lỗi khi tải cấu hình guild ${guild.name}:`, err);
        }
      }
      initSystem.markReady('guildProfiles');
    } catch (error) {
      logger.error('SYSTEM', 'Lỗi khi khởi tạo hệ thống profile guild:', error);
      initSystem.markReady('guildProfiles');
    }

    try {
      await syncAllGuilds(client);
    } catch (error) {
      logger.error('SYSTEM', 'Lỗi khi đồng bộ guilds:', error);
      logger.error('SYSTEM', 'Stack trace:', error.stack);
    }



    client.user.setPresence({
      activities: [{ name: '/help', type: 1 }],
      status: 'online'
    });

    logger.info('SYSTEM', `Bot đã sẵn sàng! Đã đăng nhập với tên ${client.user.tag}`);
  });
}

module.exports = { startbot };
