const logger = require("../utils/logger.js");
const prompts = require("../config/prompts.js");
const initSystem = require("./initSystem.js");
const { Lunaby } = require("lunaby-sdk");

class AICore {
  constructor() {
    this.systemPrompt = prompts.system.main;
    this.Model = process.env.LUNABY_MODEL || "lunaby-pro";
    this.lunabyBaseURL = process.env.LUNABY_BASE_URL || "https://api.lunie.dev/v1";
    this.lunabyApiKey = process.env.LUNABY_API_KEY;

    if (!this.lunabyApiKey) {
      logger.error("AI_CORE", "LUNABY_API_KEY not configured!");
    } else {
      this.client = new Lunaby({
        apiKey: this.lunabyApiKey,
        baseURL: this.lunabyBaseURL,
        defaultModel: this.Model,
        timeout: 120000,
      });
      logger.debug("AI_CORE", `Initialized with model: ${this.Model}`);
    }
  }

  async waitForProviders() {
    await initSystem.waitForReady();
    logger.info("AI_CORE", `Ready with model: ${this.Model}`);
    return this;
  }

  async processChatCompletion(messages, config = {}) {
    const modelMap = {
      default: "lunaby",
      image: "lunaby-vision"
    };
    const model = modelMap[config.modelType] || modelMap.default;

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
        usage: result.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
      };
    }

    const stream = await this.client.chat.createStream(messages, {
      model,
      max_tokens: config.max_tokens || 2048,
      ...config,
    });
    const content = await stream.toContent();

    if (!content) throw new Error("No content received");

    return { content, usage: stream.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 } };
  }

  async getCodeCompletion(prompt) {
    const enhancedPrompt = `${prompts.code.prefix} ${prompt} ${prompts.code.suffix}`;
    const messages = [
      { role: "system", content: this.systemPrompt + prompts.code.systemAddition },
      { role: "user", content: enhancedPrompt },
    ];
    return this.processChatCompletion(messages, { max_tokens: 4000 });
  }

  getModelName() { return this.Model; }
  getClient() { return this.client; }
}

module.exports = new AICore();
