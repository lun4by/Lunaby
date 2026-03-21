const logger = require("../utils/logger.js");
const storageDB = require("./storagedb.js");
const conversationManager = require("../handlers/conversationManager.js");
const prompts = require("../config/prompts.js");
const textUtils = require("../utils/textUtils.js");
const AICore = require("./AICore.js");
const QuotaService = require("./QuotaService.js");
const MemoryService = require("./MemoryService.js");
const Validators = require("../utils/validators.js");
const ErrorHandler = require("../utils/ErrorHandler.js");
const SecurityUtils = require("../utils/SecurityUtils.js");
const {
  DEFAULT_USER_ID,
  DEFAULT_MODEL,
  MAX_CONVERSATION_LENGTH,
  MAX_CONVERSATION_AGE_MS,
  AI_TIMEOUT_MS,
  RECENT_MEMORY_MESSAGES_COUNT,
  RELEVANT_MEMORY_COUNT,
  DETAILED_MEMORY_DISPLAY_COUNT,
  DEFAULT_MEMORY_DISPLAY_COUNT,
  SUMMARY_MESSAGE_TRUNCATE_LENGTH,
  REQUEST_TYPES
} = require("../config/constants.js");

const {
  IMAGE_COMMAND_REGEX,
  MEMORY_COMMAND_REGEX,
  CODE_COMMAND_REGEX,
  MEMORY_ANALYSIS_SUMMARY_KEYWORDS,
  MEMORY_ANALYSIS_DETAILED_KEYWORDS
} = require("../config/patterns.js");

class ConversationService {
  constructor() {
    storageDB.setMaxConversationLength(MAX_CONVERSATION_LENGTH);
    storageDB.setMaxConversationAge(MAX_CONVERSATION_AGE_MS);
  }

  detectRequestType(prompt) {
    const imageMatch = prompt.match(IMAGE_COMMAND_REGEX);
    if (imageMatch) return { type: REQUEST_TYPES.IMAGE, match: imageMatch };

    const memoryMatch = prompt.match(MEMORY_COMMAND_REGEX);
    if (memoryMatch) return { type: REQUEST_TYPES.MEMORY, match: memoryMatch };

    const isCodeRequest = CODE_COMMAND_REGEX.test(prompt);
    if (isCodeRequest) return { type: REQUEST_TYPES.CODE, match: null };

    return { type: REQUEST_TYPES.CHAT, match: null };
  }

  extractUserId(message) {
    if (!message?.author?.id) return DEFAULT_USER_ID;

    const base = message.author.id;
    if (message.channel?.type === "DM") return `DM-${base}`;
    if (message.guildId) return `${message.guildId}-${base}`;
    return base;
  }

  /**
   * Trộn (Enrich) prompt của người dùng với ngữ cảnh từ MemoryService.
   * Cấu trúc thông tin tiêm vào sau khi trộn bao gồm:
   * 1. Hướng dẫn tùy chỉnh (Custom Instructions - do User set).
   * 2. Tóm tắt thông tin cá nhân và preferences (Memory Context).
   * 3. Trích xuất trí nhớ từ trò chuyện quá khứ (Conversation Context).
   * Mục tiêu: Đủ ngữ cảnh để AI hiểu nó đang nói chuyện với ai, trong khi tiết kiệm Tokens.
   */
  async enrichPromptWithMemory(originalPrompt, userId) {
    try {
      originalPrompt = SecurityUtils.sanitizeInput(originalPrompt);
      const memory = await MemoryService.getUserMemory(userId);
      const memoryContext = await MemoryService.buildMemoryContext(userId, originalPrompt);

      const customInstructions = memory?.personalInfo?.customInstructions
        ? SecurityUtils.sanitizeInput(memory.personalInfo.customInstructions)
        : '';
      const instructionsContext = customInstructions
        ? `\n[User custom instructions: ${customInstructions}]\n`
        : '';

      let conversationContext = '';
      if (memory?.privacy?.allowSearchHistoryReference !== false) {
        const fullHistory = await storageDB.getConversationHistory(userId, prompts.system.main, DEFAULT_MODEL);

        if (fullHistory?.length >= 3) {
          const relevantMessages = await this.extractRelevantMemories(fullHistory, originalPrompt);
          if (relevantMessages?.length) {
            conversationContext = prompts.memory.context.replace(
              "${relevantMessagesText}",
              relevantMessages.join(". ")
            );
          }
        }
      }

      return instructionsContext + memoryContext + conversationContext + originalPrompt;

    } catch (error) {
      logger.error("CONVERSATION_SERVICE", "Error enriching prompt with memory:", error);
      return originalPrompt;
    }
  }

