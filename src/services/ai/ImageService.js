const storageDB = require("../database/storagedb.js");
const AICore = require("./AICore.js");

class ImageService {
  async generateImage(prompt, options = {}) {
    const blacklistCheck = await storageDB.checkImageBlacklist(prompt);
    if (blacklistCheck.isBlocked) {
      const error = new Error("Prompt chứa nội dung không phù hợp");
      error.code = "IMAGE_PROMPT_BLOCKED";
      throw error;
    }

    let result;
    try {
      result = await AICore.generateImage(prompt, options);
    } catch (error) {
      throw AICore.normalizeApiError(error);
    }

    if (!result?.buffer) {
      throw new Error("Không nhận được hình ảnh từ API");
    }

    return {
      buffer: result.buffer,
      revisedPrompt: result.revisedPrompt || prompt,
      usage: result.usage,
    };
  }
}

module.exports = new ImageService();
