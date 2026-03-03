const logger = require("../utils/logger.js");
const storageDB = require("./storagedb.js");
const conversationManager = require("../handlers/conversationManager.js");
const prompts = require("../config/prompts.js");
const textUtils = require("../utils/textUtils.js");
const AICore = require("./AICore.js");
const QuotaService = require("./QuotaService.js");
const MemoryService = require("./MemoryService.js");
const Validators = require("../utils/validators.js");
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
      const memory = await MemoryService.getUserMemory(userId);

      // Build memory context (respects allowMemoryStorage internally)
      const memoryContext = await MemoryService.buildMemoryContext(userId, originalPrompt);

      // Custom instructions
      let instructionsContext = '';
      if (memory?.personalInfo?.customInstructions) {
        instructionsContext = `\n[User custom instructions: ${memory.personalInfo.customInstructions}]\n`;
      }

      // Conversation history reference (respects allowSearchHistoryReference)
      let conversationContext = '';
      const allowSearchRef = memory?.privacy?.allowSearchHistoryReference !== false;

      if (allowSearchRef) {
        const fullHistory = await storageDB.getConversationHistory(
          userId,
          prompts.system.main,
          DEFAULT_MODEL
        );

        if (fullHistory && fullHistory.length >= 3) {
          const relevantMessages = await this.extractRelevantMemories(
            fullHistory,
            originalPrompt
          );

          if (relevantMessages && relevantMessages.length > 0) {
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
      logger.info("CONVERSATION_SERVICE", `Analyzing memory for user ${userId}`);

      const fullHistory = await storageDB.getConversationHistory(
        userId,
        prompts.system.main,
        DEFAULT_MODEL
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

  async buildEnhancedPrompt(prompt, conversationHistory) {
    const isNewConversation = !conversationHistory || conversationHistory.length <= 2;
    return `
      ${prompts.chat.responseStyle}
      ${isNewConversation ? prompts.chat.newConversation : prompts.chat.ongoingConversation}
      ${prompts.chat.generalInstructions}
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

  validateAndCleanMessages(messages) {
    logger.info("CONVERSATION_SERVICE", `Total messages before validation: ${messages.length}`);
    messages.forEach((msg, idx) => {
      logger.debug("CONVERSATION_SERVICE", `Message[${idx}]: role="${msg?.role}", content length=${msg?.content?.length || 0}`);
    });

    const validMessages = Validators.cleanMessages(messages);

    if (validMessages.length === 0) {
      throw new Error("No valid messages to send");
    }

    logger.info("CONVERSATION_SERVICE", `Sending ${validMessages.length} messages (cleaned from ${messages.length})`);
    return validMessages;
  }

  async callAIWithTimeout(validMessages, config) {
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('AICore timeout after 25 seconds')), AI_TIMEOUT_MS);
    });

    return await Promise.race([
      AICore.processChatCompletion(validMessages, config),
      timeoutPromise
    ]);
  }

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


  async processChatCompletion(prompt, userId, additionalConfig = {}) {
    const ErrorHandler = require("../utils/ErrorHandler.js");
    try {
      const systemPrompt = additionalConfig.systemPrompt || prompts.system.main;

      await conversationManager.loadConversationHistory(userId, systemPrompt, DEFAULT_MODEL);
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
      const userFriendlyMessage = ErrorHandler.getUserFriendlyMessage(error, "xử lý tin nhắn");
      const friendlyError = new Error(userFriendlyMessage);
      friendlyError.originalError = error;
      throw friendlyError;
    }
  }
}

module.exports = new ConversationService();