  async extractRelevantMemories(history, currentPrompt) {
    try {
      if (!history || history.length < 3) {
        return [];
      }

      const recentMessages = history.slice(-RECENT_MEMORY_MESSAGES_COUNT);
      const conversationSummary = recentMessages
        .filter(msg => msg.role === "user" || msg.role === "assistant")
        .map(msg => textUtils.createMessageSummary(msg.content, msg.role))
        .filter(summaryText => summaryText);

      if (conversationSummary.length === 0) {
        return [];
      }

      const keywords = textUtils.extractKeywords(currentPrompt);
      const relevantMemories = conversationSummary.filter((summary) => {
        const lowerCaseSummary = summary.toLowerCase();
        return keywords.some((keyword) =>
          lowerCaseSummary.includes(keyword.toLowerCase())
        );
      });

      return relevantMemories.slice(-RELEVANT_MEMORY_COUNT);

    } catch (error) {
      logger.error("CONVERSATION_SERVICE", "Error extracting relevant memories:", error);
      return [];
    }
  }

  async getMemoryAnalysis(userId, request) {
    try {
      const fullHistory = await storageDB.getConversationHistory(userId, prompts.system.main, DEFAULT_MODEL);

      if (!fullHistory?.length) {
        return "Mình chưa có bất kỳ trí nhớ nào về cuộc trò chuyện của chúng ta. Hãy bắt đầu trò chuyện nào!";
      }

      const userOrAssistantMessages = fullHistory.filter(
        (msg) => msg.role === "user" || msg.role === "assistant"
      );
      const messageCount = userOrAssistantMessages.length;

      if (messageCount === 0) {
        return "Chúng ta chưa có tin nhắn nào. Hãy bắt đầu trò chuyện nào!";
      }

      let analysis = "";
      const requestLower = request.toLowerCase();

      const formatMessage = (msg) => {
        let roleName = msg.role === "user" ? "Bạn" : "Lunaby";
        let content = msg.content;
        if (content.length > SUMMARY_MESSAGE_TRUNCATE_LENGTH) {
          content = content.substring(0, SUMMARY_MESSAGE_TRUNCATE_LENGTH) + "...";
        }
        return `${roleName}: ${content}`;
      };

      if (MEMORY_ANALYSIS_SUMMARY_KEYWORDS.some(k => requestLower.includes(k))) {
        analysis = `**Tóm tắt cuộc trò chuyện của chúng ta**\n\n`;
        analysis += `- Chúng ta đã trao đổi ${messageCount} tin nhắn\n`;
        analysis += `- Cuộc trò chuyện bắt đầu cách đây ${textUtils.formatTimeAgo(
          fullHistory[0]?.timestamp || Date.now()
        )}\n\n`;
        analysis += `Đây là một số điểm chính từ cuộc trò chuyện:\n`;

        const keyMessages = textUtils.extractKeyMessages(fullHistory);
        keyMessages.forEach((msg, index) => {
          analysis += `${index + 1}. ${msg}\n`;
        });

      } else if (MEMORY_ANALYSIS_DETAILED_KEYWORDS.some(k => requestLower.includes(k))) {
        analysis = `**Lịch sử đầy đủ cuộc trò chuyện của chúng ta**\n\n`;

        const messagesToDisplay = userOrAssistantMessages.slice(-DETAILED_MEMORY_DISPLAY_COUNT);

        if (messageCount > DETAILED_MEMORY_DISPLAY_COUNT) {
          analysis = `*[${messageCount - DETAILED_MEMORY_DISPLAY_COUNT} tin nhắn trước đó không được hiển thị]*\n\n` + analysis;
        }

        const conversationSummary = messagesToDisplay.map(formatMessage);
        analysis += conversationSummary.join("\n\n");

      } else {
        analysis = `**Tóm tắt trí nhớ của cuộc trò chuyện**\n\n`;
        analysis += `- Chúng ta đã trao đổi ${messageCount} tin nhắn\n`;
        analysis += `- Các chủ đề chính: ${textUtils.identifyMainTopics(fullHistory).join(", ")}\n\n`;
        analysis += `**Tin nhắn gần nhất:**\n`;

        const recentMessages = userOrAssistantMessages.slice(-DEFAULT_MEMORY_DISPLAY_COUNT);
        const recentSummary = recentMessages.map(formatMessage);
        analysis += recentSummary.join("\n\n");
      }

      analysis += "\n\n*Lưu ý: Mình vẫn nhớ toàn bộ cuộc trò chuyện của chúng ta và có thể trả lời dựa trên ngữ cảnh đó.*";
      return analysis;

    } catch (error) {
      logger.error("CONVERSATION_SERVICE", "Error analyzing memory:", error);
      return "Xin lỗi, mình gặp lỗi khi truy cập trí nhớ của cuộc trò chuyện. Lỗi: " + error.message;
    }
  }


  async getCompletion(prompt, message = null) {
    try {
      const userId = this.extractUserId(message);
      if (userId === DEFAULT_USER_ID) {
        logger.warn("CONVERSATION_SERVICE", "Cannot determine userId, using default");
      }
      const enhancedPrompt = await this.enrichPromptWithMemory(prompt, userId);
      return await this.processChatCompletion(enhancedPrompt, userId);
    } catch (error) {
      logger.error("CONVERSATION_SERVICE", "Error in getCompletion:", error.message);
      return 'Xin lỗi, hệ thống xảy ra lỗi khi xử lý cuộc trò chuyện. Vui lòng thử lại sau.';
    }
  }

