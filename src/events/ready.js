const mongoClient = require('../services/database/mongoClient.js');
const mariaClient = require('../services/database/mariaClient.js');
const MariaBlacklistDB = require('../services/database/MariaBlacklistDB.js');
const PrefixDB = require('../services/database/PrefixDB.js');
const MariaModDB = require('../services/database/MariaModDB.js');
const storageDB = require('../services/database/storagedb.js');
const initSystem = require('../services/system/initSystem.js');
const { syncAllGuilds } = require('../handlers/guildHandler');
const CommandsJSONService = require('../services/system/CommandsJSONService');
const QuotaService = require('../services/user/QuotaService.js');
const RoleService = require('../services/user/RoleService.js');
const BlacklistService = require('../services/user/BlacklistService.js');
const { notifyBlacklistedGuildAndLeave } = require('../utils/blacklistUtils');
const { loadLVoiceCache, cleanupZombieChannels } = require('./voiceStateUpdate.js');
const logger = require('../utils/logger.js');
const { getSystemMetrics } = require('../utils/systemMetrics.js');

function updatePresence(client, shardId) {
  const { cpu, ram } = getSystemMetrics();

  client.user.setPresence({
    activities: [{
      name: `CPU ${cpu}% | RAM ${ram}% | Shard ${shardId}`,
      type: 3,
    }],
    status: 'online'
  });
}

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
      initSystem.markReady('profiles');
    } catch (error) {
      logger.error('SYSTEM', 'Profile system init failed:', error.message);
      initSystem.markReady('profiles');
    }

    try {
      const commandCount = loadCommands(client);
      logger.info('SYSTEM', `Loaded ${commandCount} commands`);
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
          await MariaModDB.getGuildSettings(guildId);
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

    try {
      for (const guild of client.guilds.cache.values()) {
        const blacklistEntry = await BlacklistService.isGuildBlacklisted(guild.id);
        if (blacklistEntry) {
          await notifyBlacklistedGuildAndLeave(guild, blacklistEntry.reason);
        }
      }
    } catch (error) {
      logger.error('SYSTEM', 'Blacklisted guild cleanup failed:', error.message);
    }

    try {
      await loadLVoiceCache();
      await cleanupZombieChannels(client);
    } catch (error) {
      logger.error('SYSTEM', 'lvoice cache load failed:', error.message);
    }

    const shardId = client.shard?.ids[0] ?? 0;

    updatePresence(client, shardId);
    setInterval(() => updatePresence(client, shardId), 30000);

    logger.info('SYSTEM', `Bot is ready! Logged in as ${client.user.tag} | Shard ${shardId}`);
  });
}

module.exports = { startbot };
