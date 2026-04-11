const fs = require('fs');
const path = require('path');
const consentService = require('../services/user/consentService');
const { handlePermissionError, isMissingPermissionError } = require('../utils/permissionUtils');
const MariaModDB = require('../services/database/MariaModDB');
const QuotaService = require('../services/user/QuotaService');
const RoleService = require('../services/user/RoleService');
const CooldownService = require('../services/user/CooldownService');
const logger = require('../utils/logger.js');
const emojis = require('../config/emojis');
const i18nManager = require('../services/i18n/i18nManager');
const { getGuildLocale } = require('../utils/guildLocale.js');

let commandsJsonCache = null;

const loadCommandsFromDirectory = (client, dir, commandsJson) => {
  const items = fs.readdirSync(dir, { withFileTypes: true });

  for (const item of items) {
    const itemPath = path.join(dir, item.name);

    if (item.isDirectory()) {
      loadCommandsFromDirectory(client, itemPath, commandsJson);
    } else if (item.name.endsWith('.js')) {
      try {
        try {
          delete require.cache[require.resolve(itemPath)];
        } catch (_) {
        }

        const command = require(itemPath);
        if ('data' in command && 'execute' in command) {
          const commandName = command.data.name;
          if (client.commands.has(commandName)) {
            logger.warn('command', `Command "${commandName}" already exists and will be overwritten by ${itemPath}`);
          }

          try {
            const jsonData = command.data.toJSON();
            if (!jsonData || typeof jsonData !== 'object') {
              logger.error('command', `Command "${commandName}" has invalid toJSON():`, jsonData);
              continue;
            }
            if (!jsonData.name || !jsonData.description) {
              logger.error('command', `Command "${commandName}" is missing name or description:`, jsonData);
              continue;
            }

            const dirParts = dir.split(path.sep);
            command.category = dirParts[dirParts.length - 1];

            client.commands.set(commandName, command);
            commandsJson.push(jsonData);
          } catch (jsonError) {
            logger.error('command', `Error converting command "${commandName}" to json:`, jsonError);
            continue;
          }
        } else {
          logger.warn('command', `Command at ${itemPath} is missing required property "data" or "execute" `);
        }
      } catch (error) {
        logger.error('command', `Failed to load command from ${itemPath}:`, error);
      }
    }
  }
};

const loadCommands = (client) => {
  const commandsPath = path.join(__dirname, '../commands');
  const commandsJson = [];
  logger.info('command', 'starting command load');
  client.commands.clear();
  loadCommandsFromDirectory(client, commandsPath, commandsJson);
  commandsJsonCache = commandsJson;
  logger.info('command', `loaded A total OF ${client.commands.size} commands`);
  if (!commandsJson.length) logger.warn('command', 'NO commands were loaded!');
  return client.commands.size;
};

const getCommandsJson = (client) => {
  if (!commandsJsonCache) loadCommands(client);
  return commandsJsonCache;
};

