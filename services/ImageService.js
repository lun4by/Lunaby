const fs = require("fs");
const logger = require("../utils/logger.js");
const storageDB = require("./storagedb.js");
const AICore = require("./AICore.js");

class ImageService {
  constructor() {}

  async generateImage(prompt, options = {}) {
    const blacklistCheck = await storageDB.checkImageBlacklist(prompt);
    if (blacklistCheck.isBlocked) {
      throw new Error("Prompt chứa nội dung không phù hợp");
    }

    const client = AICore.getClient();
    if (!client) throw new Error("SDK client not initialized");

    const result = await client.images.generateBuffer(prompt, {
      aspect_ratio: options.aspect_ratio || '1:1',
      output_format: options.output_format || 'png'
    });

    if (!result.buffer) {
      throw new Error("Không nhận được hình ảnh từ API");
    }

    const outputPath = `./temp/generated_image_${Date.now()}.png`;
    if (!fs.existsSync("./temp")) {
      fs.mkdirSync("./temp", { recursive: true });
    }
    fs.writeFileSync(outputPath, result.buffer);

    return {
      buffer: result.buffer,
      localPath: outputPath,
      revisedPrompt: result.revisedPrompt || prompt,
      usage: result.usage
    };
  }
}

module.exports = new ImageService();
