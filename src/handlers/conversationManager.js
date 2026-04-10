const storageDB = require('../services/database/storagedb.js');
const logger = require('../utils/logger.js');

const conversationManager = (() => {

  const userConversations = new Map();
  const userLastActivity = new Map();

  const validateUserId = (userId) => {
    if (!userId || typeof userId !== 'string') {
      throw new Error('UserId không hợp lệ: userId phải là một chuỗi không rỗng');
    }

    const trimmedId = userId.trim();
    if (!trimmedId || trimmedId === 'null' || trimmedId === 'undefined') {
      throw new Error('UserId không hợp lệ: userId không thể rỗng, "null", hoặc "undefined"');
    }

    return trimmedId;
  };

  const getUserHistory = (userId) => {
    try {
      const validUserId = validateUserId(userId);
      if (!userConversations.has(validUserId)) {
        userConversations.set(validUserId, []);
      }
      userLastActivity.set(validUserId, Date.now());
      return userConversations.get(validUserId);
    } catch (error) {
      logger.error('CONVERSATION', `Error fetching conversation history: ${error.message}`);
      return [];
    }
  };

  setInterval(() => {
    const now = Date.now();
    const inactiveThreshold = 15 * 60 * 1000;

    for (const [userId, lastActive] of userLastActivity.entries()) {
      if (now - lastActive > inactiveThreshold) {
        userConversations.delete(userId);
        userLastActivity.delete(userId);
        logger.debug('CONVERSATION', `Cleared inactive conversation buffer for user ${userId}`);
      }
    }
  }, 5 * 60 * 1000);

  return {
    async loadConversationHistory(userId, systemPrompt, modelName) {
      try {
        const validUserId = validateUserId(userId);

        const history = await storageDB.getConversationHistory(validUserId, systemPrompt, modelName);

        const userHistory = getUserHistory(validUserId);
        userHistory.length = 0;
        userHistory.push(...history);
        return [...userHistory];
      } catch (error) {
        logger.error('CONVERSATION', `Error loading conversation history: ${error.message}`);
        return [{
          role: 'system',
          content: systemPrompt + ` You are running on ${modelName} model.`
        }];
      }
    },

    async addMessage(userId, role, content) {
      try {
        const validUserId = validateUserId(userId);
        getUserHistory(validUserId).push({ role, content });
        await storageDB.addMessageToConversation(validUserId, role, content);
        return true;
      } catch (error) {
        logger.error('CONVERSATION', `Error adding message: ${error.message}`);
        return false;
      }
    },

    getHistory(userId) {
      try {
        const validUserId = validateUserId(userId);
        return [...getUserHistory(validUserId)];
      } catch (error) {
        logger.error('CONVERSATION', `Error fetching history: ${error.message}`);
        return [];
      }
    },

    clearLocalHistory(userId) {
      try {
        if (userId) {
          const validUserId = validateUserId(userId);
          userConversations.delete(validUserId);
          userLastActivity.delete(validUserId);
        } else {
          userConversations.clear();
          userLastActivity.clear();
        }
        return true;
      } catch (error) {
        logger.error('CONVERSATION', `Error deleting history: ${error.message}`);
        return false;
      }
    },

    async resetConversation(userId, systemPrompt, modelName) {
      try {
        const validUserId = validateUserId(userId);
        this.clearLocalHistory(validUserId);
        await storageDB.clearConversationHistory(validUserId, systemPrompt, modelName);
        logger.info('CONVERSATION', `Completely deleted conversation for userId: ${validUserId}`);
        await this.loadConversationHistory(validUserId, systemPrompt, modelName);
        return true;
      } catch (error) {
        logger.error('CONVERSATION', `Error resetting conversation: ${error.message}`);
        return false;
      }
    }
  };
})();

module.exports = conversationManager;