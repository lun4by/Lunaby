const EventEmitter = require("events");
const logger = require("../utils/logger.js");

class InitSystem extends EventEmitter {
  constructor() {
    super();
    this.initialized = false;
    this.services = {
      mongodb: false,
      mariadb: false,
      commands: false,
      providers: false,
      profiles: false,
      conversationHistory: false,
      guildProfiles: false,
      dashboard: false,
    };
  }

  markReady(service) {
    if (!(service in this.services)) {
      logger.warn("SYSTEM", `Không nhận dạng được service: ${service}`);
      return;
    }

    this.services[service] = true;
    logger.info("SYSTEM", `Service ${service} đã sẵn sàng`);

    if (Object.values(this.services).every(Boolean)) {
      this.initialized = true;
      logger.info("SYSTEM", "Tất cả services đã sẵn sàng");
      this.emit("ready");
    }
  }

  async waitForReady() {
    if (this.initialized) return true;
    return new Promise((resolve) => this.once("ready", () => resolve(true)));
  }

  getStatus() {
    return {
      initialized: this.initialized,
      services: { ...this.services },
    };
  }
}

module.exports = new InitSystem();
