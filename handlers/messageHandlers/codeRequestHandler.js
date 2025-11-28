const AICore = require('../../services/AICore');
const logger = require('../../utils/logger');
const { sendStreamingMessage } = require('../streamingHandler');
const { splitMessageIntoChunks } = require('./memoryRequestHandler');

function formatCodeResponse(text) {
  let language = 'javascript';

  const langPatterns = {
    python: /import\s+[\w.]+|def\s+\w+\s*\(|print\s*\(/i,
    javascript: /const|let|var|function|=>|\bif\s*\(|console\.log/i,
    java: /public\s+class|void\s+main|System\.out|import\s+java/i,
    html: /<html|<div|<body|<head|<!DOCTYPE/i,
    css: /body\s*{|margin:|padding:|color:|@media/i,
    php: /<\?php|\$\w+\s*=/i
  };

  for (const [lang, pattern] of Object.entries(langPatterns)) {
    if (pattern.test(text)) {
      language = lang;
      break;
    }
  }

  return `\`\`\`${language}\n${text}\n\`\`\``;
}

async function handleCodeRequest(message, content, ConversationService) {
  await message.channel.sendTyping();

  try {
    const promptContent = content.replace(/<@!?\d+>/g, '').trim();
    const userId = ConversationService.extractUserId(message);
    const conversationManager = require('../conversationManager');
    const prompts = require('../../config/prompts');
    
    await conversationManager.loadConversationHistory(userId, prompts.system.main, AICore.getModelName());
    let messages = conversationManager.getHistory(userId);
    
    const enhancedPrompt = `
      ${prompts.chat.responseStyle}
      ${messages.length <= 2 ? prompts.chat.newConversation : prompts.chat.ongoingConversation}
      ${prompts.chat.generalInstructions}
      Code request: ${promptContent}
    `;
    
    await conversationManager.addMessage(userId, 'user', enhancedPrompt);
    messages = conversationManager.getHistory(userId);
    
    const validMessages = messages.filter(msg => msg.role && msg.content && msg.content.trim());
    
    const response = await sendStreamingMessage(message.channel, validMessages, {
      model: AICore.getModelName()
    });
    
    let formattedResponse = response;
    if (!formattedResponse.includes('```')) {
      formattedResponse = formatCodeResponse(formattedResponse);
    }
    
    await conversationManager.addMessage(userId, 'assistant', response);
    
  } catch (streamError) {
    logger.warn('CODE', 'Code streaming failed, falling back to non-streaming:', streamError.message);
    
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
    } catch (error) {
      logger.error('CODE', `Error getting code for ${message.author.tag}:`, error);
      await message.reply('Xin lỗi, tôi gặp khó khăn khi tạo mã đó.');
    }
  }
}

module.exports = { handleCodeRequest, formatCodeResponse };
