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
    const conversationId = conversationManager.extractUserId
      ? conversationManager.extractUserId(message)
      : (message.guildId ? `${message.guildId}-${message.author.id}` : `DM-${message.author.id}`);
    const globalUserId = message.author.id;

    const quotaCheck = await QuotaService.canUseImages(globalUserId, 1);
    if (!quotaCheck.allowed) {
      if (message.t) {
        return message.reply(message.t('system.quota_exceeded_image', { limit: quotaCheck.limit })).catch(() => {});
      }
      return message.reply(`Hết quyền sử dụng. Bạn đã đạt giới hạn ${quotaCheck.limit} lượt Lunaby Vision.`).catch(() => {});
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
