const { EmbedBuilder } = require('discord.js');
const ConversationService = require('../services/ConversationService');
const consentService = require('../services/consentService');
const guildProfileDB = require('../services/guildprofiledb');
const { handlePermissionError } = require('../utils/permissionUtils');
const { handleImageRequest } = require('./messageHandlers/imageRequestHandler');
const { handleMemoryRequest, splitMessageIntoChunks } = require('./messageHandlers/memoryRequestHandler');
const { handleCodeRequest } = require('./messageHandlers/codeRequestHandler');
const { handleChatRequest } = require('./messageHandlers/chatRequestHandler');
const { handleAIThread } = require('./messageHandlers/dedicatedChannelHandler');
const logger = require('../utils/logger');



async function handleMentionMessage(message, client) {
  if (message.author.bot) return;

  const isDM = !message.guild;

  if (!isDM && message.channel.isThread()) {
    try {
      const profile = await guildProfileDB.getGuildProfile(message.guild.id);
      const aiThreads = profile?.aiThreads || [];
      const isAIThread = aiThreads.some(t => t.threadId === message.channel.id);

      if (isAIThread) {
        await handleAIThread(message, client);
        return;
      }
    } catch (err) {
      logger.debug('MESSAGE_HANDLER', `Error checking AI thread: ${err.message}`);
    }
  }

  const shouldRespond = isDM || message.mentions.has(client.user);

  if (shouldRespond) {
    const hasEveryoneOrRoleMention = message.mentions.everyone || message.mentions.roles.size > 0;

    if (!hasEveryoneOrRoleMention) {
      // Start typing interval - runs every 5 seconds to keep "typing" indicator visible
      const typingInterval = setInterval(() => message.channel.sendTyping().catch(() => { }), 5000);
      message.channel.sendTyping().catch(() => { });

      const hasConsented = await consentService.hasUserConsented(message.author.id);

      if (!hasConsented) {
        clearInterval(typingInterval);
        try {
          const consentData = consentService.createConsentEmbed(message.author);
          await message.reply(consentData);
        } catch (error) {
          if (error.code === 50013 || error.message.includes('permission')) {
            await handlePermissionError(message, 'embedLinks', message.author.username, 'reply');
          } else {
            throw error;
          }
        }
        return;
      }

      try {
        const content = message.content.replace(/<@!?\d+>/g, '').trim();

        if (!content) {
          clearInterval(typingInterval);
          await message.reply('Tôi có thể giúp gì cho bạn hôm nay?');
          return;
        }

        const requestType = ConversationService.detectRequestType(content);

        if (requestType.type === 'image') {
          clearInterval(typingInterval);
          const imagePrompt = requestType.match[1];
          await handleImageRequest(message, imagePrompt);
          return;
        }

        if (requestType.type === 'memory') {
          clearInterval(typingInterval);
          const memoryRequest = requestType.match[2].trim() || "toàn bộ cuộc trò chuyện";
          await handleMemoryRequest(message, ConversationService, memoryRequest);
          return;
        }

        if (requestType.type === 'code') {
          clearInterval(typingInterval);
          await handleCodeRequest(message, content, ConversationService);
          return;
        }

        // Clear interval before chat request - StreamingService has its own typing interval
        clearInterval(typingInterval);
        await handleChatRequest(message, content, ConversationService);

      } catch (error) {
        clearInterval(typingInterval);
        logger.error('CHAT', `Error processing message from ${message.author.tag}:`, error);

        let errorMessage = 'Xin lỗi, tôi gặp lỗi khi xử lý tin nhắn của bạn. Vui lòng thử lại sau.';

        if (error.message.includes('Không có API provider nào được cấu hình')) {
          errorMessage = 'Xin lỗi, hệ thống AI hiện tại không khả dụng. Vui lòng thử lại sau.';
        } else if (error.message.includes('Tất cả providers đã thất bại')) {
          errorMessage = 'Xin lỗi, tất cả nhà cung cấp AI đều không khả dụng. Vui lòng thử lại sau.';
        } else if (error.code === 'EPROTO' || error.code === 'ECONNREFUSED' || error.message.includes('connect')) {
          errorMessage = 'Xin lỗi, tôi đang gặp vấn đề kết nối. Vui lòng thử lại sau hoặc liên hệ quản trị viên để được hỗ trợ.';
        }

        await message.reply(errorMessage);
      }
    }
  }
}

module.exports = {
  handleMentionMessage,
  splitMessageIntoChunks
};
