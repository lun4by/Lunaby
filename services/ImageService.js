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
   * @param {Object} options - Tùy chọn tạo hình ảnh (aspect_ratio, output_format, etc.)
   * @returns {Promise<Object>} - Kết quả tạo hình ảnh
   */
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

      // Xử lý response - parse JSON nếu cần
      let imageData = result.content.trim();
      let imageUrl = null;
      let base64Image = null;

      logger.info("IMAGE_SERVICE", `Response content type: ${typeof imageData}, length: ${imageData.length}`);

      // Thử parse JSON response từ API
      try {
        const parsedResponse = JSON.parse(imageData);
        logger.info("IMAGE_SERVICE", `Parsed JSON response from API: ${JSON.stringify(Object.keys(parsedResponse))}`);
        
        // Kiểm tra format Stability AI / OpenAI style response
        if (parsedResponse.data && Array.isArray(parsedResponse.data)) {
          logger.info("IMAGE_SERVICE", `Found data array with ${parsedResponse.data.length} items`);
          
          if (parsedResponse.data.length > 0 && parsedResponse.data[0]) {
            const firstItem = parsedResponse.data[0];
            logger.info("IMAGE_SERVICE", `First item keys: ${JSON.stringify(Object.keys(firstItem))}`);
            
            if (firstItem.b64_json) {
              base64Image = firstItem.b64_json;
              logger.info("IMAGE_SERVICE", `Found b64_json in response, length: ${base64Image.length}`);
            } else if (firstItem.url) {
              imageUrl = firstItem.url;
              logger.info("IMAGE_SERVICE", "Found URL in response");
            } else {
              logger.warn("IMAGE_SERVICE", `No b64_json or url found in data[0]: ${JSON.stringify(firstItem).substring(0, 200)}`);
            }
          } else {
            logger.warn("IMAGE_SERVICE", "data array is empty");
          }
        } else {
          logger.warn("IMAGE_SERVICE", `Response structure unexpected: ${JSON.stringify(parsedResponse).substring(0, 200)}`);
        }
      } catch (parseError) {
        // Không phải JSON, có thể là URL hoặc base64 trực tiếp
        logger.info("IMAGE_SERVICE", `Response is not JSON (${parseError.message}), treating as direct content`);
        if (imageData.startsWith("http")) {
          imageUrl = imageData;
        } else if (imageData.startsWith("data:image")) {
          imageUrl = imageData;
        } else {
          base64Image = imageData;
        }
      }

      const uniqueFilename = `generated_image_${Date.now()}.png`;
      const outputPath = `./temp/${uniqueFilename}`;
      
      if (!fs.existsSync("./temp")) {
        fs.mkdirSync("./temp", { recursive: true });
      }

      let imageBuffer = null;

      if (progressTracker) {
        await progressTracker.update("Đang xử lý kết quả", 90);
      }

      // Xử lý các định dạng response
      if (base64Image) {
        // Base64 trực tiếp
        try {
          imageBuffer = Buffer.from(base64Image, "base64");
          fs.writeFileSync(outputPath, imageBuffer);
          logger.info("IMAGE_SERVICE", `Saved base64 image, size: ${imageBuffer.length} bytes`);
        } catch (base64Error) {
          const errorMsg = `Không thể parse base64 image data: ${base64Error.message}`;
          if (progressTracker) progressTracker.error(errorMsg);
          throw new Error(errorMsg);
        }
      } else if (imageUrl && imageUrl.startsWith("http")) {
        // URL trực tiếp
        const imageResponse = await axios.get(imageUrl, {
          responseType: "arraybuffer",
          timeout: 60000,
        });
        imageBuffer = Buffer.from(imageResponse.data);
        fs.writeFileSync(outputPath, imageBuffer);
        logger.info("IMAGE_SERVICE", `Downloaded image from URL, size: ${imageBuffer.length} bytes`);
      } else if (imageUrl && imageUrl.startsWith("data:image")) {
        // Base64 data URL
        const base64Data = imageUrl.replace(/^data:image\/\w+;base64,/, "");
        imageBuffer = Buffer.from(base64Data, "base64");
        fs.writeFileSync(outputPath, imageBuffer);
        logger.info("IMAGE_SERVICE", `Saved data URL image, size: ${imageBuffer.length} bytes`);
      } else {
        const errorMsg = `Không tìm thấy dữ liệu hình ảnh hợp lệ trong response`;
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
        url: base64Image ? "base64_image_data" : (imageUrl || "local_file"),
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