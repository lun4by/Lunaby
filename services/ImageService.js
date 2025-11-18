const fs = require("fs");
const axios = require("axios");

const logger = require("../utils/logger.js");
const storageDB = require("./storagedb.js");
const AICore = require("./AICore.js");
const textUtils = require("../utils/textUtils.js");

class ImageService {
  constructor() {
    logger.info("IMAGE_SERVICE", `Initialized with Lunaby Vision API`);
  }

  
  async generateImage(prompt, message = null, progressTracker = null, options = {}) {
    progressTracker =
      progressTracker ||
      (message ? this.trackImageGenerationProgress(message, prompt) : null);

    try {
      logger.info("IMAGE_SERVICE", `Đang tạo hình ảnh với prompt: "${prompt}"`);

      const blacklistCheck = await storageDB.checkImageBlacklist(prompt);
      const isBlocked = blacklistCheck.isBlocked;

      if (isBlocked) {
        const errorMsg = `Prompt chứa nội dung không phù hợp`;

        if (progressTracker) {
          await progressTracker.error(errorMsg);
        }
        return logger.warn("IMAGE_SERVICE", errorMsg);
      }

      if (progressTracker) {
        await progressTracker.update("Đang khởi tạo", 20);
      }

      const finalPrompt = prompt;

      if (progressTracker) {
        await progressTracker.update("Đang tạo concept", 35);
      }

      // Gửi request tạo hình ảnh thông qua AICore với model lunaby-vision
      const messages = [
        {
          role: "user",
          content: finalPrompt
        }
      ];

      if (progressTracker) {
        await progressTracker.update("Đang tạo hình ảnh sơ bộ", 50);
      }

      const result = await AICore.processChatCompletion(messages, {
        modelType: 'image',
        max_tokens: 4096,
        aspect_ratio: options.aspect_ratio || '1:1',
        output_format: options.output_format || 'png'
      });

      if (progressTracker) {
        await progressTracker.update("Đang tinh chỉnh chi tiết", 75);
      }

      if (!result || !result.content) {
        const errorMsg = "Không nhận được phản hồi hợp lệ từ Lunaby Vision API";
        if (progressTracker) progressTracker.error(errorMsg);
        throw new Error(errorMsg);
      }

      if (progressTracker) {
        await progressTracker.update("Đang hoàn thiện hình ảnh", 85);
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

      if (progressTracker) {
        await progressTracker.update("Đang xử lý kết quả", 90);
      }

      // Convert base64 to buffer và lưu file
      let imageBuffer;
      try {
        imageBuffer = Buffer.from(base64Image, "base64");
        fs.writeFileSync(outputPath, imageBuffer);
        logger.info("IMAGE_SERVICE", `Saved image successfully, size: ${imageBuffer.length} bytes`);
      } catch (base64Error) {
        const errorMsg = `Không thể parse base64 image data: ${base64Error.message}`;
        if (progressTracker) progressTracker.error(errorMsg);
        throw new Error(errorMsg);
      }

      if (progressTracker) {
        await progressTracker.update("Đang lưu hình ảnh", 95);
      }

      logger.info("IMAGE_SERVICE", `Đã tạo hình ảnh thành công: ${outputPath}`);

      if (progressTracker) {
        await progressTracker.complete();
      }

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
      if (progressTracker) {
        await progressTracker.error(userMessage);
      }
      
      throw new Error(userMessage);
    }
  }

  trackImageGenerationProgress(messageOrInteraction, prompt) {
    const stages = [
      "Đang khởi tạo",
      "Đang phân tích prompt",
      "Đang tạo concept",
      "Đang tạo hình ảnh sơ bộ",
      "Đang tinh chỉnh chi tiết",
      "Đang hoàn thiện hình ảnh",
      "Đang xử lý kết quả",
      "Đang lưu hình ảnh",
    ];

    let currentStage = 0;
    let shouldContinue = true;
    let progressMessage = null;

    const isInteraction =
      messageOrInteraction.replied !== undefined ||
      messageOrInteraction.deferred !== undefined;

    const startTime = Date.now();
    const promptPreview =
      prompt.length > 50 ? prompt.substring(0, 50) + "..." : prompt;

    const updateProgress = async (step = 0) => {
      if (!shouldContinue || !messageOrInteraction) return;

      const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(1);

      const stagePercentMap = {
        0: 5, 1: 15, 2: 30, 3: 45, 4: 60, 5: 75, 6: 90, 7: 95,
      };

      const percentComplete =
        stagePercentMap[currentStage] ||
        Math.min(Math.floor((currentStage / (stages.length - 1)) * 100), 99);

      const loadingEmoji = textUtils.getLoadingAnimation(step);
      const progressBar = textUtils.getProgressBar(percentComplete);

      const content =
        `### ${loadingEmoji} Đang Tạo Hình Ảnh...\n` +
        `> "${promptPreview}"\n` +
        `**Tiến trình:** ${progressBar}\n` +
        `**Đang thực hiện:** ${stages[currentStage]}\n` +
        `**Thời gian:** ${elapsedTime}s`;

      try {
        if (isInteraction) {
          if (!progressMessage) {
            if (!messageOrInteraction.deferred && !messageOrInteraction.replied) {
              await messageOrInteraction.deferReply();
            }
            progressMessage = await messageOrInteraction.editReply(content);
          } else {
            await messageOrInteraction.editReply(content);
          }
        } else {
          if (!progressMessage) {
            progressMessage = await messageOrInteraction.reply(content);
          } else {
            await progressMessage.edit(content);
          }
        }
      } catch (err) {
        logger.error("IMAGE_SERVICE", `Lỗi cập nhật progress: ${err.message}`);
      }
    };

    let step = 0;
    const progressInterval = setInterval(() => {
      if (!shouldContinue) {
        clearInterval(progressInterval);
        return;
      }
      updateProgress(step++);
    }, 1500);

    return {
      complete: async () => {
        shouldContinue = false;
        clearInterval(progressInterval);

        try {
          const content = `### 🎨 Hình Ảnh Đã Tạo Thành Công!\n> "${promptPreview}"`;

          if (isInteraction) {
            await messageOrInteraction.editReply(content);
          } else if (progressMessage) {
            await progressMessage.edit(content);
          }
        } catch (err) {
          logger.error("IMAGE_SERVICE", `Lỗi cập nhật complete: ${err.message}`);
        }

        return true;
      },

      error: async (errorMessage) => {
        shouldContinue = false;
        clearInterval(progressInterval);

        try {
          const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(1);
          let errorContent = `### ❌ Không Thể Tạo Hình Ảnh\n> "${promptPreview}"\n\n`;

          if (errorMessage.includes("content moderation") || 
              errorMessage.includes("safety") || 
              errorMessage.includes("inappropriate")) {
            errorContent += `**Lỗi:** Nội dung không tuân thủ nguyên tắc kiểm duyệt\n`;
          } else if (errorMessage.includes("/generate_image")) {
            errorContent += `**Lỗi:** Không tìm thấy API endpoint phù hợp\n`;
          } else {
            errorContent += `**Lỗi:** ${errorMessage.replace("Không thể tạo hình ảnh: ", "")}\n`;
          }

          errorContent += `**Thời gian:** ${elapsedTime}s`;

          if (isInteraction) {
            if (messageOrInteraction.deferred || messageOrInteraction.replied) {
              await messageOrInteraction.editReply(errorContent);
            } else {
              await messageOrInteraction.reply(errorContent);
            }
          } else if (progressMessage) {
            await progressMessage.edit(errorContent);
          } else if (messageOrInteraction) {
            await messageOrInteraction.reply(errorContent);
          }
        } catch (err) {
          logger.error("IMAGE_SERVICE", `Lỗi cập nhật error: ${err.message}`);
        }

        return false;
      },

      update: async (stage, percent) => {
        if (!shouldContinue) return;

        if (stage && stages.includes(stage)) {
          currentStage = stages.indexOf(stage);
        }

        const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(1);
        const actualPercent = percent !== undefined ? percent : 
          Math.min(Math.floor((currentStage / (stages.length - 1)) * 100), 99);
        
        const loadingEmoji = textUtils.getLoadingAnimation(step);

        const content =
          `### ${loadingEmoji} Đang Tạo Hình Ảnh...\n` +
          `> "${promptPreview}"\n` +
          `**Tiến trình:** ${textUtils.getProgressBar(actualPercent)}\n` +
          `**Đang thực hiện:** ${stages[currentStage]}\n` +
          `**Thời gian:** ${elapsedTime}s`;

        try {
          if (isInteraction) {
            if (messageOrInteraction.deferred || messageOrInteraction.replied) {
              await messageOrInteraction.editReply(content);
            }
          } else if (progressMessage) {
            await progressMessage.edit(content);
          }
        } catch (err) {
          logger.error("IMAGE_SERVICE", `Lỗi cập nhật update: ${err.message}`);
        }
      },
    };
  }
}

module.exports = new ImageService(); 