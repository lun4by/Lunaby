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

  /**
   * Tạo hình ảnh từ prompt sử dụng Lunaby Vision API
   * @param {string} prompt - Prompt tạo hình ảnh
   * @param {Object} message - Message object (optional)
   * @param {Object} progressTracker - Progress tracker (optional)
   * @returns {Promise<Object>} - Kết quả tạo hình ảnh
   */
  async generateImage(prompt, message = null, progressTracker = null) {
    progressTracker =
      progressTracker ||
      (message ? this.trackImageGenerationProgress(message, prompt) : null);

    try {
      logger.info("IMAGE_SERVICE", `Đang tạo hình ảnh với prompt: "${prompt}"`);

      const blacklistCheck = await storageDB.checkImageBlacklist(prompt);
      const aiAnalysis = await AICore.analyzeContentWithAI(prompt);
      const isBlocked = blacklistCheck.isBlocked || aiAnalysis.isInappropriate;

      if (isBlocked) {
        const errorReason = [];

        if (aiAnalysis.isInappropriate) {
          errorReason.push(
            `Phân tích AI:`,
            `- Danh mục: ${aiAnalysis.categories.join(", ")}`,
            `- Mức độ: ${aiAnalysis.severity}`
          );
        }

        const errorMsg = `Prompt chứa nội dung không phù hợp\n${errorReason.join("\n")}`;

        if (progressTracker) {
          await progressTracker.error(errorMsg);
        }
        return logger.warn("IMAGE_SERVICE", errorMsg);
      }

      if (progressTracker) {
        await progressTracker.update("Đang phân tích prompt", 15);
      }

      let finalPrompt = prompt;
      if (prompt.match(/[\u00C0-\u1EF9]/)) {
        try {
          finalPrompt = await this.translatePromptToEnglish(prompt);
          logger.info("IMAGE_SERVICE", `Prompt dịch sang tiếng Anh: "${finalPrompt}"`);
        } catch (translateError) {
          logger.warn("IMAGE_SERVICE", `Không thể dịch prompt: ${translateError.message}`);
          finalPrompt = prompt;
        }
      }

      if (progressTracker) {
        await progressTracker.update("Đang khởi tạo", 20);
      }

      if (progressTracker) {
        await progressTracker.update("Đang tạo concept", 35);
      }

      // Gửi request tạo hình ảnh thông qua AICore với model lunaby-vision
      const messages = [
        {
          role: "system",
          content: "You are an AI image generator. Generate high-quality, detailed images based on user prompts."
        },
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
        max_tokens: 4096
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

      // Xử lý response - có thể là URL hoặc base64
      const imageUrl = result.content.trim();
      const uniqueFilename = `generated_image_${Date.now()}.png`;
      const outputPath = `./temp/${uniqueFilename}`;
      
      if (!fs.existsSync("./temp")) {
        fs.mkdirSync("./temp", { recursive: true });
      }

      let imageBuffer = null;

      if (progressTracker) {
        await progressTracker.update("Đang xử lý kết quả", 90);
      }

      // Xử lý các định dạng response khác nhau
      if (typeof imageUrl === "string" && imageUrl.startsWith("http")) {
        // URL trực tiếp
        const imageResponse = await axios.get(imageUrl, {
          responseType: "arraybuffer",
          timeout: 60000,
        });
        imageBuffer = Buffer.from(imageResponse.data);
        fs.writeFileSync(outputPath, imageBuffer);
      } else if (typeof imageUrl === "string" && imageUrl.startsWith("data:image")) {
        // Base64 data URL
        const base64Data = imageUrl.replace(/^data:image\/\w+;base64,/, "");
        imageBuffer = Buffer.from(base64Data, "base64");
        fs.writeFileSync(outputPath, imageBuffer);
      } else if (typeof imageUrl === "string" && imageUrl.length > 100) {
        try {
          imageBuffer = Buffer.from(imageUrl, "base64");
          fs.writeFileSync(outputPath, imageBuffer);
        } catch (base64Error) {
          const errorMsg = `Không thể parse base64 image data: ${base64Error.message}`;
          if (progressTracker) progressTracker.error(errorMsg);
          throw new Error(errorMsg);
        }
      } else {
        const errorMsg = `Định dạng URL hình ảnh không được hỗ trợ: ${imageUrl}`;
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
        url: imageUrl.startsWith("data:image") ? "base64_image_data" : imageUrl,
        localPath: outputPath,
        source: `Lunaby-Vision`,
        usage: result.usage
      };
    } catch (error) {
      if (!this.generateImage.isBlocked) {
        logger.error("IMAGE_SERVICE", `Lỗi khi tạo hình ảnh: ${error.message}`);
        if (progressTracker) progressTracker.error(error.message);
        throw new Error(`Không thể tạo hình ảnh: ${error.message}`);
      } else {
        throw new Error(`Prompt chứa nội dung không phù hợp`);
      }
    }
  }

  async translatePromptToEnglish(prompt) {
    try {
      const messages = [
        {
          role: "system",
          content: "You are a translator. Translate the following Vietnamese image prompt to English. Only return the translated text, nothing else."
        },
        {
          role: "user",
          content: prompt
        }
      ];

      const result = await AICore.processChatCompletion(messages, {
        max_tokens: 500
      });

      return result.content.trim();
    } catch (error) {
      logger.error("IMAGE_SERVICE", `Translation error: ${error.message}`);
      throw error;
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