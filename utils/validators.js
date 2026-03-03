const { DEFAULT_USER_ID, USER_ROLES } = require('../config/constants');

const VALID_ROLES = new Set(Object.values(USER_ROLES));
const VALID_MSG_ROLES = new Set(['system', 'user', 'assistant']);

class Validators {
  static isValidUserId(userId) {
    return typeof userId === 'string' && userId !== 'null' && userId !== 'undefined' && userId.trim().length > 0;
  }

  static normalizeUserId(userId) {
    return this.isValidUserId(userId) ? userId.trim() : DEFAULT_USER_ID;
  }

  static isValidRole(role) {
    return VALID_ROLES.has(role);
  }

  static isValidMessage(msg) {
    return msg && typeof msg === 'object'
      && VALID_MSG_ROLES.has(msg.role)
      && typeof msg.content === 'string'
      && msg.content.trim().length > 0;
  }

  static cleanMessages(messages) {
    if (!Array.isArray(messages)) return [];

    const result = [];
    let lastRole = null;

    for (const msg of messages) {
      if (!this.isValidMessage(msg)) continue;

      if (lastRole === msg.role && msg.role !== 'system') {
        result[result.length - 1].content += '\n\n' + msg.content;
      } else {
        result.push({ role: msg.role, content: msg.content });
        lastRole = msg.role;
      }
    }

    return result;
  }

  static validateUserIdOrThrow(userId, context = 'operation') {
    if (!this.isValidUserId(userId)) throw new Error(`Invalid userId for ${context}: ${userId}`);
  }

  static isValidPrompt(prompt) {
    return typeof prompt === 'string' && prompt.trim().length > 0;
  }

  static isValidMemoryData(data) {
    return data && typeof data === 'object' && typeof data.content === 'string' && data.content.trim().length > 0;
  }

  static isValidGuildId(guildId) {
    return typeof guildId === 'string' && guildId.trim().length > 0;
  }

  static isValidImportance(importance) {
    return typeof importance === 'number' && importance >= 1 && importance <= 10;
  }
}

module.exports = Validators;