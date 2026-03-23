const fs = require("fs");
const path = require("path");
const logger = require("../utils/logger.js");

const TEMP_DIR = path.join(process.cwd(), "temp");
const MB = 1024 * 1024;
const CLEANUP_INTERVAL = 6 * 60 * 60 * 1000;
const HEALTH_CHECK_INTERVAL = 30 * 60 * 1000;
const DEFAULT_MAX_AGE = 24 * 60 * 60 * 1000;

class SystemService {
  constructor() {
    this.checkTLSSecurity();
    this.initializeLogging();
  }

  async initializeLogging() {
    try {
      await logger.initializeFileLogging();
    } catch (error) {
      logger.error("SYSTEM_SERVICE", `Failed to initialize file logging: ${error.message}`);
    }
  }

  checkTLSSecurity() {
    if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0") {
      logger.warn("SYSTEM_SERVICE", "SECURITY: NODE_TLS_REJECT_UNAUTHORIZED=0 — SSL/TLS verification disabled. Not safe for production.");
    }
  }

  ensureTempDirectory() {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
  }

  cleanupTempFiles(maxAge = DEFAULT_MAX_AGE) {
    try {
      if (!fs.existsSync(TEMP_DIR)) return;

      const now = Date.now();
      let cleaned = 0;

      for (const file of fs.readdirSync(TEMP_DIR)) {
        const filePath = path.join(TEMP_DIR, file);
        if (now - fs.statSync(filePath).mtime.getTime() > maxAge) {
          fs.unlinkSync(filePath);
          cleaned++;
        }
      }

      if (cleaned) logger.info("SYSTEM_SERVICE", `Cleaned up ${cleaned} old temp files`);
    } catch (error) {
      logger.error("SYSTEM_SERVICE", `Error cleaning temp files: ${error.message}`);
    }
  }

  getSystemInfo() {
    const mem = process.memoryUsage();
    return {
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      uptime: Math.floor(process.uptime()),
      memory: {
        rss: Math.round(mem.rss / MB),
        heapTotal: Math.round(mem.heapTotal / MB),
        heapUsed: Math.round(mem.heapUsed / MB),
        external: Math.round(mem.external / MB),
      },
      pid: process.pid,
    };
  }

  formatSystemInfo() {
    const info = this.getSystemInfo();
    const h = Math.floor(info.uptime / 3600);
    const m = Math.floor((info.uptime % 3600) / 60);

    return [
      `**System Information:**`,
      `• Node.js: ${info.nodeVersion}`,
      `• Platform: ${info.platform} (${info.arch})`,
      `• Uptime: ${h}h ${m}m`,
      `• Memory Usage: ${info.memory.heapUsed}MB / ${info.memory.heapTotal}MB`,
      `• RSS: ${info.memory.rss}MB`,
      `• External: ${info.memory.external}MB`,
      `• Process ID: ${info.pid}`
    ].join('\n');
  }

  getHealthStatus() {
    const info = this.getSystemInfo();
    const memPct = (info.memory.heapUsed / info.memory.heapTotal) * 100;
    const issues = [];

    let status = "healthy";
    if (memPct > 90) { status = "critical"; issues.push("High memory usage"); }
    else if (memPct > 75) { status = "warning"; issues.push("Elevated memory usage"); }
    if (info.uptime < 60) issues.push("Recently restarted");

    return { status, issues, memoryUsagePercent: Math.round(memPct), uptime: info.uptime };
  }

  startPeriodicTasks() {
    setInterval(() => this.cleanupTempFiles(), CLEANUP_INTERVAL);
    setInterval(() => {
      const health = this.getHealthStatus();
      if (health.status !== "healthy") {
        logger.warn("SYSTEM_SERVICE", `Health: ${health.status} — ${health.issues.join(", ")}`);
      }
    }, HEALTH_CHECK_INTERVAL);
  }

  setupGracefulShutdown() {
    const shutdown = (signal) => {
      logger.info("SYSTEM_SERVICE", `Received ${signal}, shutting down...`);
      this.cleanupTempFiles();
      process.exit(0);
    };

    for (const sig of ["SIGTERM", "SIGINT"]) {
      process.on(sig, () => shutdown(sig));
    }

    process.on("uncaughtException", (error) => {
      logger.error("SYSTEM_SERVICE", "Uncaught Exception:", error);
      setTimeout(() => process.exit(1), 1000);
    });

    process.on("unhandledRejection", (reason, promise) => {
      logger.error("SYSTEM_SERVICE", "Unhandled Rejection at:", promise, "reason:", reason);
    });
  }

  validateEnvironment() {
    const required = ["API_KEY"];
    const optional = ["GRADIO_IMAGE_SPACE", "CUSTOM_CA_CERT_PATH", "NODE_TLS_REJECT_UNAUTHORIZED"];
    const missing = required.filter(key => !process.env[key]);

    if (missing.length) {
      throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
    }

    if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0") {
      logger.warn("SYSTEM_SERVICE", "NODE_TLS_REJECT_UNAUTHORIZED=0 detected — security risk");
    }

    return {
      valid: true,
      missing: [],
      warnings: [],
      optional: optional.filter(key => process.env[key]),
    };
  }
}

module.exports = new SystemService();