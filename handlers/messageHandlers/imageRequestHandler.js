const { AttachmentBuilder } = require('discord.js');
const ImageService = require('../../services/ImageService');
const logger = require('../../utils/logger');
const { TYPING_INDICATOR_INTERVAL_MS } = require('../../config/constants');

async function handleImageRequest(message, imagePrompt) {
  try {
    const waitMessage = await message.reply('🎨 Đang tạo hình ảnh, vui lòng chờ...');
    
    const typingInterval = setInterval(() => {
      message.channel.sendTyping().catch(() => {});
    }, TYPING_INDICATOR_INTERVAL_MS);

    const imageResult = await ImageService.generateImage(imagePrompt, {
      aspect_ratio: '1:1',
      output_format: 'png'
    });

    clearInterval(typingInterval);

    if (imageResult && imageResult.buffer) {
      const attachment = new AttachmentBuilder(imageResult.buffer, { name: 'generated-image.png' });
      await waitMessage.edit({ content: '🎨 Hình ảnh đã được tạo!', files: [attachment] });
    } else {
      await waitMessage.edit('Không thể tạo ảnh. Vui lòng thử lại sau.');
      logger.warn('IMAGE', 'Image generation returned no result buffer');
    }
  } catch (imageError) {
    logger.error('IMAGE', 'Error while generating image:', imageError);
    
    let errorMessage = 'Đã xảy ra lỗi khi tạo ảnh.';
    
    if (imageError.message) {
      if (imageError.message.includes('vi phạm') || imageError.message.includes('không phù hợp')) {
        errorMessage = '❌ ' + imageError.message;
      } else if (imageError.message.includes('bận') || imageError.message.includes('thử lại')) {
        errorMessage = '⏳ ' + imageError.message;
      } else {
        errorMessage = imageError.message;
      }
    }

    await message.reply(errorMessage);
  }
}

module.exports = { handleImageRequest };
