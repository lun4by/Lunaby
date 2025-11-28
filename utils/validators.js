const { DEFAULT_USER_ID, USER_ROLES } = require('../config/constants');

class Validators {
  static isValidUserId(userId) {
    if (!userId || typeof userId !== 'string') {
      return false;
    }
    
    if (userId === 'null' || userId === 'undefined') {
      return false;
    }
    
    const trimmed = userId.trim();
    return trimmed.length > 0;
  }

  static normalizeUserId(userId) {
    if (!this.isValidUserId(userId)) {
      return DEFAULT_USER_ID;
    }
    return userId.trim();
  }

  static isValidRole(role) {
    return Object.values(USER_ROLES).includes(role);
  }

  static isValidMessage(message) {
    if (!message || typeof message !== 'object') {
      return false;
    }
    
    if (!message.role || !message.content) {
      return false;
    }
    
    if (!['system', 'user', 'assistant'].includes(message.role)) {
      return false;
    }
    
    if (typeof message.content !== 'string' || !message.content.trim()) {
      return false;
    }
    
    return true;
  }

  static cleanMessages(messages) {
    if (!Array.isArray(messages)) {
      return [];
    }

    const validMessages = [];
    let lastRole = null;
    
    for (const msg of messages) {
      if (!this.isValidMessage(msg)) {
        continue;
      }

      if (lastRole === msg.role && msg.role !== 'system') {
        const lastMsg = validMessages[validMessages.length - 1];
        lastMsg.content += '\n\n' + msg.content;
      } else {
        validMessages.push({ role: msg.role, content: msg.content });
        lastRole = msg.role;
      }
    }
    
    return validMessages;
  }

  static validateUserIdOrThrow(userId, context = 'operation') {
    if (!this.isValidUserId(userId)) {
      throw new Error(`Invalid userId for ${context}: ${userId}`);
    }
  }

  static isValidPrompt(prompt) {
    if (!prompt || typeof prompt !== 'string') {
      return false;
    }
    return prompt.trim().length > 0;
  }

  static isValidMemoryData(memoryData) {
    if (!memoryData || typeof memoryData !== 'object') {
      return false;
    }
    
    if (!memoryData.content || typeof memoryData.content !== 'string') {
      return false;
    }
    
    if (memoryData.content.trim().length === 0) {
      return false;
    }
    
    return true;
  }

  static isValidGuildId(guildId) {
    if (!guildId || typeof guildId !== 'string') {
      return false;
    }
    return guildId.trim().length > 0;
  }

  static isValidImportance(importance) {
    if (typeof importance !== 'number') {
      return false;
    }
    return importance >= 1 && importance <= 10;
  }
}

module.exports = Validators;
