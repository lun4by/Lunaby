const EventEmitter = require("events");
const logger = require("../../utils/core/logger.js");

class InitSystem extends EventEmitter {
  constructor() {
    super();
    this.initialized = false;
    this.services = {
      mongodb: false,
      mariadb: false,
      commands: false,
      i18n: false,
      profiles: false,
      guildProfiles: false,
      conversationHistory: false,
      dashboard: false,
    };
  }

  markReady(service) {
    if (!(service in this.services)) {
      logger.warn("system", `Unrecognized service: ${service}`);
      return;
    }

    this.services[service] = true;
    logger.info("system", `Service ${service} is ready`);

    if (Object.values(this.services).every(Boolean)) {
      this.initialized = true;
      logger.info("system", "All services are ready");
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
