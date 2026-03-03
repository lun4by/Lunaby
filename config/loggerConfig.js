

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
    MONITOR: true,
    NEURAL: true,
    COMMAND: true,
    DATABASE: true,
    MARIADB: true,
    SYSTEM: true,
    CHAT: true,
    API: true,
    CONVERSATION_SERVICE: true,
    CONVERSATION: false,
    PROVIDERS: true,
    AI_CORE: true,
    INIT_SYSTEM: true,
    MODERATION: true,
    MESSAGE_EVENT: true,
    SYSTEM_SERVICE: true,
    XP: false,
    FONTS: false,
    MODLOG: true,
    DEBUG: false,
  },
};

// Cấu hình hiện tại (có thể được thay đổi trong quá trình chạy)
let currentConfig = { ...defaultConfig };


function getConfig() {
  return { ...currentConfig };
}


function updateConfig(newConfig) {
  currentConfig = { ...currentConfig, ...newConfig };

  // Cập nhật categories nếu có
  if (newConfig.categories) {
    currentConfig.categories = {
      ...currentConfig.categories,
      ...newConfig.categories,
    };
  }

  return getConfig();
}


function updateFileLogging(fileConfig) {
  if (fileConfig) {
    currentConfig.fileLogging = { ...currentConfig.fileLogging, ...fileConfig };
  }
  return getConfig();
}


function setEnabled(enabled) {
  return updateConfig({ enabled: !!enabled });
}


function setLevel(level) {
  if (["debug", "info", "warn", "error"].includes(level)) {
    return updateConfig({ level });
  }
  return getConfig();
}


function setCategoryEnabled(category, enabled) {
  if (currentConfig.categories.hasOwnProperty(category)) {
    const categories = { ...currentConfig.categories };
    categories[category] = !!enabled;
    return updateConfig({ categories });
  }
  return getConfig();
}


function resetToDefault() {
  currentConfig = { ...defaultConfig };
  return getConfig();
}

module.exports = {
  getConfig,
  updateConfig,
  setEnabled,
  setLevel,
  setCategoryEnabled,
  resetToDefault,
  updateFileLogging,
};
