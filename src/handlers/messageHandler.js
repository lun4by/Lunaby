const ConversationService = require('../services/ai/ConversationService');
const { TYPING_INDICATOR_INTERVAL_MS } = require('../config/constants');
const { handleMemoryRequest } = require('./messageHandlers/memoryRequestHandler');
const { handleCodeRequest } = require('./messageHandlers/codeRequestHandler');
const { handleChatRequest } = require('./messageHandlers/chatRequestHandler');
const { handleImageRequest } = require('./messageHandlers/imageRequestHandler');
const { ensureUserConsent } = require('./commands/commandGuards');
const logger = require('../utils/core/logger');
const emojis = require('../config/emojis');

function normalizeMentions(content, message, client) {
  let normalized = content.replace(new RegExp(`<@!?${client.user.id}>`, 'g'), '');

  if (message.mentions.users.size === 0) {
    return normalized.trim();
  }

  normalized = normalized.replace(/<@!?(\d+)>/g, (raw, userId) => {
    if (userId === client.user.id) {
      return '';
    }

    const user = message.mentions.users.get(userId);
    if (!user) {
      return raw;
    }

    const member = message.guild?.members.cache.get(userId);
    return member?.displayName || user.displayName || user.username;
  });

  return normalized.trim();
}

async function handleMentionMessage(message, client) {
  if (message.author.bot) return;
  if (!message.guild) return;

  const shouldRespond = message.mentions.has(client.user);
  if (!shouldRespond) return;

  const hasEveryoneOrRoleMention = message.mentions.everyone || message.mentions.roles.size > 0;
  if (hasEveryoneOrRoleMention) return;

  if (!(await ensureUserConsent(message, message.author))) {
    return;
  }

  const typingInterval = setInterval(() => message.channel.sendTyping().catch(() => { }), TYPING_INDICATOR_INTERVAL_MS);
  message.channel.sendTyping().catch(() => { });

  try {
    const content = normalizeMentions(message.content, message, client);

    if (!content) {
      await message.reply('Tôi có thể giúp gì cho bạn hôm nay?');
      return;
    }

    const requestType = ConversationService.detectRequestType(content);

    if (requestType.type === 'image') {
      await handleImageRequest(message, content, requestType.match);
      return;
    }

    if (requestType.type === 'memory') {
      const memoryRequest = requestType.match[2].trim() || 'toàn bộ cuộc trò chuyện';
      await handleMemoryRequest(message, ConversationService, memoryRequest);
      return;
    }

    if (requestType.type === 'code') {
      await handleCodeRequest(message, content, ConversationService);
      return;
    }

    await handleChatRequest(message, content, ConversationService);
  } catch (error) {
    logger.error('chat', `Error processing message from ${message.author.tag}:`, error);

    const msg = error?.message || '';
    let errorMessage = 'Xin lỗi, tôi gặp lỗi khi xử lý tin nhắn của bạn. Vui lòng thử lại sau.';

    if (msg.includes('Không có API provider nào được cấu hình')) {
      errorMessage = 'Xin lỗi, hệ thống AI hiện tại không khả dụng. Vui lòng thử lại sau.';
    } else if (msg.includes('Tất cả providers đã thất bại')) {
      errorMessage = 'Xin lỗi, tất cả nhà cung cấp AI đều không khả dụng. Vui lòng thử lại sau.';
    } else if (error.code === 'EPROTO' || error.code === 'ECONNREFUSED' || msg.includes('connect')) {
      errorMessage = 'Xin lỗi, tôi đang gặp vấn đề kết nối. Vui lòng thử lại sau hoặc liên hệ quản trị viên để được hỗ trợ.';
    }

    await message.reply(`${emojis.error} ${errorMessage}`).catch(() => { });
  } finally {
    clearInterval(typingInterval);
  }
}

module.exports = {
  handleMentionMessage,
};
