const VALID_LEVELS = new Set(["debug", "info", "warn", "error"]);

const defaultConfig = {
  enabled: true,
  level: "debug",
  showTimestamp: true,
  fileLogging: {
    enabled: true,
    directory: "logs",
    filename: "console.txt",
    rotateOnStartup: true,
    keepOldLogs: true,
  },
  categories: {
    command: true, command_usage: true,
    mongodb: true, mariadb: true, system: true,
    chat: true, api: true, conversation_service: true,
    conversation: true, aicore: true,
    moderation: true, message_event: true,
    guild: true, guild_event: true, guild_deploy: false,
    xp: true, fonts: true, modlog: true,
  },
};

let currentConfig = structuredClone(defaultConfig);

function cloneConfig(config) {
  return structuredClone(config);
}
  
function getConfig() {
  return cloneConfig(currentConfig);
}

function updateConfig(newConfig) {
  const nextConfig = newConfig || {};

  currentConfig = {
    ...currentConfig,
    ...nextConfig,
    fileLogging: {
      ...currentConfig.fileLogging,
      ...(nextConfig.fileLogging || {}),
    },
    categories: {
      ...currentConfig.categories,
      ...(nextConfig.categories || {}),
    },
  };

  return getConfig();
}

function setEnabled(enabled) {
  return updateConfig({ enabled: !!enabled });
}

function setLevel(level) {
  return VALID_LEVELS.has(level)
    ? updateConfig({ level })
    : getConfig();
}

function setCategoryEnabled(category, enabled) {
  if (Object.hasOwn(currentConfig.categories, category)) {
    return updateConfig({ categories: { [category]: !!enabled } });
  }
  return getConfig();
}

function resetToDefault() {
  currentConfig = cloneConfig(defaultConfig);
  return getConfig();
}

function updateFileLogging(fileConfig) {
  if (!fileConfig || typeof fileConfig !== "object") {
    return getConfig();
  }
  return updateConfig({ fileLogging: fileConfig });
}

module.exports = { getConfig, updateConfig, setEnabled, setLevel, setCategoryEnabled, resetToDefault, updateFileLogging };