const { EmbedBuilder } = require('discord.js');
const ConversationService = require('../services/ConversationService');
const AICore = require('../services/AICore');
const experience = require('../utils/xp');
const consentService = require('../services/consentService');
const { handlePermissionError } = require('../utils/permissionUtils');
const logger = require('../utils/logger.js');
const guildProfileDB = require('../services/guildprofiledb');
const { sendStreamingMessage } = require('./streamingHandler');

async function processXp(message, commandExecuted, execute) {
  try {
    const response = await experience(message, commandExecuted, execute);

    if (!response.xpAdded && ![
      'DISABLED',
      'COMMAND_EXECUTED',
      'COMMAND_TERMINATED',
      'DM_CHANNEL',
      'GUILD_SETTINGS_NOT_FOUND',
      'DISABLED_ON_GUILD',
      'DISABLED_ON_CHANNEL',
      'RECENTLY_TALKED'
    ].includes(response.reason)) {
      logger.error('XP', `Lỗi XP: ${response.reason} tại ${message.guild.id}<${message.guild.name}> bởi ${message.author.tag}<${message.author.id}> lúc ${new Date()}`);
    }

    if (response.xpAdded && response.level && response.previousLevel && response.level > response.previousLevel) {
      logger.info('XP', `${message.author.tag} đã lên cấp ${response.level} trong server ${message.guild.name}`);

      const guildProfile = await guildProfileDB.getGuildProfile(message.guild.id);

      if (guildProfile?.settings?.levelUpNotifications) {
        const settings = guildProfile.settings;

        if (settings.useEmbeds) {
          const embed = new EmbedBuilder()
            .setTitle('🎉 Chúc mừng Level-up!')
            .setDescription(`${message.author} đã đạt cấp độ **${response.level}**!`)
            .setColor(0x00FF00)
            .setThumbnail(message.author.displayAvatarURL())
            .setTimestamp();

          // await message.channel.send({ embeds: [embed] }).catch(() => {});
        } else {
          // await message.channel.send(`🎉 Chúc mừng ${message.author}! Bạn đã đạt cấp độ ${response.level}!`).catch(() => {});
        }
      }
    }
  } catch (error) {
    logger.error('XP', 'Lỗi khi xử lý XP:', error);
  }
}

