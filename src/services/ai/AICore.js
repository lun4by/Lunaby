const logger = require("../../utils/logger.js");
const prompts = require("../../config/prompts.js");
const { Lunaby } = require("lunaby-sdk");

const MODEL_MAP = { default: "lunaby", pro: "lunaby-pro", image: "lunaby-vision" };
const DISCORD_CLIENT_TYPE = "discord";
const MODEL_RUNTIME_NOTE_REGEX = /^You are running on .+ model\.$/;
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

  stripBaseSystemPrompt(content) {
    if (typeof content !== "string" || !content.startsWith(prompts.system.main)) {
      return content;
    }

    const strippedContent = content.slice(prompts.system.main.length).trim();
    if (!strippedContent || MODEL_RUNTIME_NOTE_REGEX.test(strippedContent)) {
      return "";
    }

    return strippedContent;
  }

  prepareMessagesForClient(messages, clientType = null) {
    if (clientType !== DISCORD_CLIENT_TYPE) {
      return messages;
    }

    const normalizedMessages = Array.isArray(messages)
      ? messages.reduce((result, message) => {
        if (!message || typeof message !== "object") {
          return result;
        }

        if (message.role !== "system") {
          result.push({ ...message });
          return result;
        }

        const content = this.stripBaseSystemPrompt(message.content);
        if (!content) {
          return result;
        }

        result.push({ ...message, content });
        return result;
      }, [])
      : [];
    const discordSystemPrompt = prompts.system.discordFormat;

    const alreadyInjected = normalizedMessages.some(
      (message) => message?.role === "system" && message?.content === discordSystemPrompt
    );

    if (alreadyInjected) {
      return normalizedMessages;
    }

    const insertIndex = normalizedMessages.findIndex((message) => message?.role !== "system");
    const promptMessage = { role: "system", content: discordSystemPrompt };

    if (insertIndex === -1) {
      normalizedMessages.push(promptMessage);
      return normalizedMessages;
    }

    normalizedMessages.splice(insertIndex, 0, promptMessage);
    return normalizedMessages;
  }

  async processChatCompletion(messages, config = {}) {
    if (!this.client) throw new Error("Lunaby client chưa được khởi tạo");

    const model = MODEL_MAP[config.modelType] || MODEL_MAP.default;
    const { clientType, ...requestConfig } = config;

    if (config.modelType === 'image') {
      const prompt = messages.find(m => m.role === 'user')?.content || '';
      const response = await this.client.images.generate(prompt, {
        model,
        aspect_ratio: config.aspect_ratio || '1:1',
        output_format: config.output_format || 'png',
      });

      const imageData = response.data.data[0];
      return {
        content: imageData.b64_json,
        revised_prompt: imageData.revised_prompt || imageData.revisedPrompt,
        usage: response.data.usage || EMPTY_USAGE
      };
    }

    const requestMessages = this.prepareMessagesForClient(messages, clientType);

    if (config.stream === false) {
      const response = await this.client.chat.create(requestMessages, {
        model,
        max_tokens: requestConfig.max_tokens || 2048,
        ...requestConfig,
      });
      const content = response.data.choices[0]?.message?.content;
      if (!content) throw new Error("No content received");

      return { content, usage: response.data.usage || EMPTY_USAGE };
    }

    const stream = await this.client.chat.createStream(requestMessages, {
      model,
      max_tokens: requestConfig.max_tokens || 2048,
      ...requestConfig,
    });
    const content = await stream.toContent();
    if (!content) throw new Error("No content received");

    return { content, usage: stream.usage || EMPTY_USAGE };
  }

  async getCodeCompletion(prompt, config = {}) {
    const enhancedPrompt = `${prompts.code.prefix} ${prompt} ${prompts.code.suffix}`;
    const messages = [
      { role: "system", content: this.systemPrompt + prompts.code.systemAddition },
      { role: "user", content: enhancedPrompt },
    ];
    return this.processChatCompletion(messages, {
      max_tokens: 4000,
      ...config,
    });
  }
  /**
   * Gọi AI một lần duy nhất, KHÔNG lưu history, KHÔNG enrich memory.
   * Dùng cho mod commands, system tasks, v.v.
   */
  async getOneTimeCompletion(prompt, config = {}) {
    const messages = [
      { role: "system", content: this.systemPrompt },
      { role: "user", content: prompt }
    ];
    const result = await this.processChatCompletion(messages, {
      modelType: config.modelType || 'pro',
      max_tokens: config.max_tokens || 256,
      stream: false,
      ...config,
    });
    return result.content;
  }

  getClient() { return this.client; }
}

module.exports = new AICore();
