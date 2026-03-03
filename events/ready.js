const mongoClient = require('../services/database/mongoClient.js');
const mariaClient = require('../services/database/mariaClient.js');
const MariaBlacklistDB = require('../services/database/MariaBlacklistDB.js');
const PrefixDB = require('../services/database/PrefixDB.js');
const MariaModDB = require('../services/database/MariaModDB.js');
const storageDB = require('../services/storagedb.js');
const initSystem = require('../services/initSystem.js');
const GuildProfileDB = require('../services/database/guildprofiledb.js');
const { syncAllGuilds } = require('../handlers/guildHandler');
const CommandsJSONService = require('../services/CommandsJSONService');
const QuotaService = require('../services/QuotaService.js');
const RoleService = require('../services/RoleService.js');
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
    } catch (error) {
      logger.error('SYSTEM', 'MongoDB init failed:', error.message);
      initSystem.markReady('mongodb');
    }

    try {
      await mariaClient.connect();
      await MariaBlacklistDB.initTables();
      await MariaBlacklistDB.initializeDefaultBlacklist();
      await PrefixDB.initTables();
      await MariaModDB.initTables();
      await QuotaService.initializeCollection();
      await RoleService.initializeCollection();
      initSystem.markReady('mariadb');
    } catch (error) {
      logger.error('SYSTEM', 'MariaDB init failed:', error.message);
      initSystem.markReady('mariadb');
    }

    try {
      await storageDB.initializeConversationHistory();
      initSystem.markReady('conversationHistory');
    } catch (error) {
      logger.error('SYSTEM', 'Conversation history init failed:', error.message);
      initSystem.markReady('conversationHistory');
    }

    try {
      await storageDB.initializeProfiles();
      const db = mongoClient.getDb();
      await db.collection('user_profiles').createIndex({ 'data.global_xp': -1 });
      await db.collection('user_profiles').createIndex({ 'data.xp.id': 1 });
      initSystem.markReady('profiles');
    } catch (error) {
      logger.error('SYSTEM', 'Profile system init failed:', error.message);
      initSystem.markReady('profiles');
    }

    try {
      const commandCount = loadCommands(client);
      logger.info('SYSTEM', `Đã tải ${commandCount} lệnh`);
      initSystem.markReady('commands');
    } catch (error) {
      logger.error('SYSTEM', 'Command loading failed:', error.message);
      initSystem.markReady('commands');
    }

    try {
      await CommandsJSONService.generateCommandsJSON();
    } catch (error) {
      logger.error('SYSTEM', 'JSON generation failed:', error.message);
    }

    try {
      for (const [guildId, guild] of client.guilds.cache) {
        try {
          await GuildProfileDB.getGuildProfile(guildId);
        } catch (err) {
          logger.error('SYSTEM', `Guild config error ${guild.name}:`, err.message);
        }
      }
      initSystem.markReady('guildProfiles');
    } catch (error) {
      logger.error('SYSTEM', 'Guild profiles init failed:', error.message);
      initSystem.markReady('guildProfiles');
    }

    try {
      await syncAllGuilds(client);
    } catch (error) {
      logger.error('SYSTEM', 'Guild sync failed:', error.message);
    }



    client.user.setPresence({
      activities: [{ name: '/help', type: 1 }],
      status: 'online'
    });

    logger.info('SYSTEM', `Bot đã sẵn sàng! Đã đăng nhập với tên ${client.user.tag}`);
  });
}

module.exports = { startbot };