const handleCommand = async (interaction, client) => {
  if (!client.commands.size) {
    logger.warn('command', 'Commands not loaded, reloading...');
    loadCommands(client);
  }
  const command = client.commands.get(interaction.commandName);
  if (!command) {
    logger.error('command', `No command found matching ${interaction.commandName}.`);
    return;
  }

  try {
    logger.info('command',
      `Handling /${interaction.commandName} | user=${interaction.user?.tag} (${interaction.user?.id}) | guild=${interaction.guild?.name || 'DM'} (${interaction.guildId || 'DM'}) | channel=${interaction.channel?.name || 'N/A'} (${interaction.channelId || 'N/A'})`
    );

    const locale = interaction.guildId ? await getGuildLocale(interaction.guildId) : 'vi';
    if (interaction.guildId) {
      logger.info('command', `Guild locale resolved for /${interaction.commandName}: ${locale}`);
    }
    logger.info('command', `Effective locale for /${interaction.commandName}: ${locale} | i18nInitialized=${Boolean(i18nManager.isInitialized)}`);

    interaction.t = (key, options) => i18nManager.t(key, locale, options);

    logger.info('command_usage', `[slash] [Server: ${interaction.guild?.name || 'DM'}] [Channel: ${interaction.channel?.name || 'N/A'}] User ${interaction.user.tag} (${interaction.user.id}) used: /${interaction.commandName}`
    );

    if (interaction.guildId) {
      const isDisabled = await MariaModDB.isCommandDisabled(interaction.guildId, interaction.channelId, interaction.commandName);
      if (isDisabled) {
        return interaction.reply({ content: `${emojis.error} ${interaction.t('system.command_disabled_in_channel')}`, ephemeral: true });
      }
    }

    const userRole = await RoleService.getUserRole(interaction.user.id);
    const isPrivileged = userRole === 'owner' || userRole === 'admin';
    logger.info('command', `Role resolved for ${interaction.user.id}: ${userRole}`);

    const isLocked = await MariaModDB.isCommandLocked(interaction.commandName);
    if (isLocked && !isPrivileged) {
      return interaction.reply({ content: `${emojis.error} ${interaction.t('system.command_locked_for_maintenance')}`, ephemeral: true });
    }

    if (command.prefix?.adminOnly && !isPrivileged) {
      return interaction.reply({ content: `${emojis.error} Bạn không có quyền sử dụng lệnh này.`, ephemeral: true });
    }

    if (command.data && command.data.default_member_permissions) {
      const requiredPermissions = BigInt(command.data.default_member_permissions);
      if (!interaction.memberPermissions.has(requiredPermissions)) {
        return interaction.reply({ content: `${emojis.error} ${interaction.t('system.missing_server_permissions')}`, ephemeral: true });
      }
    }

    if (!isPrivileged) {
      const cooldownTime = command.cooldown ?? CooldownService.DEFAULT_COOLDOWN;
      const { onCooldown, remaining, expiresAtUnix } = CooldownService.check(interaction.user.id, interaction.commandName, cooldownTime);
      if (onCooldown) {
        await interaction.reply({
          content: interaction.t('system.cooldown_wait', { expiresAtUnix }),
          ephemeral: true,
        });
        setTimeout(() => interaction.deleteReply().catch(() => { }), remaining * 1000);
        return;
      }
    }

    const hasConsented = await consentService.hasUserConsented(interaction.user.id);
    logger.info('command', `Consent state for ${interaction.user.id}: ${hasConsented}`);

    if (!hasConsented) {
      try {
        const consentData = consentService.createConsentEmbed(interaction.user);
        await interaction.reply(consentData);
      } catch (error) {
        if (isMissingPermissionError(error)) {
          await handlePermissionError(interaction, 'embedLinks', interaction.user.username, 'reply');
        } else {
          throw error;
        }
      }
      return;
    }

    logger.info('command', `Executing handler for /${interaction.commandName}`);
    await command.execute(interaction);

    const cooldownTime = command.cooldown ?? CooldownService.DEFAULT_COOLDOWN;
    CooldownService.set(interaction.user.id, interaction.commandName, cooldownTime);
  } catch (error) {
    logger.error('command',
      `Error executing command ${interaction.commandName} | replied=${interaction.replied} | deferred=${interaction.deferred} | localeBound=${typeof interaction.t === 'function'}`,
      {
        userId: interaction.user?.id,
        userTag: interaction.user?.tag,
        guildId: interaction.guildId,
        guildName: interaction.guild?.name,
        channelId: interaction.channelId,
        channelName: interaction.channel?.name,
        commandName: interaction.commandName,
      },
      error
    );
    const errPayload = { content: `${emojis.error} ${interaction.t('system.command_execution_failed')}`, ephemeral: true };
    const respond = interaction.replied || interaction.deferred
      ? interaction.followUp(errPayload)
      : interaction.reply(errPayload);
    await respond.catch(() => { });
  }
};

module.exports = {
  loadCommands,
  handleCommand,
  getCommandsJson
};