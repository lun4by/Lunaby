const logger = require("../utils/logger.js");
const storageDB = require("./storagedb.js");
const conversationManager = require("../handlers/conversationManager.js");
const prompts = require("../config/prompts.js");
const textUtils = require("../utils/textUtils.js");
const AICore = require("./AICore.js");
const TokenService = require("./TokenService.js");
const MemoryService = require("./MemoryService.js");

const DEFAULT_USER_ID = "anonymous-user";
const MAX_CONVERSATION_LENGTH = 30;
const MAX_CONVERSATION_AGE_MS = 3 * 60 * 60 * 1000; // 3 giờ
const AI_TIMEOUT_MS = 25000; // 25 giây
const RECENT_MEMORY_MESSAGES_COUNT = 10;
const RELEVANT_MEMORY_COUNT = 3;
const DETAILED_MEMORY_DISPLAY_COUNT = 15;
const DEFAULT_MEMORY_DISPLAY_COUNT = 3;
const SUMMARY_MESSAGE_TRUNCATE_LENGTH = 150;

const IMAGE_COMMAND_REGEX = /^(vẽ|tạo hình|vẽ hình|hình|tạo ảnh ai|tạo ảnh)\s+(.+)$/i;
const MEMORY_COMMAND_REGEX = /^(nhớ lại|trí nhớ|lịch sử|conversation history|memory|như nãy|vừa gửi|vừa đề cập)\s*(.*)$/i;
const CODE_COMMAND_REGEX = /\b(code|code completion|function|method|write|implement|create|viết code|viết hàm|tạo hàm|code snippet|đoạn code|class|const|let|var|function|def|return|async|await|javascript|python|java|php|c\+\+|ruby|go|rust)\b/gi;

const MEMORY_ANALYSIS_SUMMARY_KEYWORDS = ["ngắn gọn", "tóm tắt"];
const MEMORY_ANALYSIS_DETAILED_KEYWORDS = ["đầy đủ", "chi tiết"];

class ConversationService {
  constructor() {
    storageDB.setMaxConversationLength(MAX_CONVERSATION_LENGTH);
    storageDB.setMaxConversationAge(MAX_CONVERSATION_AGE_MS);

    logger.info("CONVERSATION_SERVICE", "Initialized conversation service");
  }

  detectRequestType(prompt) {
    const imageMatch = prompt.match(IMAGE_COMMAND_REGEX);
    if (imageMatch) return { type: 'image', match: imageMatch };

    const memoryMatch = prompt.match(MEMORY_COMMAND_REGEX);
    if (memoryMatch) return { type: 'memory', match: memoryMatch };

    const isCodeRequest = CODE_COMMAND_REGEX.test(prompt);
    if (isCodeRequest) return { type: 'code', match: null };

    return { type: 'chat', match: null };
  }

  extractUserId(message) {
    if (!message?.author?.id) {
      return DEFAULT_USER_ID;
    }

    let userId = message.author.id;

    if (message.channel && message.channel.type === "DM") {
      userId = `DM-${userId}`;
    } else if (message.guildId) {
      userId = `${message.guildId}-${userId}`;
    }

    return userId;
  }

