const logger = require("../../utils/logger.js");
const prompts = require("../../config/prompts.js");
const { Lunaby } = require("lunaby-sdk");

const MODEL_MAP = { default: "lunaby", pro: "lunaby-pro", image: "lunaby-vision" };
const DISCORD_CLIENT_TYPE = "discord";
const LEGACY_MAIN_SYSTEM_PROMPT = "Your name is Lunaby, created by s4ory";
const MODEL_RUNTIME_NOTE_REGEX = /^You are running on .+ model\.$/;
const EMPTY_USAGE = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

class AICore {
  constructor() {
    this.systemPrompt = prompts.system.main;
    const apiKey = process.env.LUNABY_API_KEY;

    if (!apiKey) {
      logger.error("ai_core", "lunaby_api_key not configured!");
    } else {
      this.client = new Lunaby({ apiKey });
      logger.debug("ai_core", "Lunaby client initialized");
    }
  }

  stripLegacyBaseSystemPrompt(content) {
    if (typeof content !== "string" || !content.startsWith(LEGACY_MAIN_SYSTEM_PROMPT)) {
      return content;
    }

    const strippedContent = content.slice(LEGACY_MAIN_SYSTEM_PROMPT.length).trim();
    if (!strippedContent || MODEL_RUNTIME_NOTE_REGEX.test(strippedContent)) {
      return "";
    }

    return strippedContent;
  }

  getClientSystemPrompt(clientType = null) {
    if (clientType === DISCORD_CLIENT_TYPE) {
      return prompts.system.main;
    }

    return null;
  }

  prepareMessagesForClient(messages, clientType = null) {
    const clientSystemPrompt = this.getClientSystemPrompt(clientType);

    if (!clientSystemPrompt) {
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

        const content = this.stripLegacyBaseSystemPrompt(message.content);
        if (!content) {
          return result;
        }

        result.push({ ...message, content });
        return result;
      }, [])
      : [];

    const alreadyInjected = normalizedMessages.some(
      (message) => message?.role === "system" && message?.content === clientSystemPrompt
    );

    if (alreadyInjected) {
      return normalizedMessages;
    }

    const insertIndex = normalizedMessages.findIndex((message) => message?.role !== "system");
    const promptMessage = { role: "system", content: clientSystemPrompt };

    if (insertIndex === -1) {
      normalizedMessages.push(promptMessage);
      return normalizedMessages;
    }

