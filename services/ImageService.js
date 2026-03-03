const fs = require("fs");
const path = require("path");
const storageDB = require("./storagedb.js");
const AICore = require("./AICore.js");

const TEMP_DIR = path.join(process.cwd(), "temp");

class ImageService {
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

    fs.mkdirSync(TEMP_DIR, { recursive: true });
    const outputPath = path.join(TEMP_DIR, `generated_image_${Date.now()}.png`);
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
