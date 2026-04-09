const { AttachmentBuilder } = require("discord.js");
const logger = require("../../utils/logger");
const ImageService = require("../../services/ai/ImageService");
const QuotaService = require("../../services/user/QuotaService");
const { createLunabyEmbed } = require("../../utils/embedUtils");
const ErrorHandler = require("../../utils/ErrorHandler");
const conversationManager = require("../conversationManager");
const emojis = require("../../config/emojis");

async function handleImageRequest(message, content, requestMatch) {
  try {
    const conversationId = message.author.id;
    const globalUserId = message.author.id;

    const quotaCheck = await QuotaService.canUseImages(globalUserId, 1);
    if (!quotaCheck.allowed) {
      const embed = createLunabyEmbed()
        .setTitle(`Hết quyền sử dụng`)
        .setDescription(`> Bạn đã sử dụng hết **${quotaCheck.limit} lượt** Lunaby Vision trong chu kỳ giới hạn.\n> Vui lòng nâng cấp tài khoản hoặc đợi chu kỳ tiếp theo để tiếp tục sử dụng.`)
        .setColor(0xE74C3C);

      return message.reply({ embeds: [embed] }).catch(() => { });
    }

    const userPrompt = requestMatch && requestMatch[1] ? requestMatch[1].trim() : content;

    if (!userPrompt || userPrompt.length < 2) {
      return message.reply(`${emojis.error} Bạn muốn mình vẽ gì nào? Hãy diễn tả thật chi tiết chút coi!`);
    }

    const waitMsg = await message.reply("✨ Chờ xíu nhaa, Lunaby đang vẽ cho bạn nà...");

    const imageResult = await ImageService.generateImage(userPrompt);
    const attachment = new AttachmentBuilder(imageResult.buffer, { name: "lunaby_art.png" });

    await waitMsg.edit({ content: "✨ Đây là tác phẩm Lunaby vẽ cho bạn nè", files: [attachment] });

    await conversationManager.addMessage(conversationId, "user", `[Yêu cầu vẽ ảnh]: ${userPrompt}`);
    await conversationManager.addMessage(conversationId, "assistant", `[Đã gửi 1 hình ảnh] Của bạn đây! Mình đã vẽ theo yêu cầu: "${userPrompt}"`);

    await QuotaService.recordImageUsage(globalUserId, 1);
  } catch (error) {
    logger.error("IMAGE", "Error processing image generation:", error);
    ErrorHandler.logError("IMAGE", "Image Generation failed", error, "warn");

    const errorText = ErrorHandler.getUserFriendlyMessage(error, "tạo ảnh");
    await message.reply(`${emojis.error} ${errorText}`).catch(() => { });
  }
}

module.exports = { handleImageRequest };