  async buildEnhancedPrompt(prompt, conversationHistory) {
    return `
      ${prompts.chat.instructions}
      ${prompt}
    `;
  }

  async loadAndPrepareHistory(userId, systemPrompt, enhancedPrompt) {
    await conversationManager.loadConversationHistory(userId, systemPrompt, DEFAULT_MODEL);

    await conversationManager.addMessage(userId, "user", enhancedPrompt);

    let messages = conversationManager.getHistory(userId);
    if (!messages || messages.length === 0) {
      logger.error("CONVERSATION_SERVICE", `Empty history for ${userId}, reinitializing`);
      await conversationManager.resetConversation(userId, systemPrompt, DEFAULT_MODEL);
      await conversationManager.addMessage(userId, "user", enhancedPrompt);
      messages = conversationManager.getHistory(userId);
    }

    return messages;
  }

  /**
   * Làm sạch (Sanitize) đầu vào trước khi gửi tới LLM.
   * Đảm bảo message đúng định dạng, loại bỏ khoảng trắng rác, loại bỏ tag bot
   * để giảm Token dư thừa đi vào quá trình training/prompts.
   */
  validateAndCleanMessages(messages) {
    const validMessages = Validators.cleanMessages(messages);
    if (validMessages.length === 0) {
      throw new Error("No valid messages to send");
    }
    return validMessages.map(msg => ({
      ...msg,
      content: SecurityUtils.sanitizeInput(msg.content)
    }));
  }

  /**
   * Giao tiếp với AI API nhưng áp dụng cơ chế Cầu chì (Circuit Breaker / Timeout).
   * Để giới hạn 25 giây, ngăn chặn cuộc gọi treo vô thời hạn (VD: model bị treo).
   */
  async callAIWithTimeout(validMessages, config) {
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('AICore timeout after 25 seconds')), AI_TIMEOUT_MS);
    });

    return await Promise.race([
      AICore.processChatCompletion(validMessages, config),
      timeoutPromise
    ]);
  }

  /**
   * Xử lý kết quả trả về từ cuộc hội thoại.
   * - Ghi lại mức tiêu thụ quota.
   * - Thêm tin nhắn của assistant vào lịch sử.
   * - Kích hoạt tác vụ trích xuất trí nhớ ngầm và cập nhật thống kê tương tác.
   */
  async handleCompletionResult(userId, prompt, result) {
    const content = result.content;
    const tokenUsage = result.usage;

    if (tokenUsage && tokenUsage.total_tokens) {
      QuotaService.recordMessageUsage(userId, 1, 'chat').catch(err =>
        logger.error('CONVERSATION_SERVICE', 'Error recording usage:', err)
      );
    }

    await conversationManager.addMessage(userId, "assistant", content);

    MemoryService.extractMemoryFromConversation(userId, prompt, content).catch(err =>
      logger.error('CONVERSATION_SERVICE', 'Error extracting memory:', err)
    );

    MemoryService.updateInteractionStats(userId).catch(err =>
      logger.error('CONVERSATION_SERVICE', 'Error updating interaction stats:', err)
    );

    return content;
  }

  /**
   * Quy trình xử lý hoàn chỉnh việc tạo phản hồi từ AI (Main Pipeline).
   * 1. Xây dựng prompt nâng cao.
   * 2. Chuẩn bị lịch sử hội thoại.
   * 3. Làm sạch và lọc tin nhắn.
   * 4. Gọi AI với cơ chế timeout bảo vệ.
   * 5. Xử lý và lưu trữ kết quả.
   */
  async processChatCompletion(prompt, userId, additionalConfig = {}) {
    try {
      const systemPrompt = additionalConfig.systemPrompt || prompts.system.main;
      const conversationHistory = conversationManager.getHistory(userId);

      const enhancedPrompt = await this.buildEnhancedPrompt(prompt, conversationHistory);
      const messages = await this.loadAndPrepareHistory(userId, systemPrompt, enhancedPrompt);
      const validMessages = this.validateAndCleanMessages(messages);

      const config = {
        model: additionalConfig.model || AICore.CoreModel,
        max_tokens: additionalConfig.max_tokens || 2048,
        ...additionalConfig,
      };

      const result = await this.callAIWithTimeout(validMessages, config);
      return await this.handleCompletionResult(userId, prompt, result);
    } catch (error) {
      ErrorHandler.logError("CONVERSATION_SERVICE", "Error in processChatCompletion", error);
      const friendlyError = new Error(ErrorHandler.getUserFriendlyMessage(error, "xử lý tin nhắn"));
      friendlyError.originalError = error;
      throw friendlyError;
    }
  }
}

module.exports = new ConversationService();