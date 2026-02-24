const { sendStreamingMessage } = require('../../services/StreamingService');
const { DEFAULT_MODEL } = require('../../config/constants');
const { formatForDiscord } = require('../../utils/discordFormatter');
const Validators = require('../../utils/validators');
const logger = require('../../utils/logger');

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

    const messagesForAI = [...messages, { role: 'user', content: enhancedPrompt }];

    logger.debug('CHAT', `Messages before validation: ${messagesForAI.length}`);
    const validMessages = Validators.cleanMessages(messagesForAI);
    logger.debug('CHAT', `Messages after validation: ${validMessages.length}`);

    if (validMessages.length === 0) {
      throw new Error('No valid messages after validation');
    }

    const rawResponse = await sendStreamingMessage(message.channel, validMessages);
    const response = formatForDiscord(rawResponse);

    await conversationManager.addMessage(userId, 'user', enhancedPrompt);
    await conversationManager.addMessage(userId, 'assistant', response);

  } catch (streamError) {
    const ErrorHandler = require('../../utils/ErrorHandler');
    ErrorHandler.logError('CHAT', 'Streaming failed, falling back to non-streaming', streamError, 'warn');

    try {
      let response = await ConversationService.getCompletion(content, message);
      response = formatForDiscord(response);

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
