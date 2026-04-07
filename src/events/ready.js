const { ActivityType } = require('discord.js');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
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
const { initializeTopgg } = require('../services/api/topggService.js');

const presenceIntervalMs = 10 * 1000;

async function runStartupStep(label, task, readyKey = null) {
  try {
    return await task();
  } catch (error) {
    logger.error('SYSTEM', `${label} failed:`, error.message);
    return null;
  } finally {
    if (readyKey) {
      initSystem.markReady(readyKey);
    }
  }
}

async function updatePresence(client, shardId) {
  if (!client?.isReady?.() || !client.user) {
    logger.warn('SYSTEM', `Skipped presence update because client is not ready yet | Shard ${shardId}`);
    return;
  }

  try {
    const { cpu, ram } = getSystemMetrics();

    await client.user.setPresence({
      activities: [{
        name: `CPU ${cpu}% | RAM ${ram}% | Shard ${shardId}`,
        type: ActivityType.Watching,
      }],
      status: 'online',
      afk: false,
    });
  } catch (error) {
    logger.error('SYSTEM', `Presence update failed on shard ${shardId}:`, error.message);
  }
}

function startPresenceUpdater(client, shardId) {
  void updatePresence(client, shardId);

  const timer = setInterval(() => {
    void updatePresence(client, shardId);
  }, presenceIntervalMs);

  timer.unref?.();
}

async function initializeMongo() {
  await mongoClient.connect();
  await storageDB.setupCollections();
}

async function initializeMaria() {
  await mariaClient.connect();

  await Promise.all([
    MariaBlacklistDB.initTables(),
    PrefixDB.initTables(),
    MariaModDB.initTables(),
    QuotaService.initializeCollection(),
    RoleService.initializeCollection(),
  ]);

  await MariaBlacklistDB.initializeDefaultBlacklist();
}

async function loadBotCommands(client, loadCommands) {
  const commandCount = await loadCommands(client);
  logger.info('SYSTEM', `Loaded ${commandCount} commands`);
}

async function warmGuildProfiles(client) {
  for (const [guildId, guild] of client.guilds.cache) {
    try {
      await MariaModDB.getGuildSettings(guildId);
    } catch (error) {
      logger.error('SYSTEM', `Guild config error ${guild.name}:`, error.message);
    }
  }
}

async function cleanupBlacklistedGuilds(client) {
  for (const guild of client.guilds.cache.values()) {
    const blacklistEntry = await BlacklistService.isGuildBlacklisted(guild.id);
    if (blacklistEntry) {
      await notifyBlacklistedGuildAndLeave(guild, blacklistEntry.reason);
    }
  }
}

function initializeDashboard() {
  const dashboardDir = path.join(__dirname, '../../dashboard');

  if (!fs.existsSync(dashboardDir)) {
    logger.warn('DASHBOARD', 'Dashboard directory not found, skipping');
    return;
  }

  const isProduction = process.env.NODE_ENV === 'production';
  const command = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const args = isProduction ? ['nuxi', 'preview'] : ['nuxi', 'dev'];
  const port = process.env.DASHBOARD_PORT || '3000';

  const dashboard = spawn(command, args, {
    cwd: dashboardDir,
    stdio: 'pipe',
    env: { ...process.env, PORT: port, NUXT_PORT: port },
  });

  dashboard.stdout.on('data', (data) => {
    const output = data.toString().trim();
    if (output) logger.info('DASHBOARD', output);
  });

  dashboard.stderr.on('data', (data) => {
    const output = data.toString().trim();
    if (output) logger.warn('DASHBOARD', output);
  });

  dashboard.on('error', (error) => {
    logger.error('DASHBOARD', `Failed to start dashboard: ${error.message}`);
  });

  dashboard.on('close', (code) => {
    if (code !== 0 && code !== null) {
      logger.error('DASHBOARD', `Dashboard process exited with code ${code}`);
    }
  });

  // Unref so the bot process can exit even if dashboard is still running
  dashboard.unref();

  logger.info('DASHBOARD', `Starting dashboard on port ${port} (${isProduction ? 'production' : 'development'})`);
}

async function initializeReadyState(client, loadCommands) {
  await Promise.all([
    runStartupStep('MongoDB init', initializeMongo, 'mongodb'),
    runStartupStep('MariaDB init', initializeMaria, 'mariadb'),
    runStartupStep('Command loading', () => loadBotCommands(client, loadCommands), 'commands'),
    runStartupStep('i18n init', () => require('../services/i18n/i18nManager').init(), 'i18n'),
  ]);

  await runStartupStep('JSON generation', () => CommandsJSONService.generateCommandsJSON());

  await Promise.all([
    runStartupStep('Conversation history init', () => storageDB.initializeConversationHistory(), 'conversationHistory'),
    runStartupStep('Profile system init', () => storageDB.initializeProfiles(), 'profiles'),
    runStartupStep('Guild profiles init', () => warmGuildProfiles(client), 'guildProfiles'),
  ]);

  await runStartupStep('Guild sync', () => syncAllGuilds(client));
  await runStartupStep('Blacklisted guild cleanup', () => cleanupBlacklistedGuilds(client));
  await runStartupStep('lvoice cache load', async () => {
    await loadLVoiceCache();
    await cleanupZombieChannels(client);
  });
  await runStartupStep('Top.gg init', () => initializeTopgg(client));
  await runStartupStep('Dashboard init', () => initializeDashboard(), 'dashboard');
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

    const shardId = client.shard?.ids[0] ?? 0;

    startPresenceUpdater(client, shardId);

    await initializeReadyState(client, loadCommands);

    logger.info('SYSTEM', `Bot is ready! Logged in as ${client.user.tag} | Shard ${shardId}`);
  });
}

module.exports = { startbot };