const AICore = require('../../services/AICore');
const logger = require('../../utils/logger');
const { sendStreamingMessage } = require('../../services/StreamingService');
const { splitMessageIntoChunks } = require('./memoryRequestHandler');
const { DEFAULT_MODEL } = require('../../config/constants');
const Validators = require('../../utils/validators');

async function handleChatRequest(message, content, ConversationService) {
  try {
    const userId = ConversationService.extractUserId(message);
    const conversationManager = require('../conversationManager');
    const prompts = require('../../config/prompts');

    await conversationManager.loadConversationHistory(userId, prompts.system.main, DEFAULT_MODEL);
    let messages = conversationManager.getHistory(userId);

    const isNewConversation = messages.length <= 2;
    const enhancedPrompt = `
      ${prompts.chat.responseStyle}
      ${isNewConversation ? prompts.chat.newConversation : prompts.chat.ongoingConversation}
      ${prompts.chat.generalInstructions}
      ${content}
    `;

    await conversationManager.addMessage(userId, 'user', enhancedPrompt);
    messages = conversationManager.getHistory(userId);

    logger.debug('CHAT', `Messages before validation: ${messages.length}`);
    const validMessages = Validators.cleanMessages(messages);
    logger.debug('CHAT', `Messages after validation: ${validMessages.length}`);

    if (validMessages.length === 0) {
      throw new Error('No valid messages after validation');
    }

    const replyTarget = message.guild ? message : null;
    const response = await sendStreamingMessage(message.channel, validMessages, {}, replyTarget);

    await conversationManager.addMessage(userId, 'assistant', response);

  } catch (streamError) {
    const ErrorHandler = require('../../utils/ErrorHandler');
    ErrorHandler.logError('CHAT', 'Streaming failed, falling back to non-streaming', streamError, 'warn');

    try {
      const response = await ConversationService.getCompletion(content, message);

      if (!response) {
        logger.error('CHAT', 'ConversationService returned null/undefined');
        await message.reply('Xin lỗi, tôi không thể xử lý tin nhắn của bạn lúc này.');
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
