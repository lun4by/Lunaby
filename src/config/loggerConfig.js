const VALID_LEVELS = new Set(["debug", "info", "warn", "error"]);

const defaultConfig = {
  enabled: true,
  level: "info",
  showTimestamp: true,
  fileLogging: {
    enabled: true,
    directory: "logs",
    filename: "console.txt",
    rotateOnStartup: true,
    keepOldLogs: true,
  },
  categories: {
    MONITOR: true, NEURAL: true, COMMAND: true,
    DATABASE: true, MARIADB: true, SYSTEM: true,
    CHAT: true, API: true, CONVERSATION_SERVICE: true,
    CONVERSATION: false, PROVIDERS: true, AI_CORE: true,
    INIT_SYSTEM: true, MODERATION: true, MESSAGE_EVENT: true,
    SYSTEM_SERVICE: true, XP: false, FONTS: false,
    MODLOG: true, DEBUG: false,
  },
};

let currentConfig = structuredClone(defaultConfig);

function getConfig() {
  return { ...currentConfig };
}

function updateConfig(newConfig) {
  currentConfig = { ...currentConfig, ...newConfig };
  if (newConfig.categories) {
    currentConfig.categories = { ...currentConfig.categories, ...newConfig.categories };
  }
  return getConfig();
}

function setEnabled(enabled) {
  return updateConfig({ enabled: !!enabled });
}

function setLevel(level) {
  return VALID_LEVELS.has(level) ? updateConfig({ level }) : getConfig();
}

function setCategoryEnabled(category, enabled) {
  if (Object.hasOwn(currentConfig.categories, category)) {
    return updateConfig({ categories: { [category]: !!enabled } });
  }
  return getConfig();
}

function resetToDefault() {
  currentConfig = structuredClone(defaultConfig);
  return getConfig();
}

function updateFileLogging(fileConfig) {
  if (fileConfig) currentConfig.fileLogging = { ...currentConfig.fileLogging, ...fileConfig };
  return getConfig();
}

module.exports = { getConfig, updateConfig, setEnabled, setLevel, setCategoryEnabled, resetToDefault, updateFileLogging };