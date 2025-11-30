const { handleChatRequest } = require('./chatRequestHandler');
const ConversationService = require('../../services/ConversationService');
const consentService = require('../../services/consentService');
const logger = require('../../utils/logger');

const threadLocks = new Map();
const LOCK_TIMEOUT = 30000;

async function handleAIThread(message, client) {
  if (message.author.bot) return false;

  const content = message.content.trim();
  if (!content) return false;

  const hasConsented = await consentService.hasUserConsented(message.author.id);
  if (!hasConsented) {
    const consentData = consentService.createConsentEmbed(message.author);
    await message.reply(consentData);
    return true;
  }

  const thread = message.channel;
  const lockKey = thread.id;

  if (threadLocks.get(lockKey)) {
    return true;
  }

  let wasLocked = thread.locked;

  try {
    threadLocks.set(lockKey, true);

    if (!wasLocked) {
      await thread.setLocked(true).catch(() => {});
    }

    const unlockTimeout = setTimeout(async () => {
      if (!wasLocked) {
        await thread.setLocked(false).catch(() => {});
      }
      threadLocks.delete(lockKey);
    }, LOCK_TIMEOUT);

    await thread.sendTyping().catch(() => {});

    await handleChatRequest(message, content, ConversationService);

    clearTimeout(unlockTimeout);
    
    if (!wasLocked) {
      await thread.setLocked(false).catch(() => {});
    }
    threadLocks.delete(lockKey);

  } catch (error) {
    logger.error('AI_THREAD', `Error: ${error.message}`);
    
    if (!wasLocked) {
      await thread.setLocked(false).catch(() => {});
    }
    threadLocks.delete(lockKey);

    await message.reply('Xin lỗi, mình gặp lỗi khi xử lý tin nhắn. Vui lòng thử lại!').catch(() => {});
  }

  return true;
}

module.exports = { handleAIThread };
