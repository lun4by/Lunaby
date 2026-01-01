const AICore = require('../../services/AICore');
const logger = require('../../utils/logger');
const { sendStreamingMessage } = require('../../services/StreamingService');
const { splitMessageIntoChunks } = require('./memoryRequestHandler');
const { DEFAULT_MODEL } = require('../../config/constants');

function formatCodeResponse(text) {
  const { LANGUAGE_DETECTION_PATTERNS } = require('../../config/patterns');
  let language = 'javascript';

  for (const [lang, pattern] of Object.entries(LANGUAGE_DETECTION_PATTERNS)) {
    if (pattern.test(text)) {
      language = lang;
      break;
    }
  }

  return `\`\`\`${language}\n${text}\n\`\`\``;
}

async function handleCodeRequest(message, content, ConversationService) {
  const Validators = require('../../utils/validators');

  await message.channel.sendTyping();

  try {
    const promptContent = content.replace(/<@!?\d+>/g, '').trim();
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
      Code request: ${promptContent}
    `;

    await conversationManager.addMessage(userId, 'user', enhancedPrompt);
    messages = conversationManager.getHistory(userId);

    const validMessages = Validators.cleanMessages(messages);

    if (validMessages.length === 0) {
      throw new Error('No valid messages for code request');
    }

    const response = await sendStreamingMessage(message.channel, validMessages);

    let formattedResponse = response;
    if (!formattedResponse.includes('```')) {
      formattedResponse = formatCodeResponse(formattedResponse);
    }

    await conversationManager.addMessage(userId, 'assistant', response);

  } catch (streamError) {
    const ErrorHandler = require('../../utils/ErrorHandler');
    const logger = require('../../utils/logger');

    ErrorHandler.logError('CODE', 'Code streaming failed, falling back to non-streaming', streamError, 'warn');

    try {
      const result = await AICore.getCodeCompletion(content, message);
      let formattedResponse = result.content || result;

      if (!formattedResponse.includes('```')) {
        formattedResponse = formatCodeResponse(formattedResponse);
      }

      if (formattedResponse.length > 2000) {
        const chunks = splitMessageIntoChunks(formattedResponse);
        for (const chunk of chunks) {
          await message.reply(chunk);
        }
      } else {
        await message.reply(formattedResponse);
      }
    } catch (fallbackError) {
      ErrorHandler.logError('CODE', 'Both streaming and fallback failed', fallbackError);
      const userMessage = ErrorHandler.getUserFriendlyMessage(fallbackError, 'tạo mã');
      await message.reply(userMessage).catch(() => {
        logger.error('CODE', 'Failed to send error message to user');
      });
    }
  }
}

module.exports = { handleCodeRequest, formatCodeResponse };
