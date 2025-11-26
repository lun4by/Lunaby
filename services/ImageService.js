const fs = require("fs");
const axios = require("axios");

const logger = require("../utils/logger.js");
const storageDB = require("./storagedb.js");
const AICore = require("./AICore.js");

class ImageService {
  constructor() {
    logger.info("IMAGE_SERVICE", `Initialized with Lunaby Vision API`);
  }

  
  async generateImage(prompt, options = {}) {
    try {
      logger.info("IMAGE_SERVICE", `Đang tạo hình ảnh với prompt: "${prompt}"`);

      const blacklistCheck = await storageDB.checkImageBlacklist(prompt);
      const isBlocked = blacklistCheck.isBlocked;

      if (isBlocked) {
        const errorMsg = `Prompt chứa nội dung không phù hợp`;
        logger.warn("IMAGE_SERVICE", errorMsg);
        throw new Error(errorMsg);
      }

      const finalPrompt = prompt;

      const messages = [
        {
          role: "user",
          content: finalPrompt
        }
      ];

      const result = await AICore.processChatCompletion(messages, {
        modelType: 'image',
        max_tokens: 4096,
        aspect_ratio: options.aspect_ratio || '1:1',
        output_format: options.output_format || 'png'
      });

      if (!result || !result.content) {
        const errorMsg = "Không nhận được phản hồi hợp lệ từ Lunaby Vision API";
        throw new Error(errorMsg);
      }

      // AICore đã extract base64 string từ response.data[0].b64_json
      const base64Image = result.content.trim();
      const revisedPrompt = result.revised_prompt || prompt;
      
      logger.info("IMAGE_SERVICE", `Received base64 image, length: ${base64Image.length} bytes`);
      if (result.revised_prompt) {
        logger.info("IMAGE_SERVICE", `Revised prompt: ${revisedPrompt}`);
      }

      const uniqueFilename = `generated_image_${Date.now()}.png`;
      const outputPath = `./temp/${uniqueFilename}`;
      
      if (!fs.existsSync("./temp")) {
        fs.mkdirSync("./temp", { recursive: true });
      }

      let imageBuffer;
      try {
        imageBuffer = Buffer.from(base64Image, "base64");
        fs.writeFileSync(outputPath, imageBuffer);
        logger.info("IMAGE_SERVICE", `Saved image successfully, size: ${imageBuffer.length} bytes`);
      } catch (base64Error) {
        const errorMsg = `Không thể parse base64 image data: ${base64Error.message}`;
        throw new Error(errorMsg);
      }

      logger.info("IMAGE_SERVICE", `Đã tạo hình ảnh thành công: ${outputPath}`);

      return {
        buffer: imageBuffer,
        url: "base64_image_data",
        localPath: outputPath,
        source: `Lunaby-Vision`,
        revisedPrompt: revisedPrompt,
        usage: result.usage
      };
    } catch (error) {
      let userMessage = error.message;
      
      if (error.details) {
        userMessage = error.details;
      }

      if (userMessage.includes("vi phạm chính sách") || 
          userMessage.includes("không được phép") ||
          userMessage.includes("content") ||
          userMessage.includes("policy") ||
          userMessage.includes("safety")) {
        userMessage = "Nội dung yêu cầu vi phạm chính sách an toàn: Hình ảnh không được tạo do chứa nội dung không phù hợp";
      } else if (userMessage.includes("hệ thống API") || userMessage.includes("Internal")) {
        userMessage = "Hệ thống AI đang bận: Vui lòng thử lại sau vài phút";
      }

      logger.error("IMAGE_SERVICE", `Lỗi khi tạo hình ảnh: ${error.message}`);
      
      throw new Error(userMessage);
    }
  }

}

module.exports = new ImageService(); 