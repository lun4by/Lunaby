const AICore = require('../../services/ai/AICore');
const logger = require('../../utils/logger');
const { sendStreamingMessage } = require('../../services/ai/StreamingService');
const { splitMessageIntoChunks } = require('./memoryRequestHandler');
const { DEFAULT_MODEL } = require('../../config/constants');
const Validators = require('../../utils/validators');
const conversationManager = require('../conversationManager');
const prompts = require('../../config/prompts');
const ErrorHandler = require('../../utils/ErrorHandler');
const QuotaService = require('../../services/user/QuotaService');
const { createLunabyEmbed } = require('../../utils/embedUtils');

async function handleChatRequest(message, content, ConversationService) {
  const conversationId = ConversationService.extractUserId(message);
  const globalUserId = message.author.id;

  try {

    const quotaCheck = await QuotaService.canUseMessages(globalUserId, 1);
    if (!quotaCheck.allowed) {
      if (message.t) {
        return message.reply(message.t('system.quota_exceeded', { limit: quotaCheck.limit })).catch(() => { });
      }
      return message.reply(`Hết quyền sử dụng. Bạn đã đạt giới hạn ${quotaCheck.limit} lượt.`).catch(() => { });
    }

    const langKey = message.t ? message.t('system.lang_name') : 'Vietnamese';
    const systemPrompt = prompts.system.main.replace(/\$\{language\}/g, langKey);
    await conversationManager.loadConversationHistory(conversationId, systemPrompt, DEFAULT_MODEL);
    let messages = conversationManager.getHistory(conversationId);

    const enhancedPrompt = `
      ${prompts.chat.instructions}
      ${content}
    `;

    await conversationManager.addMessage(conversationId, 'user', enhancedPrompt);
    messages = conversationManager.getHistory(conversationId);

    logger.debug('chat', `Messages before validation: ${messages.length}`);
    const validMessages = Validators.cleanMessages(messages);
    logger.debug('chat', `Messages after validation: ${validMessages.length}`);

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
        logger.error('chat', 'ConversationService returned null/undefined');
        const errStr = message.t ? message.t('system.error_occurred') : 'Xin lỗi, tôi không thể xử lý tin nhắn của bạn lúc này.';
        await message.reply(errStr).catch(() => { });
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
        logger.error('chat', 'Failed to send error message to user');
      });
    }
  }
}

module.exports = { handleChatRequest };