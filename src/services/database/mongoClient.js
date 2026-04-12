const { MongoClient } = require("mongodb");
const initSystem = require("../system/initSystem.js");
const logger = require("../../utils/core/logger.js");

class MongoDBClient {
  constructor() {
    this.uri = process.env.MONGODB_URI;
    if (!this.uri) {
      throw new Error("MONGODB_URI không được đặt trong biến môi trường");
    }

    this.client = new MongoClient(this.uri);
    this.db = null;
    this.isConnecting = false;
  }

  async connect() {
    try {
      if (this.db) {
        logger.info("system", "Already connected to MongoDB.");
        return this.db;
      }

      if (this.isConnecting) {
        logger.info("system", "Connecting to MongoDB...");
        while (!this.db) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        return this.db;
      }

      this.isConnecting = true;
      await this.client.connect();
      this.db = this.client.db();
      this.isConnecting = false;
      logger.info("mongodb", "Connected to MongoDB");

      // if (!initSystem.getStatus().services.mongodb) {
      //   console.log('MongoDB đang đợi trong hàng đợi khởi tạo...');
      //   await initSystem.waitForReady();
      // }

      return this.db;
    } catch (error) {
      this.isConnecting = false;
      logger.error("system", "Error while connecting to MongoDB:", error);
      throw error;
    }
  }

  async close() {
    try {
      await this.client.close();
      logger.info("system", "Closed MongoDB connection");
    } catch (error) {
      logger.error("system", "Error while closing MongoDB connection:", error);
    }
  }

  getDb() {
    if (!this.db) {
      throw new Error("Chưa kết nối tới MongoDB. Hãy gọi connect() trước.");
    }
    return this.db;
  }

  async getDbSafe() {
    if (!this.db) {
      try {
        await this.connect();
      } catch (error) {
        logger.error("system", "Failed to connect to MongoDB:", error);
        throw new Error(
          "Không thể kết nối đến MongoDB. Vui lòng kiểm tra kết nối và cấu hình."
        );
      }
    }
    return this.db;
  }
}

module.exports = new MongoDBClient();
