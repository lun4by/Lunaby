const axios = require("axios");
const logger = require("../utils/logger.js");

class WebSearchService {
  constructor() {
    this.apiBaseURL = "https://api.perplexity.ai";
    this.apiKey = process.env.WEB_SEARCH_API_KEY || process.env.PERPLEXITY_API_KEY;

    if (!this.apiKey) {
      logger.warn("WEB_SEARCH", "WEB_SEARCH_API_KEY not configured!");
    } else {
      logger.info("WEB_SEARCH", "Initialized with Web Search API");
    }
  }

  async search(query, options = {}) {
    if (!this.apiKey) {
      throw new Error("WEB_SEARCH_API_KEY not configured!");
    }

    if (!query || typeof query !== "string" || query.trim().length === 0) {
      throw new Error("Query không hợp lệ!");
    }

    try {
      logger.info("WEB_SEARCH", `Searching: "${query}"`);

      const model = options.model || "sonar";
      const max_tokens = options.max_tokens || 2048;
      const systemPrompt = options.systemPrompt || "Bạn là một trợ lý hữu ích. Hãy cung cấp thông tin chi tiết và chính xác.";

      const messages = [{ role: "user", content: query }];
      
      if (systemPrompt) {
        messages.unshift({ role: "system", content: systemPrompt });
      }

      const response = await axios.post(
        `${this.apiBaseURL}/chat/completions`,
        {
          model: model,
          messages: messages,
          max_tokens: max_tokens,
          temperature: 0.7,
          top_p: 0.9,
          return_images: true,
          return_related_questions: true,
          search_recency_filter: "month",
        },
        {
          headers: {
            "Authorization": `Bearer ${this.apiKey}`,
            "Content-Type": "application/json"
          },
          timeout: 60000
        }
      );

      const content = response.data.choices[0].message.content;
      const usage = response.data.usage || {
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0
      };

      logger.info("WEB_SEARCH", `Search success: "${query}"`);

      return {
        content: content,
        citations: this.extractCitations(content),
        images: response.data.images || [],
        relatedQuestions: response.data.related_questions || [],
        usage: usage
      };
    } catch (error) {
      let errorMessage = "Đã xảy ra lỗi khi tìm kiếm";
      let errorDetails = error.message;

      if (error.response) {
        const status = error.response.status;
        const data = error.response.data;
        
        logger.error("WEB_SEARCH", `API error response status: ${status}`);
        logger.error("WEB_SEARCH", `API error response data:`, data);

        if (status === 500) {
          if (data && data.error) {
            const apiError = data.error;
            if (typeof apiError === 'string') {
              if (apiError.toLowerCase().includes('content') || 
                  apiError.toLowerCase().includes('policy') ||
                  apiError.toLowerCase().includes('safety') ||
                  apiError.toLowerCase().includes('moderation')) {
                errorMessage = "Nội dung vi phạm chính sách an toàn";
                errorDetails = "Từ khóa tìm kiếm chứa nội dung không được phép theo chính sách";
              } else if (apiError.toLowerCase().includes('internal')) {
                errorMessage = "Lỗi hệ thống tìm kiếm";
                errorDetails = "Dịch vụ tìm kiếm đang gặp sự cố tạm thời, vui lòng thử lại sau";
              } else {
                errorMessage = apiError;
                errorDetails = apiError;
              }
            } else if (apiError.message) {
              errorMessage = apiError.message;
              errorDetails = apiError.message;
            }
          } else {
            errorMessage = "Lỗi hệ thống tìm kiếm";
            errorDetails = "Server đang gặp sự cố, vui lòng thử lại sau";
          }
        } else if (status === 400) {
          errorMessage = "Yêu cầu không hợp lệ";
          errorDetails = data?.error?.message || "Từ khóa tìm kiếm không đúng định dạng";
        } else if (status === 401 || status === 403) {
          errorMessage = "Lỗi xác thực API";
          errorDetails = "API key không hợp lệ hoặc hết hạn";
        } else if (status === 429) {
          errorMessage = "Vượt quá giới hạn sử dụng";
          errorDetails = "Đã gửi quá nhiều yêu cầu tìm kiếm, vui lòng thử lại sau";
        }
      } else if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
        errorMessage = "Hết thời gian chờ";
        errorDetails = "Yêu cầu tìm kiếm mất quá nhiều thời gian, vui lòng thử lại";
      } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
        errorMessage = "Không thể kết nối";
        errorDetails = "Không thể kết nối đến dịch vụ tìm kiếm";
      }

