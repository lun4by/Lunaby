const axios = require("axios");
const logger = require("../utils/logger.js");
const prompts = require("../config/prompts.js");
const initSystem = require("./initSystem.js");
const WebSearchService = require("./WebSearchService.js");

class AICore {
  constructor() {
    this.systemPrompt = prompts.system.main;
    this.Model = "lunaby";
    this.lunabyBaseURL = process.env.LUNABY_BASE_URL || "https://api.lunaby.tech/v1";
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
      logger.error("AI_CORE", "Chat completion error:", error.message);
      throw new Error(`AI API Error: ${error.message}`);
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

  async analyzeContentWithAI(prompt) {
    try {
      logger.info("AI_CORE", "Analyzing content with AI");

      const analysisPrompt = prompts.system.analysis.replace("${promptText}", prompt);
      const messages = [
        {
          role: "system",
          content: prompts.system.format,
        },
        {
          role: "user",
          content: analysisPrompt,
        },
      ];

      const result = await this.processChatCompletion(messages, {
        modelType: 'thinking',
        max_tokens: 1000,
      });

      const analysisResult = JSON.parse(result.content);
      logger.info("AI_CORE", "Content analysis completed");

      return analysisResult;
    } catch (error) {
      logger.error("AI_CORE", "Content analysis error:", error.message);
      return {
        isInappropriate: false,
        categories: [],
        severity: "low",
        explanation: "Không thể phân tích do lỗi: " + error.message,
        suggestedKeywords: [],
      };
    }
  }

  getModelName() {
    return this.Model;
  }

  isReady() {
    return !!this.lunabyApiKey;
  }

  /**
   * Xử lý chat completion với auto-search
   * @param {Array} messages - Messages array
   * @param {Object} options - Options
   * @returns {Promise<Object>}
   */
  async processChatCompletionWithAutoSearch(messages, options = {}) {
    try {
      // Lấy user message cuối cùng để kiểm tra cần search
      const lastMessage = messages[messages.length - 1];
      const userPrompt = lastMessage?.content || '';

      // Kiểm tra xem có cần search không
      if (WebSearchService.shouldSearch(userPrompt) && process.env.PERPLEXITY_API_KEY) {
        logger.info("AI_CORE", "Auto-search triggered for: " + userPrompt.substring(0, 50));
        
        try {
          const searchResult = await WebSearchService.search(userPrompt, { model: 'sonar' });
          
          messages[messages.length - 1].content += `\n\n[REAL-TIME SEARCH RESULT]\n${searchResult.content}`;
          logger.info("AI_CORE", "Search context added to prompt");
        } catch (searchError) {
          logger.warn("AI_CORE", "Auto-search failed, using normal mode: " + searchError.message);
        }
      }

      // Gọi processChatCompletion với messages array
      return await this.processChatCompletion(messages, options);
    } catch (error) {
      logger.error("AI_CORE", "Chat with auto-search error: " + error.message);
      throw error;
    }
  }
}

module.exports = new AICore();
