const fs = require("fs");
const logger = require("../utils/logger.js");

class SystemService {
  constructor() {
    this.checkTLSSecurity();
    this.initializeLogging();

    logger.debug("SYSTEM_SERVICE", "Service initialized");
  }


  async initializeLogging() {
    try {
      await logger.initializeFileLogging();
      logger.info("SYSTEM_SERVICE", "File logging ready");
    } catch (error) {
      logger.error("SYSTEM_SERVICE", `Failed to initialize file logging: ${error.message}`);
    }
  }


  checkTLSSecurity() {
    if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0") {
      logger.warn("SYSTEM_SERVICE", "SECURITY WARNING: NODE_TLS_REJECT_UNAUTHORIZED=0");
      logger.warn("SYSTEM_SERVICE", "This setting disables SSL/TLS certificate verification, making all HTTPS connections insecure!");
      logger.warn("SYSTEM_SERVICE", "This should only be used in development environments, NEVER in production.");
      logger.warn("SYSTEM_SERVICE", "To fix this, remove the NODE_TLS_REJECT_UNAUTHORIZED=0 environment variable or use a more secure solution.");
      logger.warn("SYSTEM_SERVICE", "If you're having issues with self-signed certificates, configure the CA certificate path in axios setup.");
    }
  }


  ensureTempDirectory() {
    const tempDir = "./temp";
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
      logger.info("SYSTEM_SERVICE", "Created temp directory");
    }
  }


  cleanupTempFiles(maxAge = 24 * 60 * 60 * 1000) { // 24 hours default
    try {
      const tempDir = "./temp";
      if (!fs.existsSync(tempDir)) {
        return;
      }

      const files = fs.readdirSync(tempDir);
      const now = Date.now();
      let cleanedCount = 0;

      for (const file of files) {
        const filePath = `${tempDir}/${file}`;
        const stats = fs.statSync(filePath);

        if (now - stats.mtime.getTime() > maxAge) {
          fs.unlinkSync(filePath);
          cleanedCount++;
        }
      }

      if (cleanedCount > 0) {
        logger.info("SYSTEM_SERVICE", `Cleaned up ${cleanedCount} old temp files`);
      }
    } catch (error) {
      logger.error("SYSTEM_SERVICE", `Error cleaning temp files: ${error.message}`);
    }
  }


  getSystemInfo() {
    const memUsage = process.memoryUsage();
    const uptime = process.uptime();

    return {
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      uptime: Math.floor(uptime),
      memory: {
        rss: Math.round(memUsage.rss / 1024 / 1024),
        heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
        heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
        external: Math.round(memUsage.external / 1024 / 1024),
      },
      pid: process.pid,
    };
  }


  formatSystemInfo() {
    const info = this.getSystemInfo();
    const uptimeHours = Math.floor(info.uptime / 3600);
    const uptimeMinutes = Math.floor((info.uptime % 3600) / 60);

    return `**System Information:**
• Node.js: ${info.nodeVersion}
• Platform: ${info.platform} (${info.arch})
• Uptime: ${uptimeHours}h ${uptimeMinutes}m
• Memory Usage: ${info.memory.heapUsed}MB / ${info.memory.heapTotal}MB
• RSS: ${info.memory.rss}MB
• External: ${info.memory.external}MB
• Process ID: ${info.pid}`;
  }


  getHealthStatus() {
    const info = this.getSystemInfo();
    const memoryUsagePercent = (info.memory.heapUsed / info.memory.heapTotal) * 100;

    let status = "healthy";
    let issues = [];

    if (memoryUsagePercent > 90) {
      status = "critical";
      issues.push("High memory usage");
    } else if (memoryUsagePercent > 75) {
      status = "warning";
      issues.push("Elevated memory usage");
    }

    if (info.uptime < 60) {
      issues.push("Recently restarted");
    }

    return {
      status,
      issues,
      memoryUsagePercent: Math.round(memoryUsagePercent),
      uptime: info.uptime,
    };
  }


  startPeriodicTasks() {
    setInterval(() => {
      this.cleanupTempFiles();
    }, 6 * 60 * 60 * 1000);

    setInterval(() => {
      const health = this.getHealthStatus();
      if (health.status !== "healthy") {
        logger.warn("SYSTEM_SERVICE", `System health: ${health.status} - Issues: ${health.issues.join(", ")}`);
      } else {
        logger.info("SYSTEM_SERVICE", `System healthy - Memory: ${health.memoryUsagePercent}%, Uptime: ${Math.floor(health.uptime / 3600)}h`);
      }
    }, 30 * 60 * 1000);

    logger.info("SYSTEM_SERVICE", "Started periodic maintenance tasks");
  }


  setupGracefulShutdown() {
    const shutdown = (signal) => {
      logger.info("SYSTEM_SERVICE", `Received ${signal}, starting graceful shutdown...`);

      this.cleanupTempFiles();

      // await storageDB.close();

      logger.info("SYSTEM_SERVICE", "Graceful shutdown completed");
      process.exit(0);
    };

    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));

    process.on("uncaughtException", (error) => {
      logger.error("SYSTEM_SERVICE", "Uncaught Exception:", error);
      setTimeout(() => process.exit(1), 1000);
    });

    process.on("unhandledRejection", (reason, promise) => {
      logger.error("SYSTEM_SERVICE", "Unhandled Rejection at:", promise, "reason:", reason);
    });

    logger.info("SYSTEM_SERVICE", "Graceful shutdown handlers registered");
  }


  validateEnvironment() {
    const required = ["API_KEY"];
    const optional = ["GRADIO_IMAGE_SPACE", "CUSTOM_CA_CERT_PATH", "NODE_TLS_REJECT_UNAUTHORIZED"];

    const missing = [];
    const warnings = [];

    for (const key of required) {
      if (!process.env[key]) {
        missing.push(key);
      }
    }

    if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0") {
      warnings.push("NODE_TLS_REJECT_UNAUTHORIZED=0 detected - security risk in production");
    }

    if (missing.length > 0) {
      logger.error("SYSTEM_SERVICE", `Missing required environment variables: ${missing.join(", ")}`);
      throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
    }

    if (warnings.length > 0) {
      warnings.forEach(warning => logger.warn("SYSTEM_SERVICE", warning));
    }

    logger.info("SYSTEM_SERVICE", "Environment validation completed");

    return {
      valid: missing.length === 0,
      missing,
      warnings,
      optional: optional.filter(key => process.env[key]),
    };
  }
}

module.exports = new SystemService(); 