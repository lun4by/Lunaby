const { AttachmentBuilder } = require('discord.js');
const logger = require('../../utils/logger');
const ImageService = require('../../services/ImageService');
const QuotaService = require('../../services/QuotaService');
const { createLunabyEmbed } = require('../../utils/embedUtils');
const ErrorHandler = require('../../utils/ErrorHandler');
const conversationManager = require('../conversationManager');

async function handleImageRequest(message, content, requestMatch) {
    try {
        const userId = message.author.id;

        const quotaCheck = await QuotaService.canUseMessages(userId, 1);
        if (!quotaCheck.allowed) {
            const embed = createLunabyEmbed()
                .setTitle('Hết quyền sử dụng')
                .setDescription(`> Bạn đã sử dụng hết **${quotaCheck.limit} lượt** tạo ảnh AI trong chu kỳ giới hạn.\n\n> Vui lòng nâng cấp tài khoản hoặc đợi chu kỳ tiếp theo để tiếp tục sử dụng.`)
                .setColor(0xE74C3C);
            return message.reply({ embeds: [embed] }).catch(() => { });
        }

        const userPrompt = requestMatch && requestMatch[1] ? requestMatch[1].trim() : content;

        if (!userPrompt || userPrompt.length < 2) {
            return message.reply("Bạn muốn mình vẽ gì nào? Hãy diễn tả thật chi tiết chút coi!");
        }

        const waitMsg = await message.reply("✨ Chờ xíu nhaa, Lunaby đang đang vẽ cho bạn nà...");

        const imageResult = await ImageService.generateImage(userPrompt);

        const attachment = new AttachmentBuilder(imageResult.localPath, { name: 'lunaby_art.png' });

        const embed = createLunabyEmbed()
            .setAuthor({ name: message.author.tag, iconURL: message.author.displayAvatarURL() })
            .setDescription(`**Yêu cầu:** ${userPrompt}`)
            .setImage('attachment://lunaby_art.png')
            .setColor(0xA020F0);

        await message.reply({ embeds: [embed], files: [attachment] });
        waitMsg.delete().catch(() => { });

        await conversationManager.addMessage(userId, 'user', `[Yêu cầu vẽ ảnh]: ${userPrompt}`);
        await conversationManager.addMessage(userId, 'assistant', `[Đã gửi 1 hình ảnh] Của bạn đây! Mình đã vẽ theo yêu cầu: "${userPrompt}"`);

        await QuotaService.recordMessageUsage(userId, 1);

    } catch (error) {
        logger.error('IMAGE', 'Error processing image generation:', error);

        let errorText = "Xin lỗi, mình gặp lỗi khi đang vẽ tranh. Vui lòng thử lại sau nhé!";
        if (error.message.includes('Nội dung không phù hợp') || error.message.includes('blacklist')) {
            errorText = "Yêu cầu của bạn vi phạm tiêu chuẩn an toàn (chứa từ khóa nhạy cảm). Mình không thể vẽ được.";
        }

        ErrorHandler.logError('IMAGE', 'Image Generation failed', error, 'warn');
        await message.reply(errorText).catch(() => { });
    }
}

module.exports = { handleImageRequest };