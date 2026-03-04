const AICore = require('../../services/AICore');
const logger = require('../../utils/logger');
const { sendStreamingMessage } = require('../../services/StreamingService');
const { splitMessageIntoChunks } = require('./memoryRequestHandler');
const { DEFAULT_MODEL } = require('../../config/constants');
const Validators = require('../../utils/validators');
const conversationManager = require('../conversationManager');
const prompts = require('../../config/prompts');
const ErrorHandler = require('../../utils/ErrorHandler');
const QuotaService = require('../../services/QuotaService');
const { createLunabyEmbed } = require('../../utils/embedUtils');

async function handleChatRequest(message, content, ConversationService) {
  try {
    const conversationId = ConversationService.extractUserId(message);
    const globalUserId = message.author.id;

    const quotaCheck = await QuotaService.canUseMessages(globalUserId, 1);
    if (!quotaCheck.allowed) {
      const embed = createLunabyEmbed()
        .setTitle('Hết quyền sử dụng')
        .setDescription(`> Bạn đã sử dụng hết **${quotaCheck.limit} lượt** trò chuyện AI trong chu kỳ giới hạn.\n\n> Vui lòng nâng cấp tài khoản hoặc đợi chu kỳ tiếp theo để tiếp tục sử dụng.`)
        .setColor(0xE74C3C);
      return message.reply({ embeds: [embed] }).catch(() => { });
    }

    await conversationManager.loadConversationHistory(conversationId, prompts.system.main, DEFAULT_MODEL);
    let messages = conversationManager.getHistory(conversationId);

    const isNewConversation = messages.length <= 2;
    const enhancedPrompt = `
      ${prompts.chat.responseStyle}
      ${isNewConversation ? prompts.chat.newConversation : prompts.chat.ongoingConversation}
      ${prompts.chat.generalInstructions}
      ${content}
    `;

    await conversationManager.addMessage(conversationId, 'user', enhancedPrompt);
    messages = conversationManager.getHistory(conversationId);

    logger.debug('CHAT', `Messages before validation: ${messages.length}`);
    const validMessages = Validators.cleanMessages(messages);
    logger.debug('CHAT', `Messages after validation: ${validMessages.length}`);

    if (validMessages.length === 0) {
      throw new Error('No valid messages after validation');
    }

    const replyTarget = message.guild ? message : null;
    const response = await sendStreamingMessage(message.channel, validMessages, {}, replyTarget);

    await conversationManager.addMessage(conversationId, 'assistant', response);
    await QuotaService.recordMessageUsage(globalUserId, 1);

  } catch (streamError) {
    ErrorHandler.logError('CHAT', 'Streaming failed, falling back to non-streaming', streamError, 'warn');

    try {
      const response = await ConversationService.getCompletion(content, message);

      if (!response) {
        logger.error('CHAT', 'ConversationService returned null/undefined');
        await message.reply('Xin lỗi, tôi không thể xử lý tin nhắn của bạn lúc này.').catch(() => { });
        return;
      }

      if (response.length > 2000) {
        const chunks = splitMessageIntoChunks(response);
        for (const chunk of chunks) {
          await message.reply(chunk);
        }
      } else {
        await message.reply(response);
      }

      await QuotaService.recordMessageUsage(globalUserId, 1);
    } catch (fallbackError) {
      ErrorHandler.logError('CHAT', 'Both streaming and fallback failed', fallbackError);
      const userMessage = ErrorHandler.getUserFriendlyMessage(fallbackError, 'xử lý tin nhắn');
      await message.reply(userMessage).catch(() => {
        logger.error('CHAT', 'Failed to send error message to user');
      });
    }
  }
}

module.exports = { handleChatRequest };