async function handleMentionMessage(message, client) {
  if (message.author.bot) return;

  const isDM = !message.guild;
  const shouldRespond = isDM || message.mentions.has(client.user);

  if (shouldRespond) {
    const hasEveryoneOrRoleMention = message.mentions.everyone || message.mentions.roles.size > 0;

    if (!hasEveryoneOrRoleMention) {
      const typingPromise = message.channel.sendTyping().catch(() => { });

      logger.info('CHAT', `Xử lý tin nhắn từ ${message.author.tag}`);

      const hasConsented = await consentService.hasUserConsented(message.author.id);

      if (!hasConsented) {
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
          await message.reply('Tôi có thể giúp gì cho bạn hôm nay?');
          return;
        }

        await typingPromise;

        const requestType = ConversationService.detectRequestType(content);
        
        if (requestType.type === 'image') {
          const imagePrompt = requestType.match[2];
          const commandUsed = requestType.match[1];
          logger.info('CHAT', `Image command detected: "${commandUsed}". Prompt: ${imagePrompt}`);
          await message.reply(`Để tạo hình ảnh, vui lòng sử dụng lệnh /image với nội dung bạn muốn tạo. Ví dụ:\n/image ${imagePrompt}`);
          return;
        }

        if (requestType.type === 'memory') {
          const memoryRequest = requestType.match[2].trim() || "toàn bộ cuộc trò chuyện";
          const userId = ConversationService.extractUserId(message);
          const memoryAnalysis = await ConversationService.getMemoryAnalysis(userId, memoryRequest);
          
          if (memoryAnalysis.length > 2000) {
            const chunks = splitMessageRespectWords(memoryAnalysis, 2000);
            for (const chunk of chunks) {
              await message.reply(chunk);
            }
          } else {
            await message.reply(memoryAnalysis);
          }
          return;
        }

        if (requestType.type === 'code') {
          await handleCodeRequest(message, content);
          return;
        }

        // Try streaming response first
        try {
          const userId = ConversationService.extractUserId(message);
          const conversationManager = require('./conversationManager');
          const prompts = require('../config/prompts');
          
          // Load conversation history
          await conversationManager.loadConversationHistory(userId, prompts.system.main, AICore.getModelName());
          let messages = conversationManager.getHistory(userId);
          
          // Add current user message
          const enhancedPrompt = `
            ${prompts.chat.responseStyle}
            ${messages.length <= 2 ? prompts.chat.newConversation : prompts.chat.ongoingConversation}
            ${prompts.chat.generalInstructions}
            ${content}
          `;
          
          await conversationManager.addMessage(userId, 'user', enhancedPrompt);
          messages = conversationManager.getHistory(userId);
          
          // Filter and validate messages
          const validMessages = messages.filter(msg => msg.role && msg.content && msg.content.trim());
          
          // Send streaming message
          const response = await sendStreamingMessage(message.channel, validMessages, {
            model: AICore.getModelName()
          });
          
          // Save assistant response to history
          await conversationManager.addMessage(userId, 'assistant', response);
          
          logger.info('CHAT', `✓ Streaming completed [${message.author.tag}]`);
          
        } catch (streamError) {
          logger.warn('CHAT', 'Streaming failed, falling back to non-streaming:', streamError.message);
          
          // Fallback to non-streaming
          const response = await ConversationService.getCompletion(content, message);

          if (!response) {
            logger.error('CHAT', 'ConversationService trả về null/undefined');
            await message.reply('Xin lỗi, tôi không thể xử lý tin nhắn của bạn lúc này.');
            return;
          }

          // Xử lý response dài
          if (response.length > 2000) {
            const chunks = splitMessageRespectWords(response, 2000);
            for (const chunk of chunks) {
              await message.reply(chunk);
            }
          } else {
            await message.reply(response);
          }
        }

        logger.info('CHAT', `✓ Xử lý thành công [${message.author.tag}]`);

        // if (message.guild) {
        //   processXp(message, false, true).catch(err => 
        //     logger.error('XP', 'Error processing XP:', err)
        //   );
        // }

      } catch (error) {
        logger.error('CHAT', `Lỗi khi xử lý tin nhắn từ ${message.author.tag}:`, error);

        let errorMessage = 'Xin lỗi, tôi gặp lỗi khi xử lý tin nhắn của bạn. Vui lòng thử lại sau.';

        if (error.message.includes('Không có API provider nào được cấu hình')) {
          errorMessage = 'Xin lỗi, hệ thống AI hiện tại không khả dụng. Vui lòng thử lại sau.';
        } else if (error.message.includes('Tất cả providers đã thất bại')) {
          errorMessage = 'Xin lỗi, tất cả nhà cung cấp AI đều không khả dụng. Vui lòng thử lại sau.';
        } else if (error.code === 'EPROTO' || error.code === 'ECONNREFUSED' || error.message.includes('connect')) {
          errorMessage = 'Xin lỗi, tôi đang gặp vấn đề kết nối. Vui lòng thử lại sau hoặc liên hệ quản trị viên để được hỗ trợ.';
        }

        await message.reply(errorMessage);

        // if (message.guild) {
        //   processXp(message, false, false).catch(err => 
        //     logger.error('XP', 'Error processing XP:', err)
        //   );
        // }
      }
    } else {
      // if (message.guild) {
      //   processXp(message, false, false).catch(err => 
      //     logger.error('XP', 'Error processing XP:', err)
      //   );
      // }
    }
  }
}

async function handleCodeRequest(message, prompt) {
  await message.channel.sendTyping();

  try {
    const result = await AICore.getCodeCompletion(prompt, message);
    let formattedResponse = result.content || result;

    if (!formattedResponse.includes('```')) {
      formattedResponse = formatCodeResponse(formattedResponse);
    }

    if (formattedResponse.length > 2000) {
      const chunks = splitMessageRespectWords(formattedResponse, 2000);
      for (const chunk of chunks) {
        await message.reply(chunk);
      }
    } else {
      await message.reply(formattedResponse);
    }
  } catch (error) {
    logger.error('CODE', `Lỗi khi nhận mã cho ${message.author.tag}:`, error);
    await message.reply('Xin lỗi, tôi gặp khó khăn khi tạo mã đó.');
  }
}

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

function splitMessageRespectWords(text, maxLength = 2000) {
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


module.exports = {
  handleMentionMessage,
  processXp,
  splitMessageRespectWords
};
