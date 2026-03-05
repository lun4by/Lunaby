const logger = require("../utils/logger.js");
const prompts = require("../config/prompts.js");
const initSystem = require("./initSystem.js");
const { Lunaby } = require("lunaby-sdk");

const MODEL_MAP = { default: "lunaby", pro: "lunaby-pro", image: "lunaby-vision" };
const EMPTY_USAGE = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

class AICore {
  constructor() {
    this.systemPrompt = prompts.system.main;
    const apiKey = process.env.LUNABY_API_KEY;

    if (!apiKey) {
      logger.error("AI_CORE", "LUNABY_API_KEY not configured!");
    } else {
      this.client = new Lunaby({ apiKey });
      logger.debug("AI_CORE", "Lunaby client initialized");
    }
  }

  async waitForProviders() {
    await initSystem.waitForReady();
    logger.info("AI_CORE", "Ready");
    return this;
  }

  async processChatCompletion(messages, config = {}) {
    if (!this.client) throw new Error("Lunaby client chưa được khởi tạo");

    const model = MODEL_MAP[config.modelType] || MODEL_MAP.default;

    if (config.modelType === 'image') {
      const prompt = messages.find(m => m.role === 'user')?.content || '';
      const result = await this.client.images.generateBuffer(prompt, {
        model,
        aspect_ratio: config.aspect_ratio || '1:1',
        output_format: config.output_format || 'png',
      });
      return {
        content: result.buffer.toString('base64'),
        revised_prompt: result.revisedPrompt,
        usage: result.usage || EMPTY_USAGE
      };
    }

    const stream = await this.client.chat.createStream(messages, {
      model,
      max_tokens: config.max_tokens || 2048,
      ...config,
    });
    const content = await stream.toContent();
    if (!content) throw new Error("No content received");

    return { content, usage: stream.usage || EMPTY_USAGE };
  }

  async getCodeCompletion(prompt) {
    const enhancedPrompt = `${prompts.code.prefix} ${prompt} ${prompts.code.suffix}`;
    const messages = [
      { role: "system", content: this.systemPrompt + prompts.code.systemAddition },
      { role: "user", content: enhancedPrompt },
    ];
    return this.processChatCompletion(messages, { max_tokens: 4000 });
  }

  getClient() { return this.client; }
}

module.exports = new AICore();