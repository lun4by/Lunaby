const logger = require("../../utils/core/logger.js");
const prompts = require("../../config/prompts.js");
const { Lunaby } = require("lunaby-sdk");

const MODEL_MAP = { default: "lunaby", pro: "lunaby-pro", image: "lunaby-vision" };
const DISCORD_CLIENT_TYPE = "discord";
const LEGACY_MAIN_SYSTEM_PROMPT = "Your name is Lunaby, created by s4ory";
const MODEL_RUNTIME_NOTE_REGEX = /^You are running on .+ model\.$/;
const EMPTY_USAGE = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
const DEFAULT_MAX_TOKENS = 2048;
const DEFAULT_LANGUAGE = "Vietnamese";

function renderTemplate(template, variables = {}) {
  if (typeof template !== "string") return "";

  return template.replace(/\$\{(\w+)\}/g, (_, key) => (
    variables[key] === undefined ? "" : String(variables[key])
  ));
}

function buildRequestConfig(config, model) {
  const {
    clientType: _clientType,
    modelType: _modelType,
    stream: _stream,
    max_tokens: maxTokens,
    ...providerConfig
  } = config;

  return {
    model,
    max_tokens: maxTokens || DEFAULT_MAX_TOKENS,
    ...providerConfig,
  };
}

class AICore {
  constructor() {
    this.systemPrompt = renderTemplate(prompts.system.main, { language: DEFAULT_LANGUAGE });
    const apiKey = process.env.LUNABY_API_KEY;

    if (!apiKey) {
      logger.error("lunaby_api", "LUNABY_API_KEY is not configured");
    } else {
      this.lunabyApi = new Lunaby({ apiKey });
      logger.debug("lunaby_api", "LunabyAPI initialized");
    }
  }

  ensureApi() {
    if (!this.lunabyApi) {
      throw new Error("LunabyAPI chưa được khởi tạo");
    }

    return this.lunabyApi;
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
      return this.systemPrompt;
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
    const api = this.ensureApi();

    const model = MODEL_MAP[config.modelType] || MODEL_MAP.default;
    const { clientType } = config;

    if (config.modelType === "image") {
      try {
        const prompt = messages.find((message) => message.role === "user")?.content || "";
        const response = await api.images.generate(prompt, buildRequestConfig({
          ...config,
          aspect_ratio: config.aspect_ratio || "1:1",
          output_format: config.output_format || "png",
        }, model));
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
        const response = await api.chat.create(
          requestMessages,
          buildRequestConfig(config, model)
        );
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
      const stream = await api.chat.createStream(
        requestMessages,
        buildRequestConfig(config, model)
      );
      const content = await stream.toContent();

      if (!content) {
        throw new Error("No content received");
      }

      return { content, usage: this.extractUsage(stream) };
    } catch (error) {
      throw this.normalizeApiError(error);
    }
  }

  async processChatStream(messages, config = {}, onContent = async () => {}) {
    const api = this.ensureApi();

    const model = MODEL_MAP[config.modelType] || config.model || MODEL_MAP.default;
    const requestMessages = this.prepareMessagesForClient(messages, config.clientType);

    try {
      const stream = await api.chat.createStream(
        requestMessages,
        buildRequestConfig(config, model)
      );
      const content = await stream.process({ onContent });

      if (!content || !content.trim()) {
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

  async generateImage(prompt, options = {}) {
    const api = this.ensureApi();

    try {
      const result = await api.images.generateBuffer(prompt, {
        aspect_ratio: options.aspect_ratio || "1:1",
        output_format: options.output_format || "png",
      });

      if (!result?.buffer) {
        throw new Error("Không nhận được hình ảnh từ LunabyAPI");
      }

      return {
        buffer: result.buffer,
        revisedPrompt: result.revisedPrompt || result.revised_prompt || prompt,
        usage: result.usage || EMPTY_USAGE,
      };
    } catch (error) {
      throw this.normalizeApiError(error);
    }
  }

  get CoreModel() {
    return MODEL_MAP.default;
  }
}

module.exports = new AICore();

