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

  async processChatCompletion(messages, config = {}) {
    try {
      const modelMap = {
        default: "lunaby-pro",
        thinking: "lunaby-reasoning",
        image: "lunaby-vision"
      };
      
      const model = modelMap[config.modelType] || modelMap.default;
      
      const response = await axios.post(
        `${this.lunabyBaseURL}/chat/completions`,
        {
          model: model,
          messages: messages,
          max_tokens: config.max_tokens || 2048,
          ...config,
        },
        {
          headers: {
            "Authorization": `Bearer ${this.lunabyApiKey}`,
            "Content-Type": "application/json"
          },
          timeout: 60000
        }
      );

      
      const tokenUsage = response.data.usage || {
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0
      };

      if (config.modelType === 'image' && response.data.data) {
        logger.info("AI_CORE", "Processing image generation response");
        return {
          content: response.data.data[0].b64_json,
          revised_prompt: response.data.data[0].revised_prompt,
          usage: tokenUsage
        };
      }

      return {
        content: response.data.choices[0].message.content,
        usage: tokenUsage
      };
    } catch (error) {
      let errorMessage = "Đã xảy ra lỗi khi xử lý yêu cầu";
      let errorDetails = error.message;

      if (error.response) {
        const status = error.response.status;
        const data = error.response.data;
        
        logger.error("AI_CORE", `API error response status: ${status}`);
        logger.error("AI_CORE", `API error response data:`, data);

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
