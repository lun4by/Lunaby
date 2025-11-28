const ConversationDB = require('./database/ConversationDB');
const UserProfileDB = require('./database/UserProfileDB');
const ImageBlacklistDB = require('./database/ImageBlacklistDB');
const DatabaseManager = require('./database/DatabaseManager');
const { CONVERSATION_CLEANUP_INTERVAL_MS } = require('../config/constants');

class StorageDB {
  constructor() {
    setInterval(() => this.cleanupOldConversations(), CONVERSATION_CLEANUP_INTERVAL_MS);
  }

  async initDatabase() {
    return DatabaseManager.initDatabase();
  }

  async setupCollections() {
    return DatabaseManager.initializeCollections();
  }

  async resetDatabase() {
    return DatabaseManager.resetDatabase();
  }

  async getConversationHistory(userId, systemPrompt, modelName) {
    return ConversationDB.getConversationHistory(userId, systemPrompt, modelName);
  }

  async addMessageToConversation(userId, role, content) {
    return ConversationDB.addMessageToConversation(userId, role, content);
  }

  async clearConversationHistory(userId, systemPrompt, modelName) {
    return ConversationDB.clearConversationHistory(userId, systemPrompt, modelName);
  }

  async cleanupOldConversations() {
    return ConversationDB.cleanupOldConversations();
  }

  setMaxConversationLength(value) {
    return ConversationDB.setMaxConversationLength(value);
  }

  setMaxConversationAge(value) {
    return ConversationDB.setMaxConversationAge(value);
  }

  async getUserProfile(userId) {
    return UserProfileDB.getUserProfile(userId);
  }

  async updateUserProfile(userId, updateData) {
    return UserProfileDB.updateUserProfile(userId, updateData);
  }

  async updateUserEconomy(userId, resourceType, amount) {
    return UserProfileDB.updateUserEconomy(userId, resourceType, amount);
  }

  async checkImageBlacklist(text) {
    return ImageBlacklistDB.checkImageBlacklist(text);
  }

  async addToImageBlacklist(keyword, category, description, severity) {
    return ImageBlacklistDB.addToImageBlacklist(keyword, category, description, severity);
  }

  async removeFromImageBlacklist(keyword) {
    return ImageBlacklistDB.removeFromImageBlacklist(keyword);
  }

  async getImageBlacklist() {
    return ImageBlacklistDB.getImageBlacklist();
  }

  async initializeConversationHistory() {
    return DatabaseManager.initializeConversationHistory();
  }

  async initializeProfiles() {
    return DatabaseManager.initializeProfiles();
  }

  async initializeImageBlacklist() {
    return ImageBlacklistDB.initializeDefaultBlacklist();
  }

  async resetConversationsCollection() {
    return DatabaseManager.resetConversationsCollection();
  }
}

module.exports = new StorageDB();