    normalizedMessages.splice(insertIndex, 0, promptMessage);
    return normalizedMessages;
  }

  extractResponsePayload(response) {
    if (response?.data && typeof response.data === "object") {
      return response.data;
    }

    if (response && typeof response === "object") {
      return response;
    }

    return {};
  }

  extractTextContent(content) {
    if (typeof content === "string") {
      return content;
    }

    if (!Array.isArray(content)) {
      return "";
    }

    return content.map((part) => {
      if (typeof part === "string") {
        return part;
      }

      if (part && typeof part.text === "string") {
        return part.text;
      }

      if (part && typeof part.content === "string") {
        return part.content;
      }

      return "";
    }).join("");
  }

  extractChatContent(response) {
    const payload = this.extractResponsePayload(response);
    const firstChoice = Array.isArray(payload.choices) ? payload.choices[0] : null;
    const content = firstChoice?.message?.content
      ?? firstChoice?.content
      ?? payload?.message?.content
      ?? payload?.content
      ?? "";

    return this.extractTextContent(content);
  }

  extractUsage(response) {
    const payload = this.extractResponsePayload(response);
    return payload?.usage || response?.usage || EMPTY_USAGE;
  }

  normalizeApiError(error) {
    const normalizedError = error instanceof Error
      ? error
      : new Error(typeof error === "string" ? error : "API request failed");

    const payload = error?.response?.data
      || error?.data
      || error?.body
      || error?.details?.response
      || null;

    const status = Number(
      error?.status
      || error?.statusCode
      || error?.response?.status
      || error?.response?.statusCode
      || payload?.status
      || payload?.statusCode
      || 0
    ) || null;

    const apiMessage = typeof payload?.message === "string" && payload.message.trim()
      ? payload.message.trim()
      : null;
    const apiError = typeof payload?.error === "string" && payload.error.trim()
      ? payload.error.trim()
      : null;
    const requestId = payload?.request_id || payload?.requestId || null;

    if (status && !normalizedError.status) {
      normalizedError.status = status;
    }
    if (status && !normalizedError.statusCode) {
      normalizedError.statusCode = status;
    }
    if (apiMessage && !normalizedError.apiMessage) {
      normalizedError.apiMessage = apiMessage;
    }
    if (apiError && !normalizedError.apiError) {
      normalizedError.apiError = apiError;
    }
    if (requestId && !normalizedError.requestId) {
      normalizedError.requestId = requestId;
    }
    if (requestId && !normalizedError.request_id) {
      normalizedError.request_id = requestId;
    }
    if (payload && !normalizedError.data) {
      normalizedError.data = payload;
    }

    if (payload) {
      normalizedError.response = normalizedError.response || {};
      normalizedError.response.data = normalizedError.response.data || payload;

      if (status && !normalizedError.response.status) {
        normalizedError.response.status = status;
      }
    }

    if ((!normalizedError.message || normalizedError.message === "Request failed") && (apiMessage || apiError)) {
      normalizedError.message = apiMessage || apiError;
    }

    return normalizedError;
  }

  async processChatCompletion(messages, config = {}) {
    if (!this.client) {
      throw new Error("Lunaby client chưa được khởi tạo");
    }

    const model = MODEL_MAP[config.modelType] || MODEL_MAP.default;
    const { clientType, ...requestConfig } = config;

    if (config.modelType === "image") {
      try {
        const prompt = messages.find((message) => message.role === "user")?.content || "";
        const response = await this.client.images.generate(prompt, {
          model,
          aspect_ratio: config.aspect_ratio || "1:1",
          output_format: config.output_format || "png",
        });
        const payload = this.extractResponsePayload(response);
        const imageData = Array.isArray(payload.data) ? payload.data[0] : null;

        if (!imageData?.b64_json) {
          throw new Error("No image received");
        }

        return {
          content: imageData.b64_json,
          revised_prompt: imageData.revised_prompt || imageData.revisedPrompt,
          usage: this.extractUsage(response),
        };
      } catch (error) {
        throw this.normalizeApiError(error);
      }
    }

    const requestMessages = this.prepareMessagesForClient(messages, clientType);

    if (config.stream === false) {
      try {
        const response = await this.client.chat.create(requestMessages, {
          model,
          max_tokens: requestConfig.max_tokens || 2048,
          ...requestConfig,
        });
        const content = this.extractChatContent(response);

        if (!content) {
          throw new Error("No content received");
        }

        return { content, usage: this.extractUsage(response) };
      } catch (error) {
        throw this.normalizeApiError(error);
      }
    }

    try {
      const stream = await this.client.chat.createStream(requestMessages, {
        model,
        max_tokens: requestConfig.max_tokens || 2048,
        ...requestConfig,
      });
      const content = await stream.toContent();

      if (!content) {
        throw new Error("No content received");
      }

      return { content, usage: this.extractUsage(stream) };
    } catch (error) {
      throw this.normalizeApiError(error);
    }
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

  async getOneTimeCompletion(prompt, config = {}) {
    const messages = [
      { role: "system", content: this.systemPrompt },
      { role: "user", content: prompt },
    ];
    const result = await this.processChatCompletion(messages, {
      modelType: config.modelType || "pro",
      max_tokens: config.max_tokens || 256,
      stream: false,
      ...config,
    });

    return result.content;
  }

  getClient() {
    return this.client;
  }
}

module.exports = new AICore();
