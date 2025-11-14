const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
const ConversationService = require('../services/ConversationService');
const ImageService = require('../services/ImageService');
const AICore = require('../services/AICore');
const experience = require('../utils/xp');
const consentService = require('../services/consentService');
const { handlePermissionError } = require('../utils/permissionUtils');
const logger = require('../utils/logger.js');
const guildProfileDB = require('../services/guildprofiledb');
const guildProfile = await guildProfileDB.getGuildProfile(message.guild.id);


/**
 * Xử lý hệ thống XP cho người dùng
 * @param {Object} message - Đối tượng tin nhắn từ Discord.js
 * @param {Boolean} commandExecuted - Có lệnh nào được thực thi không
 * @param {Boolean} execute - Có nên tiếp tục thực thi không
 */
async function processXp(message, commandExecuted, execute) {
  try {
    const response = await experience(message, commandExecuted, execute);

    if (!response.xpAdded && ![
      'DISABLED',             // XP bị tắt, cần EXPERIENCE_POINTS trong client#features
      'COMMAND_EXECUTED',     // Lệnh đã được thực thi thành công
      'COMMAND_TERMINATED',   // Lệnh đã được tìm nhưng đã bị chấm dứt
      'DM_CHANNEL',           // Tin nhắn được gửi trong DM
      'GUILD_SETTINGS_NOT_FOUND', // Không tìm thấy cài đặt của guild
      'DISABLED_ON_GUILD',    // XP bị tắt trên server này
      'DISABLED_ON_CHANNEL',  // Tin nhắn được gửi trong kênh bị chặn XP
      'RECENTLY_TALKED'       // Người gửi vừa nói gần đây
    ].includes(response.reason)) {
      logger.error('XP', `Lỗi XP: ${response.reason} tại ${message.guild.id}<${message.guild.name}> bởi ${message.author.tag}<${message.author.id}> lúc ${new Date()}`);
    }

    if (response.xpAdded && response.level && response.previousLevel && response.level > response.previousLevel) {
      logger.info('XP', `${message.author.tag} đã lên cấp ${response.level} trong server ${message.guild.name}`);
      
      if (guildProfile?.settings?.levelUpNotifications) {
        const settings = guildProfile.settings;
        
        if (settings.useEmbeds) {
          const embed = new EmbedBuilder()
            .setTitle('🎉 Chúc mừng Level-up!')
            .setDescription(`${message.author} đã đạt cấp độ **${response.level}**!`)
            .setColor(0x00FF00)
            .setThumbnail(message.author.displayAvatarURL())
            .setTimestamp();
          
          await message.channel.send({ embeds: [embed] }).catch(() => {});
        } else {
          await message.channel.send(`🎉 Chúc mừng ${message.author}! Bạn đã đạt cấp độ ${response.level}!`).catch(() => {});
        }
      }
    }
  } catch (error) {
    logger.error('XP', 'Lỗi khi xử lý XP:', error);
  }
}

/**
 * Xử lý tin nhắn Discord đề cập đến bot (gộp handleMentionMessage và handleChatRequest)
 * @param {import('discord.js').Message} message - Đối tượng tin nhắn Discord
 * @param {import('discord.js').Client} client - Client Discord.js
 */
async function handleMentionMessage(message, client) {
  if (message.author.bot) return;

  if (message.mentions.has(client.user)) {
    const hasEveryoneOrRoleMention = message.mentions.everyone || message.mentions.roles.size > 0;

    if (!hasEveryoneOrRoleMention) {
      const typingPromise = message.channel.sendTyping().catch(() => {});
      
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
        const TokenService = require('../services/TokenService.js');
        const userId = message.author.id;
        
        const content = message.content.replace(/<@!?\d+>/g, '').trim();
        
        if (!content) {
          await message.reply('Tôi có thể giúp gì cho bạn hôm nay?');
          return;
        }

        const [messageCheck] = await Promise.all([
          TokenService.canUseMessages(userId, 1),
          typingPromise 
        ]);

        if (!messageCheck.allowed) {
          const roleNames = {
            user: 'Người dùng',
            helper: 'Helper',
            admin: 'Admin',
            owner: 'Owner'
          };
          
          await message.reply(
            `**Giới hạn Lượt nhắn tin**\n\n` +
            `Bạn đã sử dụng hết giới hạn lượt nhắn tin hàng ngày!\n\n` +
            `**Thông tin:**\n` +
            `• Vai trò: ${roleNames[messageCheck.role] || messageCheck.role}\n` +
            `• Đã sử dụng: ${messageCheck.current.toLocaleString()} lượt\n` +
            `• Giới hạn: ${messageCheck.limit.toLocaleString()} lượt/ngày\n` +
            `• Còn lại: ${messageCheck.remaining.toLocaleString()} lượt\n\n` +
            `Giới hạn sẽ được reset vào ngày mai. Vui lòng quay lại sau!`
          );
          return;
        }

        // Xử lý code request nếu phát hiện keywords
        const lowerContent = content.toLowerCase();
        if (lowerContent.includes('code') ||
            lowerContent.includes('function') ||
            lowerContent.includes('write a')) {
          await handleCodeRequest(message, content);
          return;
        }

        // Lấy response từ AI (với auto-search nếu cần)
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

        logger.info('CHAT', `✓ Xử lý thành công [${message.author.tag}]`);

        if (message.guild) {
          processXp(message, false, true).catch(err => 
            logger.error('XP', 'Error processing XP:', err)
          );
        }

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
        
        if (message.guild) {
          processXp(message, false, false).catch(err => 
            logger.error('XP', 'Error processing XP:', err)
          );
        }
      }
    } else {
      if (message.guild) {
        processXp(message, false, false).catch(err => 
          logger.error('XP', 'Error processing XP:', err)
        );
      }
    }
  }
}

