const logger = require('../../utils/logger');
const { DISCORD_MESSAGE_MAX_LENGTH } = require('../../config/constants');
const QuotaService = require('../../services/QuotaService');
const { createLunabyEmbed } = require('../../utils/embedUtils');

function splitMessageIntoChunks(text, maxLength = DISCORD_MESSAGE_MAX_LENGTH) {
  const chunks = [];

  if (text.includes('```')) {
    const parts = text.split(/(```(?:\w+)?\n[\s\S]*?```)/g);

    let currentChunk = '';

    for (const part of parts) {
      if (currentChunk.length + part.length > maxLength) {
        chunks.push(currentChunk);
        currentChunk = part;
      } else {
        currentChunk += part;
      }
    }

    if (currentChunk) {
      chunks.push(currentChunk);
    }
  } else {
    let startPos = 0;

    while (startPos < text.length) {
      if (startPos + maxLength >= text.length) {
        chunks.push(text.substring(startPos));
        break;
      }

      let endPos = startPos + maxLength;
      while (endPos > startPos && text[endPos] !== ' ' && text[endPos] !== '\n') {
        endPos--;
      }

      if (endPos === startPos) {
        endPos = startPos + maxLength;
      } else {
        endPos++;
      }

      chunks.push(text.substring(startPos, endPos));
      startPos = endPos;
    }
  }

  return chunks;
}

async function handleMemoryRequest(message, ConversationService, memoryRequest) {
  try {
    const conversationId = ConversationService.extractUserId(message);
    const globalUserId = message.author.id;



    const memoryAnalysis = await ConversationService.getMemoryAnalysis(conversationId, memoryRequest);

    if (memoryAnalysis.length > DISCORD_MESSAGE_MAX_LENGTH) {
      const chunks = splitMessageIntoChunks(memoryAnalysis);
      for (const chunk of chunks) {
        await message.reply(chunk);
      }
    } else {
      await message.reply(memoryAnalysis);
    }

  } catch (error) {
    logger.error('MEMORY', 'Error handling memory request:', error);
    await message.reply('Xin lỗi, mình gặp lỗi khi truy cập trí nhớ của cuộc trò chuyện.').catch(() => { });
  }
}

module.exports = { handleMemoryRequest, splitMessageIntoChunks };