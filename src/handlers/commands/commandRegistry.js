const fs = require('fs');
const path = require('path');
const logger = require('../../utils/logger.js');

let commandsJsonCache = null;

function clearModuleFromCache(modulePath) {
  try {
    delete require.cache[require.resolve(modulePath)];
  } catch (_) {
  }
}

function isValidCommandModule(command) {
  return Boolean(command && 'data' in command && 'execute' in command);
}

function resolveCommandCategory(filePath) {
  return path.basename(path.dirname(filePath));
}

function registerCommand(client, filePath, commandsJson) {
  clearModuleFromCache(filePath);

  const command = require(filePath);
  if (!isValidCommandModule(command)) {
    logger.warn('command', `Command at ${filePath} is missing required property "data" or "execute"`);
    return;
  }

  const commandName = command.data.name;
  if (client.commands.has(commandName)) {
    logger.warn('command', `Command "${commandName}" already exists and will be overwritten by ${filePath}`);
  }

  const jsonData = command.data.toJSON();
  if (!jsonData || typeof jsonData !== 'object') {
    logger.error('command', `Command "${commandName}" has invalid toJSON():`, jsonData);
    return;
  }

  if (!jsonData.name || !jsonData.description) {
    logger.error('command', `Command "${commandName}" is missing name or description:`, jsonData);
    return;
  }

  command.category = resolveCommandCategory(filePath);
  client.commands.set(commandName, command);
  commandsJson.push(jsonData);
}

function loadCommandsFromDirectory(client, directoryPath, commandsJson) {
  const items = fs.readdirSync(directoryPath, { withFileTypes: true });

  for (const item of items) {
    const itemPath = path.join(directoryPath, item.name);

    if (item.isDirectory()) {
      loadCommandsFromDirectory(client, itemPath, commandsJson);
      continue;
    }

    if (!item.name.endsWith('.js')) {
      continue;
    }

    try {
      registerCommand(client, itemPath, commandsJson);
    } catch (error) {
      logger.error('command', `Failed to load command from ${itemPath}:`, error);
    }
  }
}

function loadCommands(client) {
  const commandsPath = path.join(__dirname, '..', '..', 'commands');
  const commandsJson = [];

  logger.info('command', 'Starting command load');

  client.commands.clear();
  loadCommandsFromDirectory(client, commandsPath, commandsJson);

  commandsJsonCache = commandsJson;

  logger.info('command', `Loaded a total of ${client.commands.size} commands`);
  if (!commandsJson.length) {
    logger.warn('command', 'No commands were loaded');
  }

  return client.commands.size;
}

function getCommandsJson(client) {
  if (!commandsJsonCache) {
    loadCommands(client);
  }

  return commandsJsonCache;
}

function getCommandByName(client, commandName) {
  return client.commands.get(commandName);
}

function findCommandByPrefix(client, name) {
  if (client.commands.has(name)) {
    return client.commands.get(name);
  }

  for (const [, command] of client.commands) {
    if (!command.prefix) {
      continue;
    }

    if (command.prefix.name === name || command.prefix.aliases?.includes(name)) {
      return command;
    }
  }

  return null;
}

module.exports = {
  findCommandByPrefix,
  getCommandByName,
  getCommandsJson,
  loadCommands,
};