      logger.error("WEB_SEARCH", `Search error: ${errorMessage} - ${errorDetails}`);
      
      const finalError = new Error(errorMessage);
      finalError.details = errorDetails;
      throw finalError;
    }
  }

  /**
   * Tìm kiếm với progress tracking
   * @param {string} query - Truy vấn
   * @param {Object} interaction - Discord interaction
   * @param {Object} options - Tùy chọn
   * @returns {Promise<Object>} - Kết quả tìm kiếm
   */
  async searchWithProgress(query, interaction, options = {}) {
    const progressTracker = this.trackProgress(interaction, query);

    try {
      await progressTracker.update("Đang gửi yêu cầu", 30);
      const result = await this.search(query, {
        ...options,
        systemPrompt: options.systemPrompt
      });
      await progressTracker.update("Đang xử lý kết quả", 80);
      await progressTracker.complete();
      return result;
    } catch (error) {
      const errorMsg = error.details || error.message;
      await progressTracker.error(errorMsg);
      throw error;
    }
  }

  /**
   * Kiểm tra query cần search hay không
   * @param {string} text - Text cần kiểm tra
   * @returns {boolean}
   */
  shouldSearch(text) {
    const searchKeywords = [
      // Current news & events
      'tin tức', 'news', 'mới', 'latest', 'hiện tại', 'bây giờ',
      // Entertainment
      'anime', 'phim', 'series', 'tập mới', 'episode',
      // Tech & products
      'điện thoại', 'laptop', 'sản phẩm', 'release',
      // Weather & environment
      'bão', 'thời tiết', 'weather',
      // Music & entertainment
      'nhạc', 'bài hát', 'music', 'artist',
      // Video & streaming
      'video', 'youtube', 'streamer', 'stream',
      // Finance & market
      'giá', 'price', 'stock market', 'chứng khoán',
      // Events & schedules
      'sự kiện', 'event', 'hôm nay', 'today', 'hôm qua',
      // Health & pandemic
      'covid', 'dịch', 'corona', 'virus',
      // AI & technology
      'ai', 'artificial intelligence', 'trí tuệ nhân tạo', 'mô hình ai', 'chatbot',
      // Streaming & content creators
      'streamer', 'youtuber', 'tiktoker', 'content creator', 'kênh', 'channel',
      // Politics & government
      'chính trị', 'politics', 'chính phủ', 'government', 'tổng thống', 'president', 
      'người nắm quyền', 'người lãnh đạo', 'leader', 'thủ tướng', 'prime minister',
      'bầu cử', 'election', 'quốc hội', 'parliament', 'đảng', 'party'
    ];

    const lowerText = text.toLowerCase();
    return searchKeywords.some(keyword => lowerText.includes(keyword));
  }

  /**
   * Trích xuất citations từ content
   * @param {string} content
   * @returns {Array<string>}
   */
  extractCitations(content) {
    const citationRegex = /\[(\d+)\]/g;
    const citations = [];
    let match;

    while ((match = citationRegex.exec(content)) !== null) {
      citations.push(match[1]);
    }

    return [...new Set(citations)];
  }

  /**
   * Tạo progress tracker
   * @param {Object} interaction - Discord interaction
   * @param {string} query - Query
   * @returns {Object}
   */
  trackProgress(interaction, query) {
    const stages = [
      "Đang khởi tạo",
      "Đang gửi yêu cầu",
      "Đang chờ kết quả",
      "Đang xử lý dữ liệu",
      "Đang hoàn thiện"
    ];

    let currentStage = 0;
    let shouldContinue = true;
    let progressMessage = null;

    const isInteraction =
      interaction.replied !== undefined ||
      interaction.deferred !== undefined;

    const startTime = Date.now();
    const queryPreview = query.length > 50 ? query.substring(0, 50) + "..." : query;

    const updateProgress = async (step = 0) => {
      if (!shouldContinue || !interaction) return;

      const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(1);
      const percentComplete = Math.min(Math.floor((currentStage / stages.length) * 100), 99);
      const progressBar = "▓".repeat(Math.floor(percentComplete / 5)) + "░".repeat(20 - Math.floor(percentComplete / 5));

      const content =
        `### 🔍 Đang Tìm Kiếm...\n` +
        `> "${queryPreview}"\n` +
        `**Tiến trình:** ${progressBar} ${percentComplete}%\n` +
        `**Đang thực hiện:** ${stages[currentStage]}\n` +
        `**Thời gian:** ${elapsedTime}s`;

      try {
        if (isInteraction) {
          if (!progressMessage) {
            if (!interaction.deferred && !interaction.replied) {
              await interaction.deferReply();
            }
            progressMessage = await interaction.editReply(content);
          } else {
            await interaction.editReply(content);
          }
        } else {
          if (!progressMessage) {
            progressMessage = await interaction.reply(content);
          } else {
            await progressMessage.edit(content);
          }
        }
      } catch (err) {
        logger.error("WEB_SEARCH", `Progress update error: ${err.message}`);
      }
    };

    let step = 0;
    const progressInterval = setInterval(() => {
      if (!shouldContinue) {
        clearInterval(progressInterval);
        return;
      }
      currentStage = Math.min(currentStage + 1, stages.length - 1);
      updateProgress(step++);
    }, 1200);

    return {
      complete: async () => {
        shouldContinue = false;
        clearInterval(progressInterval);

        try {
          const content = `### ✅ Tìm Kiếm Thành Công!\n> "${queryPreview}"`;
          if (isInteraction) {
            await interaction.editReply(content);
          } else if (progressMessage) {
            await progressMessage.edit(content);
          }
        } catch (err) {
          logger.error("WEB_SEARCH", `Complete error: ${err.message}`);
        }

        return true;
      },

      error: async (errorMessage) => {
        shouldContinue = false;
        clearInterval(progressInterval);

        try {
          const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(1);
          let errorContent = `### ❌ Không Thể Tìm Kiếm\n> "${queryPreview}"\n\n`;

          if (errorMessage.includes('vi phạm') || errorMessage.includes('không được phép')) {
            errorContent += `**Lý do:** Nội dung vi phạm chính sách an toàn\n`;
            errorContent += `> Từ khóa tìm kiếm chứa nội dung không phù hợp\n`;
          } else if (errorMessage.includes('hệ thống') || errorMessage.includes('Internal')) {
            errorContent += `**Lý do:** Hệ thống tìm kiếm đang bận\n`;
            errorContent += `> Vui lòng thử lại sau vài phút\n`;
          } else if (errorMessage.includes('Hết thời gian') || errorMessage.includes('timeout')) {
            errorContent += `**Lý do:** Yêu cầu quá lâu\n`;
            errorContent += `> Vui lòng thử lại với từ khóa đơn giản hơn\n`;
          } else if (errorMessage.includes('kết nối')) {
            errorContent += `**Lý do:** Không thể kết nối dịch vụ\n`;
            errorContent += `> Kiểm tra kết nối mạng hoặc thử lại sau\n`;
          } else {
            errorContent += `**Lỗi:** ${errorMessage}\n`;
          }
          
          errorContent += `**Thời gian:** ${elapsedTime}s`;

          if (isInteraction) {
            if (interaction.deferred || interaction.replied) {
              await interaction.editReply(errorContent);
            } else {
              await interaction.reply(errorContent);
            }
          } else if (progressMessage) {
            await progressMessage.edit(errorContent);
          }
        } catch (err) {
          logger.error("WEB_SEARCH", `Error notification error: ${err.message}`);
        }

        return false;
      },

      update: async (stage, percent) => {
        if (!shouldContinue) return;

        if (stage && stages.includes(stage)) {
          currentStage = stages.indexOf(stage);
        }

        const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(1);
        const actualPercent = percent !== undefined ? percent :
          Math.min(Math.floor((currentStage / stages.length) * 100), 99);
        const progressBar = "▓".repeat(Math.floor(actualPercent / 5)) + "░".repeat(20 - Math.floor(actualPercent / 5));

        const content =
          `### 🔍 Đang Tìm Kiếm...\n` +
          `> "${queryPreview}"\n` +
          `**Tiến trình:** ${progressBar} ${actualPercent}%\n` +
          `**Đang thực hiện:** ${stage || stages[currentStage]}\n` +
          `**Thời gian:** ${elapsedTime}s`;

        try {
          if (isInteraction) {
            if (interaction.deferred || interaction.replied) {
              await interaction.editReply(content);
            }
          } else if (progressMessage) {
            await progressMessage.edit(content);
          }
        } catch (err) {
          logger.error("WEB_SEARCH", `Update error: ${err.message}`);
        }
      }
    };
  }
}

module.exports = new WebSearchService();
