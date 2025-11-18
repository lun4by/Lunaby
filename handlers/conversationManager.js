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
        userLastActivity.set(validUserId, Date.now());
      } else {
        // Cập nhật thời gian hoạt động mới nhất
        userLastActivity.set(validUserId, Date.now());
      }

      return userConversations.get(validUserId);
    } catch (error) {
      logger.error('CONVERSATION', `Lỗi khi lấy lịch sử cuộc trò chuyện: ${error.message}`);
      return [];
    }
  };

  // Dọn dẹp bộ nhớ định kỳ - xóa cuộc trò chuyện không hoạt động sau 30 phút
  setInterval(() => {
    const now = Date.now();
    const inactiveThreshold = 30 * 60 * 1000;

    for (const [userId, lastActive] of userLastActivity.entries()) {
      if (now - lastActive > inactiveThreshold) {
        userConversations.delete(userId);
        userLastActivity.delete(userId);
        logger.debug('CONVERSATION', `Đã xóa bộ đệm cuộc trò chuyện không hoạt động cho user ${userId}`);
      }
    }
  }, 10 * 60 * 1000);

  return {
    async loadConversationHistory(userId, systemPrompt, modelName) {
      try {
        const validUserId = validateUserId(userId);

        const history = await storageDB.getConversationHistory(validUserId, systemPrompt, modelName);

        // Cập nhật cache cục bộ cho user
        const userHistory = getUserHistory(validUserId);
        userHistory.length = 0;
        history.forEach(msg => userHistory.push(msg));

        logger.debug('CONVERSATION', `Đã tải ${history.length} tin nhắn cho userId: ${validUserId}`);
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

        const userHistory = getUserHistory(validUserId);
        userHistory.push({ role, content });

        await storageDB.addMessageToConversation(validUserId, role, content);
        logger.debug('CONVERSATION', `Đã thêm tin nhắn (${role}) cho userId: ${validUserId}`);
        return true;
      } catch (error) {
        logger.error('CONVERSATION', `Lỗi khi thêm tin nhắn: ${error.message}`);
        return false;
      }
    },

    getHistory(userId) {
      try {
        const validUserId = validateUserId(userId);
        const history = [...getUserHistory(validUserId)];
        logger.debug('CONVERSATION', `Đã lấy ${history.length} tin nhắn từ bộ nhớ cache cho userId: ${validUserId}`);
        return history;
      } catch (error) {
        logger.error('CONVERSATION', `Lỗi khi lấy lịch sử: ${error.message}`);
        return [];
      }
    },

    clearLocalHistory(userId) {
      try {
        if (userId) {
          const validUserId = validateUserId(userId);
          if (userConversations.has(validUserId)) {
            userConversations.get(validUserId).length = 0;
            logger.debug('CONVERSATION', `Đã xóa lịch sử cục bộ cho userId: ${validUserId}`);
          }
        } else {
          userConversations.clear();
          userLastActivity.clear();
          logger.debug('CONVERSATION', 'Đã xóa tất cả lịch sử cuộc trò chuyện cục bộ');
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
