const storageDB = require("./storagedb.js");
const AICore = require("./AICore.js");
const prompts = require("../config/prompts.js");
const logger = require("../utils/logger.js");

class ImageService {
  async generateImage(prompt, options = {}) {
    const blacklistCheck = await storageDB.checkImageBlacklist(prompt);
    if (blacklistCheck.isBlocked) {
      throw new Error("Prompt chứa nội dung không phù hợp");
    }

    const client = AICore.getClient();
    if (!client) throw new Error("SDK client not initialized");

    let enhancedPrompt = prompt;
    try {
      const messages = [
        { role: 'system', content: prompts.image.system },
        { role: 'user', content: prompt }
      ];
      
      const aiResponse = await AICore.processChatCompletion(messages, { 
        modelType: 'default',
        max_tokens: 500,
        temperature: 0.7,
        stream: false
      });
      
      if (aiResponse && aiResponse.content) {
        enhancedPrompt = aiResponse.content.trim();
      }
    } catch (enhanceError) {
      logger.warn('IMAGE', `Image prompt enhancement failed: ${enhanceError.message}`);
    }

    const result = await client.images.generateBuffer(enhancedPrompt, {
      aspect_ratio: options.aspect_ratio || '1:1',
      output_format: options.output_format || 'png'
    });

    if (!result.buffer) {
      throw new Error("Không nhận được hình ảnh từ API");
    }

    return {
      buffer: result.buffer,
      revisedPrompt: result.revisedPrompt || prompt,
      usage: result.usage
    };
  }
}

module.exports = new ImageService();