const fs = require("fs");
const path = require("path");

const loggerConfig = require("../config/loggerConfig.js");

const LOG_LEVELS = {
  debug: { priority: 0, color: '\x1b[36m' },
  info: { priority: 1, color: '\x1b[32m' },
  warn: { priority: 2, color: '\x1b[33m' },
  error: { priority: 3, color: '\x1b[31m' },
};

const RESET_COLOR = '\x1b[0m';

let logStream = null;


async function initializeFileLogging() {
  try {
    const config = loggerConfig.getConfig();
    if (!config.fileLogging.enabled) return;

    const logDir = path.join(process.cwd(), config.fileLogging.directory);
    fs.mkdirSync(logDir, { recursive: true });

    const currentLogFile = path.join(logDir, config.fileLogging.filename);

    if (fs.existsSync(currentLogFile) && config.fileLogging.rotateOnStartup) {
      const stats = fs.statSync(currentLogFile);
      const oldTimestamp = stats.mtime.toISOString().replace(/[:.]/g, "-");
      const oldLogFile = path.join(logDir, `console_${oldTimestamp}.old`);
      fs.renameSync(currentLogFile, oldLogFile);
      info("SYSTEM", `Đã đổi tên file log cũ thành: ${oldLogFile}`);
    }

    logStream = fs.createWriteStream(currentLogFile, { flags: "a" });

    const startupMessage = `\nLUNABY AI STARTUP LOG\nStartup Time: ${new Date().toISOString()}\nEnvironment: ${process.env.NODE_ENV || "development"
      }\n=========================\n\n`;
    logStream.write(startupMessage);

    process.on("exit", () => logStream?.end("\nLUNABY AI SHUTDOWN\n"));
    process.on("SIGINT", () => { logStream?.end("\nLUNABY AI INTERRUPTED\n"); process.exit(); });

    info("SYSTEM", "Đã khởi tạo hệ thống ghi log vào file thành công");
  } catch (error) {
    console.error("Lỗi khi khởi tạo hệ thống ghi log vào file:", error.message);
  }
}


function writeToFile(level, message) {
  if (!logStream) return;

  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] ${level.toUpperCase()}: ${message}\n`;

  logStream.write(logEntry);
}


function log(category, level, message, ...args) {
  const config = loggerConfig.getConfig();

  if (!config.enabled) return;

  if (category && !config.categories[category]) return;

  const currentLevelPriority = LOG_LEVELS[config.level]?.priority || 1;
  const messageLevelPriority = LOG_LEVELS[level]?.priority || 1;

  if (messageLevelPriority < currentLevelPriority) return;

  const timestamp = config.showTimestamp
    ? `[${new Date().toISOString()}] `
    : "";

  const levelColor = LOG_LEVELS[level]?.color || "";
  const categoryStr = category ? `[${category}] ` : "";
  const prefix = `${timestamp}${levelColor}${level.toUpperCase()}${RESET_COLOR} ${categoryStr}`;

  const logContent = `${prefix}${message}`;
  const consoleFn = { error: console.error, warn: console.warn, debug: console.debug }[level] || console.log;
  consoleFn(logContent, ...args);

  if (config.fileLogging?.enabled && logStream) {
    writeToFile(level, `${categoryStr}${message}`);
  }
}


function debug(category, message, ...args) { log(category, "debug", message, ...args); }
function info(category, message, ...args) { log(category, "info", message, ...args); }
function warn(category, message, ...args) { log(category, "warn", message, ...args); }
function error(category, message, ...args) { log(category, "error", message, ...args); }

function setEnabled(enabled) {
  loggerConfig.setEnabled(enabled);
}

function setLevel(level) {
  if (LOG_LEVELS[level]) loggerConfig.setLevel(level);
}

function setCategoryEnabled(category, enabled) {
  loggerConfig.setCategoryEnabled(category, enabled);
}

function getConfig() {
  return loggerConfig.getConfig();
}

function resetConfig() {
  loggerConfig.resetToDefault();
}

module.exports = {
  debug,
  info,
  warn,
  error,
  setEnabled,
  setLevel,
  setCategoryEnabled,
  getConfig,
  resetConfig,
  initializeFileLogging,
};