const axios = require("axios");
const logger = require("../utils/logger.js");
const prompts = require("../config/prompts.js");
const initSystem = require("./initSystem.js");

class AICore {
  constructor() {
    this.systemPrompt = prompts.system.main;
    this.Model = "lunaby";
    this.lunabyBaseURL = process.env.LUNABY_BASE_URL || "https://api.lunie.dev/v1";
    this.lunabyApiKey = process.env.LUNABY_API_KEY;
    
    if (!this.lunabyApiKey) {
      logger.error("AI_CORE", "LUNABY_API_KEY not configured!");
    }
    logger.info("AI_CORE", "Initialized with Lunaby API");
  }

  async waitForProviders() {
    await initSystem.waitForReady();
    return this;
  }

  handleStreamData(chunk, state) {
    const chunkStr = chunk.toString();
    
    state.buffer += chunkStr;
    const lines = state.buffer.split('\n');
    state.buffer = lines.pop() || '';
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        state.currentEvent = '';
        continue;
      }

      if (trimmed.startsWith('event:')) {
        state.currentEvent = trimmed.slice(6).trim();
        continue;
      }

      if (trimmed.startsWith('data:')) {
        state.dataEventCount++;
        const data = trimmed.slice(5).trim();

        if (data === '[DONE]') {
          logger.info("AI_CORE", "Received [DONE] signal");
          continue;
        }
        
        try {
          const parsed = JSON.parse(data);

          if (parsed.choices && parsed.choices[0]) {
            const delta = parsed.choices[0].delta;
            if (delta && delta.content) {
              state.fullContent += delta.content;
            }
          }

          if (parsed.usage) {
            state.tokenUsage = parsed.usage;
          }
        } catch (e) {
          logger.debug("AI_CORE", `Parse error (might be incomplete JSON): ${e.message}`);
        }
      }
    }
  }

  processStreamResponse(responseStream) {
    const state = {
      buffer: '',
      chunkCount: 0,
      dataEventCount: 0,
      currentEvent: '',
      fullContent: '',
      tokenUsage: {
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0
      }
    };

    return new Promise((resolve, reject) => {
      responseStream.on('data', (chunk) => {
        state.chunkCount++;
        this.handleStreamData(chunk, state);
      });

      responseStream.on('end', () => {
        logger.info("AI_CORE", `Stream ended. Chunks: ${state.chunkCount}, Data events: ${state.dataEventCount}, Content length: ${state.fullContent.length}`);
        
        if (state.fullContent.length === 0) {
          logger.error("AI_CORE", "Stream ended but no content received");
          reject(new Error("No content received from stream"));
        } else {
          logger.info("AI_CORE", `Stream completed successfully. Content length: ${state.fullContent.length} chars`);
          resolve({
            content: state.fullContent,
            usage: state.tokenUsage
          });
        }
      });

      responseStream.on('error', (err) => {
        logger.error("AI_CORE", "Stream error:", err.message);
        reject(err);
      });
    });
  }

  async handleImageGeneration(model, messages, config) {
    const response = await axios.post(
      `${this.lunabyBaseURL}/chat/completions`,
      {
        model: model,
        messages: messages,
        max_tokens: config.max_tokens || 2048,
        stream: false,
        ...config,
      },
      {
        headers: {
          "Authorization": `Bearer ${this.lunabyApiKey}`,
          "Content-Type": "application/json"
        },
        timeout: 120000
      }
    );

    const tokenUsage = response.data.usage || {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0
    };
    
    if (response.data.data) {
      logger.info("AI_CORE", "Processing image generation response");
      return {
        content: response.data.data[0].b64_json,
        revised_prompt: response.data.data[0].revised_prompt,
        usage: tokenUsage
      };
    }
  }

  async processChatCompletion(messages, config = {}) {
    try {
      const modelMap = {
        default: "lunaby-pro",
        thinking: "lunaby-reasoning",
        image: "lunaby-vision"
      };
      
      const model = modelMap[config.modelType] || modelMap.default;

      if (config.modelType === 'image') {
        return await this.handleImageGeneration(model, messages, config);
      }

      const response = await axios.post(
        `${this.lunabyBaseURL}/chat/completions`,
        {
          model: model,
          messages: messages,
          max_tokens: config.max_tokens || 2048,
          stream: true,
          ...config,
        },
        {
          headers: {
            "Authorization": `Bearer ${this.lunabyApiKey}`,
            "Content-Type": "application/json"
          },
          timeout: 120000,
          responseType: 'stream'
        }
      );

      return await this.processStreamResponse(response.data);
    } catch (error) {
      let errorMessage = "Đã xảy ra lỗi khi xử lý yêu cầu";
      let errorDetails = error.message;

      if (error.response) {
        const status = error.response.status;
        let data = error.response.data;
        
        if (data && typeof data.on === 'function') {
          try {
            const chunks = [];
            for await (const chunk of data) {
              chunks.push(chunk);
            }
            const rawData = Buffer.concat(chunks).toString('utf-8');
            logger.error("AI_CORE", `API error response status: ${status}, body: ${rawData}`);
            
            try {
              data = JSON.parse(rawData);
            } catch (e) {
              logger.warn("AI_CORE", "Failed to parse error response as JSON");
              data = { message: rawData };
            }
          } catch (readError) {
            logger.error("AI_CORE", "Failed to read error stream:", readError.message);
          }
        } else {
          logger.error("AI_CORE", `API error response status: ${status}`);
          logger.error("AI_CORE", `API error response data:`, data);
        }

        if (data && data.error) {
          errorMessage = data.error;
          errorDetails = data.message || data.error;
          
          if (data.details && data.details.categories) {
            logger.error("AI_CORE", `Blocked categories:`, data.details.categories);
          }
        } else if (status === 500) {
          errorMessage = "Lỗi hệ thống API";
          errorDetails = "Server đang gặp sự cố, vui lòng thử lại sau";
        } else if (status === 400) {
          errorMessage = "Yêu cầu không hợp lệ";
          errorDetails = data?.message || "Dữ liệu gửi đi không đúng định dạng";
        } else if (status === 401 || status === 403) {
          errorMessage = "Lỗi xác thực API";
          errorDetails = "API key không hợp lệ hoặc hết hạn";
        } else if (status === 429) {
          errorMessage = "Vượt quá giới hạn sử dụng";
          errorDetails = "Đã gửi quá nhiều yêu cầu, vui lòng thử lại sau";
        }
      } else if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
        errorMessage = "Hết thời gian chờ";
        errorDetails = "Yêu cầu mất quá nhiều thời gian, vui lòng thử lại";
      } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
        errorMessage = "Không thể kết nối API";
        errorDetails = "Không thể kết nối đến server AI";
      }

      logger.error("AI_CORE", `Chat completion error: ${errorMessage} - ${errorDetails}`);
      
      const finalError = new Error(errorMessage);
      finalError.details = errorDetails;
      throw finalError;
    }
  }

  async getThinkingResponse(prompt) {
    try {
      logger.info("AI_CORE", "Processing thinking response");

      const thinkingPrompt = prompts.chat.thinking.replace("${promptText}", prompt);
      const messages = [
        {
          role: "system",
          content: this.systemPrompt,
        },
        {
          role: "user",
          content: thinkingPrompt,
        },
      ];

      const result = await this.processChatCompletion(messages, {
        modelType: 'thinking',
      });

      let content = result.content;
      
      if (!content.includes("🧠 QUÁ TRÌNH SUY NGHĨ:") && !content.includes("💡 CÂU TRẢ LỜI:")) {
        content = "🧠 **QUÁ TRÌNH SUY NGHĨ:**\n" + content;
        content = content.replace("**💡 CÂU TRẢ LỜI:**", "\n\n💡 **CÂU TRẢ LỜI:**");
      }

      return {
        content,
        usage: result.usage
      };
    } catch (error) {
      logger.error("AI_CORE", "Thinking response error:", error.message);
      throw error;
    }
  }

  async getCodeCompletion(prompt) {
    try {
      logger.info("AI_CORE", "Processing code completion");

      const enhancedPrompt = `${prompts.code.prefix} ${prompt} ${prompts.code.suffix}`;
      const messages = [
        {
          role: "system",
          content: this.systemPrompt + prompts.code.systemAddition,
        },
        {
          role: "user",
          content: enhancedPrompt,
        },
      ];

      return await this.processChatCompletion(messages, {
        max_tokens: 4000,
      });
    } catch (error) {
      logger.error("AI_CORE", "Code completion error:", error.message);
      throw error;
    }
  }

  getModelName() {
    return this.Model;
  }

  isReady() {
    return !!this.lunabyApiKey;
  }
}

module.exports = new AICore();
