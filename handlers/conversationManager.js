const storageDB = require('../services/storagedb.js');
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
      logger.error('CONVERSATION', `Lỗi khi lấy lịch sử cuộc trò chuyện: ${error.message}`);
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
        logger.debug('CONVERSATION', `Đã xóa bộ đệm cuộc trò chuyện không hoạt động cho user ${userId}`);
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
        logger.error('CONVERSATION', `Lỗi khi tải lịch sử cuộc trò chuyện: ${error.message}`);
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
        logger.error('CONVERSATION', `Lỗi khi thêm tin nhắn: ${error.message}`);
        return false;
      }
    },

    getHistory(userId) {
      try {
        const validUserId = validateUserId(userId);
        return [...getUserHistory(validUserId)];
      } catch (error) {
        logger.error('CONVERSATION', `Lỗi khi lấy lịch sử: ${error.message}`);
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
        logger.error('CONVERSATION', `Lỗi khi xóa lịch sử: ${error.message}`);
        return false;
      }
    },

    async resetConversation(userId, systemPrompt, modelName) {
      try {
        const validUserId = validateUserId(userId);
        this.clearLocalHistory(validUserId);
        await storageDB.clearConversationHistory(validUserId, systemPrompt, modelName);
        logger.info('CONVERSATION', `Đã xóa hoàn toàn cuộc trò chuyện cho userId: ${validUserId}`);
        await this.loadConversationHistory(validUserId, systemPrompt, modelName);
        return true;
      } catch (error) {
        logger.error('CONVERSATION', `Lỗi khi reset cuộc trò chuyện: ${error.message}`);
        return false;
      }
    }
  };
})();

module.exports = conversationManager;
