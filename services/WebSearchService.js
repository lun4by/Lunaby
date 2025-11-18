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

}

module.exports = new WebSearchService();
