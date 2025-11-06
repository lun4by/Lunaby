const logger = require("../utils/logger.js");
const storageDB = require("./storagedb.js");
const conversationManager = require("../handlers/conversationManager.js");
const ownerService = require("./ownerService.js");
const prompts = require("../config/prompts.js");
const textUtils = require("../utils/textUtils.js");
const AICore = require("./AICore.js");
const { AI_RESPONSE_LOCALE } = require("../utils/i18n.js");

class ConversationService {
  constructor() {
    storageDB.setMaxConversationLength(30);
    storageDB.setMaxConversationAge(3 * 60 * 60 * 1000);
    
    logger.info("CONVERSATION_SERVICE", "Initialized conversation service");
  }

  extractUserId(message, defaultUserId = "anonymous-user") {
    if (!message?.author?.id) {
      return defaultUserId;
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
      const fullHistory = await storageDB.getConversationHistory(
        userId,
        prompts.system.main,
        AICore.getModelName()
      );

      if (!fullHistory || fullHistory.length < 3) {
        return originalPrompt;
      }

      const relevantMessages = await this.extractRelevantMemories(
        fullHistory,
        originalPrompt
      );

      if (!relevantMessages || relevantMessages.length === 0) {
        return originalPrompt;
      }

      let enhancedPrompt = originalPrompt;

      if (relevantMessages.length > 0) {
        const memoryContext = prompts.memory.memoryContext.replace(
          "${relevantMessagesText}",
          relevantMessages.join(". ")
        );
        enhancedPrompt = memoryContext + enhancedPrompt;
      }

      return enhancedPrompt;
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

      const conversationSummary = [];
      const recentMessages = history.slice(-10);

      for (let i = 0; i < recentMessages.length; i++) {
        const msg = recentMessages[i];
        if (msg.role === "user" || msg.role === "assistant") {
          const summaryText = textUtils.createMessageSummary(msg.content, msg.role);
          if (summaryText) {
            conversationSummary.push(summaryText);
          }
        }
      }

      const relevantMemories = conversationSummary.filter((summary) => {
        const keywords = textUtils.extractKeywords(currentPrompt);
        return keywords.some((keyword) =>
          summary.toLowerCase().includes(keyword.toLowerCase())
        );
      });

      return relevantMemories.slice(-3);
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

      const conversationSummary = [];
      let messageCount = 0;

      for (const msg of fullHistory) {
        if (msg.role === "user" || msg.role === "assistant") {
          messageCount++;

          let roleName = msg.role === "user" ? "Bạn" : "Lunaby";
          let content = msg.content;

          if (content.length > 150) {
            content = content.substring(0, 150) + "...";
          }

          conversationSummary.push(`${roleName}: ${content}`);
        }
      }

      let analysis = "";

      if (request.toLowerCase().includes("ngắn gọn") || 
          request.toLowerCase().includes("tóm tắt")) {
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
      } else if (request.toLowerCase().includes("đầy đủ") || 
                 request.toLowerCase().includes("chi tiết")) {
        analysis = `**Lịch sử đầy đủ cuộc trò chuyện của chúng ta**\n\n`;

        const maxDisplayMessages = Math.min(conversationSummary.length, 15);
        for (let i = conversationSummary.length - maxDisplayMessages; i < conversationSummary.length; i++) {
          analysis += conversationSummary[i] + "\n\n";
        }

        if (conversationSummary.length > maxDisplayMessages) {
          analysis = `*[${conversationSummary.length - maxDisplayMessages} tin nhắn trước đó không được hiển thị]*\n\n` + analysis;
        }
      } else {
        analysis = `**Tóm tắt trí nhớ của cuộc trò chuyện**\n\n`;
        analysis += `- Chúng ta đã trao đổi ${messageCount} tin nhắn\n`;
        analysis += `- Các chủ đề chính: ${textUtils.identifyMainTopics(fullHistory).join(", ")}\n\n`;

        analysis += `**Tin nhắn gần nhất:**\n`;
        const recentMessages = conversationSummary.slice(-3);
        recentMessages.forEach((msg) => {
          analysis += msg + "\n\n";
        });
      }

      analysis += "\n*Lưu ý: Mình vẫn nhớ toàn bộ cuộc trò chuyện của chúng ta và có thể trả lời dựa trên ngữ cảnh đó.*";

      return analysis;
    } catch (error) {
      logger.error("CONVERSATION_SERVICE", "Error analyzing memory:", error);
      return "Xin lỗi, mình gặp lỗi khi truy cập trí nhớ của cuộc trò chuyện. Lỗi: " + error.message;
    }
  }

  async formatResponseContent(content, isNewConversation) {
    return content;
  }

