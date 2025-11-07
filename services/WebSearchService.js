const axios = require("axios");
const logger = require("../utils/logger.js");

class WebSearchService {
  constructor() {
    this.perplexityBaseURL = "https://api.perplexity.ai";
    this.perplexityApiKey = process.env.PERPLEXITY_API_KEY;

    if (!this.perplexityApiKey) {
      logger.warn("WEB_SEARCH", "PERPLEXITY_API_KEY not configured!");
    } else {
      logger.info("WEB_SEARCH", "Initialized with Perplexity API");
    }
  }

  /**
   * Thực hiện tìm kiếm web sử dụng Perplexity API
   * @param {string} query - Truy vấn tìm kiếm
   * @param {Object} options - Tùy chọn tìm kiếm
   * @returns {Promise<Object>} - Kết quả tìm kiếm
   */
  async search(query, options = {}) {
    if (!this.perplexityApiKey) {
      throw new Error("PERPLEXITY_API_KEY not configured!");
    }

    if (!query || typeof query !== "string" || query.trim().length === 0) {
      throw new Error("Query không hợp lệ!");
    }

    try {
      logger.info("WEB_SEARCH", `Searching: "${query}"`);

      const model = options.model || "sonar";
      const max_tokens = options.max_tokens || 2048;

      const response = await axios.post(
        `${this.perplexityBaseURL}/chat/completions`,
        {
          model: model,
          messages: [{ role: "user", content: query }],
          max_tokens: max_tokens,
          temperature: 0.7,
          top_p: 0.9,
          return_images: true,
          return_related_questions: true,
          search_recency_filter: "month",
        },
        {
          headers: {
            "Authorization": `Bearer ${this.perplexityApiKey}`,
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
      logger.error("WEB_SEARCH", `Error: ${error.message}`);
      throw error;
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
      const result = await this.search(query, options);
      await progressTracker.update("Đang xử lý kết quả", 80);
      await progressTracker.complete();
      return result;
    } catch (error) {
      await progressTracker.error(error.message);
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
      'tin tức', 'news', 'mới', 'latest', 'hiện tại', 'bây giờ',
      'anime', 'phim', 'series', 'tập mới', 'episode',
      'điện thoại', 'laptop', 'sản phẩm', 'release',
      'bão', 'thời tiết', 'weather',
      'nhạc', 'bài hát', 'music', 'artist',
      'video', 'youtube', 'streamer', 'stream',
      'giá', 'price', 'stock market', 'chứng khoán',
      'sự kiện', 'event', 'hôm nay', 'today', 'hôm qua',
      'covid', 'dịch', 'corona', 'virus'
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
          const errorContent =
            `### ❌ Lỗi Tìm Kiếm\n` +
            `> "${queryPreview}"\n\n` +
            `**Lỗi:** ${errorMessage}\n` +
            `**Thời gian:** ${elapsedTime}s`;

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
