const AICore = require('../../services/AICore');
const logger = require('../../utils/logger');
const { sendStreamingMessage } = require('../streamingHandler');
const { splitMessageIntoChunks } = require('./memoryRequestHandler');

async function handleChatRequest(message, content, ConversationService) {
  try {
    const userId = ConversationService.extractUserId(message);
    const conversationManager = require('../conversationManager');
    const prompts = require('../../config/prompts');
    
    await conversationManager.loadConversationHistory(userId, prompts.system.main, AICore.getModelName());
    let messages = conversationManager.getHistory(userId);
    
    const enhancedPrompt = `
      ${prompts.chat.responseStyle}
      ${messages.length <= 2 ? prompts.chat.newConversation : prompts.chat.ongoingConversation}
      ${prompts.chat.generalInstructions}
      ${content}
    `;
    
    await conversationManager.addMessage(userId, 'user', enhancedPrompt);
    messages = conversationManager.getHistory(userId);
    
    const validMessages = messages.filter(msg => msg.role && msg.content && msg.content.trim());
    
    const response = await sendStreamingMessage(message.channel, validMessages, {
      model: AICore.getModelName()
    });
    
    await conversationManager.addMessage(userId, 'assistant', response);
    
  } catch (streamError) {
    logger.warn('CHAT', 'Streaming failed, falling back to non-streaming:', streamError.message);
    
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
  }
}

module.exports = { handleChatRequest };