  async enrichPromptWithMemory(originalPrompt, userId) {
    try {
      const memoryContext = await MemoryService.buildMemoryContext(userId, originalPrompt);

      const fullHistory = await storageDB.getConversationHistory(
        userId,
        prompts.system.main,
        AICore.getModelName()
      );

      let conversationContext = '';
      if (fullHistory && fullHistory.length >= 3) {
        const relevantMessages = await this.extractRelevantMemories(
          fullHistory,
          originalPrompt
        );

        if (relevantMessages && relevantMessages.length > 0) {
          conversationContext = prompts.memory.memoryContext.replace(
            "${relevantMessagesText}",
            relevantMessages.join(". ")
          );
        }
      }

      return memoryContext + conversationContext + originalPrompt;

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
      logger.info("CONVERSATION_SERVICE", `Analyzing memory for user ${userId}`);

      const fullHistory = await storageDB.getConversationHistory(
        userId,
        prompts.system.main,
        AICore.getModelName()
      );

      if (!fullHistory || fullHistory.length === 0) {
        return "Mình chưa có bất kỳ trí nhớ nào về cuộc trò chuyện của chúng ta. Hãy bắt đầu trò chuyện nào! 😊";
      }

      const userOrAssistantMessages = fullHistory.filter(
        (msg) => msg.role === "user" || msg.role === "assistant"
      );
      const messageCount = userOrAssistantMessages.length;

      if (messageCount === 0) {
        return "Chúng ta chưa có tin nhắn nào. Hãy bắt đầu trò chuyện nào! 😊";
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

      const enhancedPromptWithMemory = await this.enrichPromptWithMemory(prompt, userId);

      let content = await this.processChatCompletion(enhancedPromptWithMemory, userId);

      return content;

    } catch (error) {
      logger.error("CONVERSATION_SERVICE", "Error in getCompletion:", error.message);
      return `Xin lỗi, hệ thống xảy ra lỗi khi xử lý cuộc trò chuyện. Vui lòng thử lại sau.`;
    }
  }

  
  async processChatCompletion(prompt, userId, additionalConfig = {}) {
    try {
      let systemPrompt = additionalConfig.systemPrompt || prompts.system.main;

      await conversationManager.loadConversationHistory(userId, systemPrompt, AICore.getModelName());
      const conversationHistory = conversationManager.getHistory(userId);
      const isNewConversation = !conversationHistory || conversationHistory.length <= 2;

      const enhancedPrompt = `
        ${prompts.chat.responseStyle}
        ${isNewConversation ? prompts.chat.newConversation : prompts.chat.ongoingConversation}
        ${prompts.chat.generalInstructions}
        ${prompt}
      `;

      await conversationManager.addMessage(userId, "user", enhancedPrompt);

      let messages = conversationManager.getHistory(userId);
      if (!messages || messages.length === 0) {
        logger.error("CONVERSATION_SERVICE", `Empty history for ${userId}, reinitializing`);
        await conversationManager.resetConversation(userId, systemPrompt, AICore.getModelName());
        await conversationManager.addMessage(userId, "user", enhancedPrompt);
        messages = conversationManager.getHistory(userId);
      }

      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('AICore timeout after 25 seconds')), AI_TIMEOUT_MS);
      });
      
      const result = await Promise.race([
        AICore.processChatCompletion(messages, {
          model: additionalConfig.model || AICore.CoreModel,
          max_tokens: additionalConfig.max_tokens || 2048,
          ...additionalConfig,
        }),
        timeoutPromise
      ]);

      const content = result.content;
      const tokenUsage = result.usage;

      if (tokenUsage && tokenUsage.total_tokens) {
        TokenService.recordMessageUsage(userId, 1, 'chat').catch(err =>
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

    } catch (error) {
      logger.error("CONVERSATION_SERVICE", "Error in processChatCompletion:", error.message);
      
      let userFriendlyMessage = "Không thể xử lý tin nhắn";
      
      if (error.message.includes('timeout') || error.message.includes('Hết thời gian')) {
        userFriendlyMessage = "Yêu cầu mất quá nhiều thời gian. Vui lòng thử lại với tin nhắn ngắn gọn hơn.";
      } else if (error.message.includes('vi phạm') || error.message.includes('không được phép')) {
        userFriendlyMessage = "Nội dung vi phạm chính sách an toàn. Vui lòng thử lại với nội dung khác.";
      } else if (error.message.includes('hệ thống') || error.message.includes('Internal')) {
        userFriendlyMessage = "Hệ thống AI tạm thời bận. Vui lòng thử lại sau vài giây.";
      } else if (error.message.includes('kết nối')) {
        userFriendlyMessage = "Không thể kết nối đến server AI. Vui lòng thử lại sau.";
      } else if (error.details) {
        userFriendlyMessage = error.details;
      }
      
      const friendlyError = new Error(userFriendlyMessage);
      friendlyError.originalError = error;
      throw friendlyError;
    }
  }
}

module.exports = new ConversationService();