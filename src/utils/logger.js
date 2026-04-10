const fs = require("fs");
const path = require("path");
const util = require("util");

const loggerConfig = require("../config/loggerConfig.js");

const LOG_LEVELS = {
  debug: { priority: 0, color: '\x1b[36m' },
  info: { priority: 1, color: '\x1b[32m' },
  warn: { priority: 2, color: '\x1b[33m' },
  error: { priority: 3, color: '\x1b[31m' },
};

const RESET_COLOR = '\x1b[0m';

let logStream = null;

function formatArg(arg) {
  if (arg instanceof Error) {
    return arg.stack || `${arg.name}: ${arg.message}`;
  }

  if (typeof arg === "string") {
    return arg;
  }

  try {
    return JSON.stringify(arg, null, 2);
  } catch {
    return String(arg);
  }
}


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
      info("system", `Renamed old log file to: ${oldLogFile}`);
    }

    logStream = fs.createWriteStream(currentLogFile, { flags: "a" });

    const startupMessage = `\nLunaby AI startup log\nStartup time: ${new Date().toISOString()}\nEnvironment: ${process.env.NODE_ENV || "development"
      }\n=========================\n\n`;
    logStream.write(startupMessage);

    process.on("exit", () => logStream?.end("\nLunaby AI shutdown\n"));
    process.on("SIGINT", () => { logStream?.end("\nLunaby AI interrupted\n"); process.exit(); });

    info("system", "File logging initialized successfully");
  } catch (error) {
    console.error("Error initializing file logging system:", error.message);
  }
}


function writeToFile(level, message, ...args) {
  if (!logStream) return;

  const timestamp = new Date().toISOString();
  const extra = args.length ? `\n${args.map(formatArg).join("\n")}` : "";
  const logEntry = `[${timestamp}] ${level}: ${message}${extra}\n`;

  logStream.write(logEntry);
}

function formatLogValue(value, useColors = false) {
  if (value instanceof Error) {
    return value.stack || `${value.name}: ${value.message}`;
  }

  if (typeof value === "string") {
    return value;
  }

  return util.inspect(value, {
    depth: null,
    colors: useColors,
    compact: false,
    breakLength: 120,
  });
}

function formatLogDetails(args, useColors = false) {
  if (!args || args.length === 0) {
    return "";
  }

  const details = args.map((arg) => formatLogValue(arg, useColors)).join(" | ");
  return details ? ` | ${details}` : "";
}


function log(category, level, message, ...args) {
  const config = loggerConfig.getConfig();

  if (!config.enabled) return;

  const categoryConfig = config.categories || {};
  const isKnownCategory = category
    ? Object.prototype.hasOwnProperty.call(categoryConfig, category)
    : false;

  if (isKnownCategory && categoryConfig[category] === false) return;

  const currentLevelPriority = LOG_LEVELS[config.level]?.priority || 1;
  const messageLevelPriority = LOG_LEVELS[level]?.priority || 1;

  if (messageLevelPriority < currentLevelPriority) return;

  const timestamp = config.showTimestamp
    ? `[${new Date().toISOString()}] `
    : "";

  const levelColor = LOG_LEVELS[level]?.color || "";
  const categoryStr = category ? `[${category}] ` : "";
  const prefix = `${timestamp}${levelColor}${level}${RESET_COLOR} ${categoryStr}`;

  const normalizedMessage = formatLogValue(message, false);
  const consoleDetails = formatLogDetails(args, true);
  const fileDetails = formatLogDetails(args, false);

  const logContent = `${prefix}${normalizedMessage}${consoleDetails}`;
  const consoleFn = { error: console.error, warn: console.warn, debug: console.debug }[level] || console.log;
  consoleFn(logContent);

  if (config.fileLogging?.enabled && logStream) {
    writeToFile(level, `${categoryStr}${normalizedMessage}${fileDetails}`);
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