  async getCompletion(prompt, message = null) {
    try {
      const userId = this.extractUserId(message);
      if (userId === "anonymous-user") {
        logger.warn("CONVERSATION_SERVICE", "Cannot determine userId, using default");
      }

      let isOwnerInteraction = false;
      let ownerMentioned = false;
      let ownerSpecialResponse = "";

      if (message?.author?.id) {
        isOwnerInteraction = ownerService.isOwner(message.author.id);
        ownerMentioned = ownerService.isOwnerMentioned(prompt, message);

        if (ownerMentioned) {
          logger.info("CONVERSATION_SERVICE", "Owner mentioned in message");
          ownerSpecialResponse = await ownerService.getOwnerMentionResponse(prompt);
        }
      }

      const imageCommandRegex = /^(vẽ|tạo hình|vẽ hình|hình|tạo ảnh ai|tạo ảnh)\s+(.+)$/i;
      const imageMatch = prompt.match(imageCommandRegex);

      if (imageMatch) {
        const imagePrompt = imageMatch[2];
        const commandUsed = imageMatch[1];
        logger.info("CONVERSATION_SERVICE", `Image command detected: "${commandUsed}". Prompt: ${imagePrompt}`);
        return `Để tạo hình ảnh, vui lòng sử dụng lệnh /image với nội dung bạn muốn tạo. Ví dụ:\n/image ${imagePrompt}`;
      }

      const memoryAnalysisRegex = /^(nhớ lại|trí nhớ|lịch sử|conversation history|memory|như nãy|vừa gửi|vừa đề cập)\s*(.*)$/i;
      const memoryMatch = prompt.match(memoryAnalysisRegex);

      if (memoryMatch) {
        const memoryRequest = memoryMatch[2].trim() || "toàn bộ cuộc trò chuyện";
        return await this.getMemoryAnalysis(userId, memoryRequest);
      }

      if (prompts.trainingData.keywords.test(prompt)) {
        logger.info("CONVERSATION_SERVICE", "Training data question detected, returning direct response");
        return prompts.trainingData.response;
      }

      if (prompts.modelInfo.keywords.test(prompt)) {
        logger.info("CONVERSATION_SERVICE", "Model info question detected, returning direct response");
        return prompts.modelInfo.response;
      }

      const enhancedPromptWithMemory = await this.enrichPromptWithMemory(prompt, userId);

      let content = await this.processChatCompletion(enhancedPromptWithMemory, userId);

      if (ownerSpecialResponse) {
        content = `${ownerSpecialResponse}\n\n${content}`;
      }

      return content;
    } catch (error) {
      logger.error("CONVERSATION_SERVICE", "Error in getCompletion:", error.message);
      return `Xin lỗi, hệ thống xảy ra lỗi khi xử lý cuộc trò chuyện. Vui lòng thử lại sau.`;
    }
  }

  async processChatCompletion(prompt, userId, additionalConfig = {}) {
    try {
      let systemPrompt = additionalConfig.systemPrompt || prompts.system.main;
      
      const localeInstruction = AI_RESPONSE_LOCALE === 'vi' 
        ? 'Bạn phải trả lời bằng tiếng Việt.' 
        : 'You must respond in English.';
      systemPrompt += `\n\nIMPORTANT: ${localeInstruction}`;

      await conversationManager.loadConversationHistory(userId, systemPrompt, AICore.getModelName());

      const conversationHistory = conversationManager.getHistory(userId);
      const isNewConversation = !conversationHistory || conversationHistory.length <= 2;

      let enhancedPrompt = prompts.chat.responseStyle;

      if (!isNewConversation) {
        enhancedPrompt += prompts.chat.ongoingConversation;
      } else {
        enhancedPrompt += prompts.chat.newConversation;
      }

      enhancedPrompt += prompts.chat.generalInstructions + ` ${prompt}`;

      await conversationManager.addMessage(userId, "user", enhancedPrompt);

      let messages = conversationManager.getHistory(userId);
      if (!messages || messages.length === 0) {
        logger.error("CONVERSATION_SERVICE", `Empty conversation history for userId: ${userId}, reinitializing`);
        await conversationManager.resetConversation(userId, systemPrompt, AICore.getModelName());
        await conversationManager.addMessage(userId, "user", enhancedPrompt);
        messages = conversationManager.getHistory(userId);
      }

      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('AICore timeout after 25 seconds')), 25000);
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
        const TokenService = require('./TokenService.js');
        TokenService.recordMessageUsage(userId, 1, 'chat').catch(err =>
          logger.error('CONVERSATION_SERVICE', 'Error recording usage:', err)
        );
      }

      await conversationManager.addMessage(userId, "assistant", content);
      const formattedContent = await this.formatResponseContent(content, isNewConversation);

      return formattedContent;
    } catch (error) {
      logger.error("CONVERSATION_SERVICE", "Error in processChatCompletion:", error.message);
      
      if (error.message.includes('timeout')) {
        throw new Error("AI service timeout. Vui lòng thử lại sau.");
      }
      
      throw error;
    }
  }
}

module.exports = new ConversationService(); 