async function handleImageGeneration(message, prompt) {
  if (!prompt) {
    await message.reply('Vui lòng cung cấp mô tả cho hình ảnh bạn muốn tôi tạo.');
    return;
  }

  await message.channel.sendTyping();

  try {
    const imageResult = await ImageService.generateImage(prompt);

    if (typeof imageResult === 'string') {
      await message.reply(imageResult);
      return;
    }

    const attachment = new AttachmentBuilder(imageResult.buffer, { name: 'generated-image.png' });

    const embed = new EmbedBuilder()
      .setTitle('Hình Ảnh Được Tạo')
      .setDescription(`Mô tả: ${prompt}`)
      .setColor('#0099ff')
      .setTimestamp();

    try {
      await message.reply({ 
        embeds: [embed],
        files: [attachment]
      });
    } catch (error) {
      if (error.code === 50013 || error.message.includes('permission')) {
        await handlePermissionError(message, 'embedLinks', message.author.username, 'reply');
      } else {
        throw error;
      }
    }
  } catch (error) {
    logger.error('IMAGE', 'Lỗi khi tạo hình ảnh:', error);
    await message.reply('Xin lỗi, tôi gặp khó khăn khi tạo hình ảnh đó.');
  }
}

async function handleCodeRequest(message, prompt) {
  await message.channel.sendTyping();

  try {
    const TokenService = require('../services/TokenService.js');
    const userId = message.author.id;
    const tokenCheck = await TokenService.canUseMessages(userId, 1);

    if (!tokenCheck.allowed) {
      const roleNames = {
        user: 'Người dùng',
        helper: 'Helper',
        admin: 'Admin',
        owner: 'Owner'
      };
      
      await message.reply(
        `**Giới hạn Lượt nhắn tin**\n\n` +
        `Bạn đã sử dụng hết giới hạn lượt nhắn tin hàng ngày!\n\n` +
        `**Thông tin:**\n` +
        `• Vai trò: ${roleNames[tokenCheck.role] || tokenCheck.role}\n` +
        `• Đã sử dụng: ${tokenCheck.current.toLocaleString()} lượt\n` +
        `• Giới hạn: ${tokenCheck.limit.toLocaleString()} lượt/ngày\n` +
        `• Còn lại: ${tokenCheck.remaining.toLocaleString()} lượt\n\n` +
        `Giới hạn sẽ được reset vào ngày mai. Vui lòng quay lại sau!`
      );
      return;
    }

    const result = await AICore.getCodeCompletion(prompt, message);
    let formattedResponse = result.content || result;

    if (result.usage && result.usage.total_tokens) {
      TokenService.recordMessageUsage(userId, 1, 'code').catch(() => {});
    }

    if (!formattedResponse.includes('```')) {
      formattedResponse = formatCodeResponse(formattedResponse);
    }

    if (formattedResponse.length > 2000) {
      const chunks = splitMessage(formattedResponse, 2000);
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

/**
 * Định dạng phản hồi dưới dạng khối mã nếu nó chưa được định dạng
 */
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

function splitMessage(text, maxLength = 2000) {
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
    for (let i = 0; i < text.length; i += maxLength) {
      chunks.push(text.substring(i, i + maxLength));
    }
  }

  return chunks;
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
  splitMessage,
  splitMessageRespectWords
};
