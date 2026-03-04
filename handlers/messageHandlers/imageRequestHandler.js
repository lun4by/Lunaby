const { AttachmentBuilder } = require('discord.js');
const logger = require('../../utils/logger');
const ImageService = require('../../services/ImageService');
const QuotaService = require('../../services/QuotaService');
const { createLunabyEmbed } = require('../../utils/embedUtils');
const ErrorHandler = require('../../utils/ErrorHandler');
const conversationManager = require('../conversationManager');

async function handleImageRequest(message, content, requestMatch) {
    try {
        const conversationId = conversationManager.extractUserId ? conversationManager.extractUserId(message) : (message.guildId ? `${message.guildId}-${message.author.id}` : `DM-${message.author.id}`);
        const globalUserId = message.author.id;

        const quotaCheck = await QuotaService.canUseMessages(globalUserId, 1);
        if (!quotaCheck.allowed) {
            const embed = createLunabyEmbed()
                .setTitle('Hết quyền sử dụng')
                .setDescription(`> Bạn đã sử dụng hết **${quotaCheck.limit} lượt** tạo ảnh AI trong chu kỳ giới hạn.\n> Vui lòng nâng cấp tài khoản hoặc đợi chu kỳ tiếp theo để tiếp tục sử dụng.`)
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

        await message.reply({ content: `✨ Đây là tác phẩm Lunaby vẽ cho bạn nè`, files: [attachment] });
        waitMsg.delete().catch(() => { });

        await conversationManager.addMessage(conversationId, 'user', `[Yêu cầu vẽ ảnh]: ${userPrompt}`);
        await conversationManager.addMessage(conversationId, 'assistant', `[Đã gửi 1 hình ảnh] Của bạn đây! Mình đã vẽ theo yêu cầu: "${userPrompt}"`);

        await QuotaService.recordMessageUsage(globalUserId, 1);

    } catch (error) {
        logger.error('IMAGE', 'Error processing image generation:', error);

        let errorText = "Aaa! Lunaby lỡ tay làm hỏng mất rồi, bạn thử yêu cầu lại được hong";
        if (error.message.includes('Nội dung không phù hợp') || error.message.includes('blacklist')) {
            errorText = "Yêu cầu của bạn vi phạm tiêu chuẩn an toàn. Mình không thể vẽ cho bạn được.";
        }

        ErrorHandler.logError('IMAGE', 'Image Generation failed', error, 'warn');
        await message.reply(errorText).catch(() => { });
    }
}

module.exports = { handleImageRequest };