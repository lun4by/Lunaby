const mongoClient = require('./database/mongoClient.js');
const logger = require('../utils/logger.js');
const AICore = require('./AICore.js');
const prompts = require('../config/prompts.js');

class MemoryService {
  constructor() {
    this.memoryCache = new Map();
    this.cacheExpiry = 30 * 60 * 1000;

    logger.debug('MEMORY_SERVICE', 'Service initialized');
  }


  async getMemoryCollection() {
    const db = mongoClient.getDb();
    return db.collection('user_memories');
  }

  async initializeMemoryCollection() {
    try {
      const db = mongoClient.getDb();
      const collections = await db.listCollections({ name: 'user_memories' }).toArray();
      if (collections.length === 0) {
        await db.createCollection('user_memories');
        logger.info('MEMORY_SERVICE', 'Created user_memories collection');
      }

      const collection = await this.getMemoryCollection();
      await collection.createIndex({ userId: 1 }, { unique: true });
      await collection.createIndex({ 'lastUpdated': 1 });
      await collection.createIndex({ 'memories.category': 1 });

      logger.info('MEMORY_SERVICE', 'Memory system ready');
    } catch (error) {
      logger.error('MEMORY_SERVICE', 'Error initializing memory collection:', error);
      throw error;
    }
  }


  getDefaultMemoryStructure(userId) {
    return {
      userId: userId,
      createdAt: new Date(),
      lastUpdated: new Date(),

      personalInfo: {
        name: null,
        nickname: null,
        age: null,
        location: null,
        occupation: null,
        customInstructions: null,
        birthday: null,
        timezone: null,
        language: 'vi'
      },

      preferences: {
        topics: [], // Chủ đề yêu thích: ["anime", "music", "coding"]
        hobbies: [], // Sở thích
        likes: [], // Điều người dùng thích
        dislikes: [], // Điều người dùng không thích
        favoriteAnime: [],
        favoriteGames: [],
        favoriteMusic: [],
        communicationStyle: 'friendly' // friendly, formal, casual
      },

      memories: [
        // {
        //   id: "unique-id",
        //   content: "User told me they love coffee",
        //   category: "preference", // preference, fact, event, achievement
        //   importance: 5, // 1-10 scale
        //   timestamp: Date,
        //   source: "conversation", // conversation, command, auto-extracted
        //   tags: ["coffee", "drinks", "preference"]
        // }
      ],

      relationships: {
        friends: [],
        familyMembers: [],
        pets: []
      },

      interactionStats: {
        totalConversations: 0,
        totalMessages: 0,
        firstInteraction: new Date(),
        lastInteraction: new Date(),
        favoriteTopics: {},
        conversationTimes: [],
        responsePreferences: {
          detailLevel: 'medium',
          useEmojis: true,
          formalityLevel: 'casual'
        }
      },

      currentContext: {
        activeGoals: [],
        ongoingProjects: [],
        currentMood: null,
        recentTopics: []
      },

      privacy: {
        allowMemoryStorage: true,
        allowPersonalInfoExtraction: true,
        allowPreferenceTracking: true,
        allowSearchHistoryReference: true,
        sensitiveTopics: []
      }
    };
  }


  async getUserMemory(userId) {
    try {
      const cached = this.memoryCache.get(userId);
      if (cached && (Date.now() - cached.timestamp < this.cacheExpiry)) {
        return cached.data;
      }

      const collection = await this.getMemoryCollection();
      let memory = await collection.findOne({ userId: userId });

      if (!memory) {
        memory = this.getDefaultMemoryStructure(userId);
        await collection.insertOne(memory);
        logger.info('MEMORY_SERVICE', `Created new memory profile for user ${userId}`);
      }

      this.memoryCache.set(userId, {
        data: memory,
        timestamp: Date.now()
      });

      return memory;
    } catch (error) {
      logger.error('MEMORY_SERVICE', `Error getting user memory for ${userId}:`, error);
      return this.getDefaultMemoryStructure(userId);
    }
  }


  async updateUserMemory(userId, updates) {
    try {
      const collection = await this.getMemoryCollection();

      const updateDoc = {
        $set: {
          ...updates,
          lastUpdated: new Date()
        }
      };

      await collection.updateOne(
        { userId: userId },
        updateDoc,
        { upsert: true }
      );

      this.memoryCache.delete(userId);

      logger.info('MEMORY_SERVICE', `Updated memory for user ${userId}`);
      return true;
    } catch (error) {
      logger.error('MEMORY_SERVICE', `Error updating user memory for ${userId}:`, error);
      return false;
    }
  }


  async addMemory(userId, memoryData) {
    try {
      const memory = await this.getUserMemory(userId);

      if (!memory.privacy.allowMemoryStorage) {
        logger.info('MEMORY_SERVICE', `Memory storage disabled for user ${userId}`);
        return false;
      }

      const newMemory = {
        id: `mem_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        content: memoryData.content,
        category: memoryData.category || 'fact',
        importance: memoryData.importance || 5,
        timestamp: new Date(),
        source: memoryData.source || 'manual',
        tags: memoryData.tags || []
      };

      const collection = await this.getMemoryCollection();
      await collection.updateOne(
        { userId: userId },
        {
          $push: { memories: newMemory },
          $set: { lastUpdated: new Date() }
        }
      );

      this.memoryCache.delete(userId);

      logger.info('MEMORY_SERVICE', `Added memory for user ${userId}: ${memoryData.content.substring(0, 50)}...`);
      return true;
    } catch (error) {
      logger.error('MEMORY_SERVICE', `Error adding memory for ${userId}:`, error);
      return false;
    }
  }


  async extractMemoryFromConversation(userId, userMessage, aiResponse) {
    try {
      const memory = await this.getUserMemory(userId);

      if (!memory.privacy.allowPersonalInfoExtraction) {
        return null;
      }

      const extractionPrompt = prompts.memory.extraction
        .replace('${userMessage}', userMessage)
        .replace('${aiResponse}', aiResponse);

      const messages = [
        { role: 'system', content: prompts.system.main },
        { role: 'user', content: extractionPrompt }
      ];

      const result = await AICore.processChatCompletion(messages, {
        max_tokens: 500,
        temperature: 0.3
      });

      let extracted;
      try {
        const jsonMatch = result.content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          extracted = JSON.parse(jsonMatch[0]);
        } else {
          return null;
        }
      } catch (parseError) {
        logger.error('MEMORY_SERVICE', 'Error parsing extraction result:', parseError);
        return null;
      }

      if (!extracted.extracted) {
        return null;
      }

      const updates = {};

      if (extracted.personalInfo) {
        for (const [key, value] of Object.entries(extracted.personalInfo)) {
          if (value && value.trim()) {
            updates[`personalInfo.${key}`] = value;
          }
        }
      }

      if (extracted.preferences) {
        for (const [type, items] of Object.entries(extracted.preferences)) {
          if (Array.isArray(items) && items.length > 0) {
            updates[`preferences.${type}`] = items;
          }
        }
      }

      if (Object.keys(updates).length > 0) {
        await this.updateUserMemory(userId, updates);
      }

      if (extracted.memory && extracted.memory.content) {
        await this.addMemory(userId, {
          ...extracted.memory,
          source: 'auto-extracted'
        });
      }

      return extracted;
    } catch (error) {
      logger.error('MEMORY_SERVICE', `Error extracting memory from conversation for ${userId}:`, error);
      return null;
    }
  }


  async getRelevantMemories(userId, currentMessage, limit = 5) {
    try {
      const memory = await this.getUserMemory(userId);

      if (!memory.memories || memory.memories.length === 0) {
        return [];
      }

      const messageLower = currentMessage.toLowerCase();
      const keywords = messageLower.split(/\s+/).filter(w => w.length > 3);

      const scoredMemories = memory.memories.map(mem => {
        let score = mem.importance || 5;

        if (mem.tags && mem.tags.length > 0) {
          const matchingTags = mem.tags.filter(tag =>
            keywords.some(kw => tag.toLowerCase().includes(kw) || kw.includes(tag.toLowerCase()))
          );
          score += matchingTags.length * 3;
        }

        const contentLower = mem.content.toLowerCase();
        const matchingKeywords = keywords.filter(kw => contentLower.includes(kw));
        score += matchingKeywords.length * 2;

        const daysSince = (Date.now() - new Date(mem.timestamp).getTime()) / (1000 * 60 * 60 * 24);
        if (daysSince < 7) score += 2;
        else if (daysSince < 30) score += 1;

        return { ...mem, score };
      });

      scoredMemories.sort((a, b) => b.score - a.score);
      return scoredMemories.slice(0, limit);
    } catch (error) {
      logger.error('MEMORY_SERVICE', `Error getting relevant memories for ${userId}:`, error);
      return [];
    }
  }


  async buildMemoryContext(userId, currentMessage) {
    try {
      const memory = await this.getUserMemory(userId);
      const relevantMemories = await this.getRelevantMemories(userId, currentMessage);

      let context = '';

      if (memory.personalInfo.name || memory.personalInfo.nickname) {
        const name = memory.personalInfo.nickname || memory.personalInfo.name;
        context += `[User's name: ${name}]\n`;
      }

      const preferences = [];
      if (memory.preferences.likes.length > 0) {
        preferences.push(`Likes: ${memory.preferences.likes.join(', ')}`);
      }
      if (memory.preferences.dislikes.length > 0) {
        preferences.push(`Dislikes: ${memory.preferences.dislikes.join(', ')}`);
      }
      if (memory.preferences.hobbies.length > 0) {
        preferences.push(`Hobbies: ${memory.preferences.hobbies.join(', ')}`);
      }

      if (preferences.length > 0) {
        context += `[User preferences: ${preferences.join(' | ')}]\n`;
      }

      if (relevantMemories.length > 0) {
        context += `[Important memories about user:\n`;
        relevantMemories.forEach((mem, idx) => {
          context += `${idx + 1}. ${mem.content}\n`;
        });
        context += `]\n`;
      }

      if (memory.currentContext.activeGoals.length > 0) {
        context += `[User's current goals: ${memory.currentContext.activeGoals.join(', ')}]\n`;
      }

      if (context) {
        context = `\n===== USER MEMORY CONTEXT =====\n${context}===== END MEMORY CONTEXT =====\n\n`;
      }

      return context;
    } catch (error) {
      logger.error('MEMORY_SERVICE', `Error building memory context for ${userId}:`, error);
      return '';
    }
  }


  async updateInteractionStats(userId, topic = null) {
    try {
      const updates = {
        'interactionStats.totalMessages': { $inc: 1 },
        'interactionStats.lastInteraction': new Date()
      };

      if (topic) {
        updates[`interactionStats.favoriteTopics.${topic}`] = { $inc: 1 };
      }

      const collection = await this.getMemoryCollection();
      await collection.updateOne(
        { userId: userId },
        updates
      );

      this.memoryCache.delete(userId);
    } catch (error) {
      logger.error('MEMORY_SERVICE', `Error updating interaction stats for ${userId}:`, error);
    }
  }


  async getMemorySummary(userId) {
    try {
      const memory = await this.getUserMemory(userId);

      return {
        personalInfo: memory.personalInfo,
        preferences: memory.preferences,
        totalMemories: memory.memories.length,
        importantMemories: memory.memories
          .filter(m => m.importance >= 7)
          .sort((a, b) => b.importance - a.importance)
          .slice(0, 10),
        interactionStats: memory.interactionStats,
        currentContext: memory.currentContext
      };
    } catch (error) {
      logger.error('MEMORY_SERVICE', `Error getting memory summary for ${userId}:`, error);
      return null;
    }
  }


  async deleteMemory(userId, memoryId) {
    try {
      const collection = await this.getMemoryCollection();

      await collection.updateOne(
        { userId: userId },
        {
          $pull: { memories: { id: memoryId } },
          $set: { lastUpdated: new Date() }
        }
      );

      this.memoryCache.delete(userId);
      logger.info('MEMORY_SERVICE', `Deleted memory ${memoryId} for user ${userId}`);
      return true;
    } catch (error) {
      logger.error('MEMORY_SERVICE', `Error deleting memory for ${userId}:`, error);
      return false;
    }
  }


  async clearUserMemories(userId) {
    try {
      const collection = await this.getMemoryCollection();

      await collection.deleteOne({ userId: userId });
      this.memoryCache.delete(userId);

      logger.info('MEMORY_SERVICE', `Cleared all memories for user ${userId}`);
      return true;
    } catch (error) {
      logger.error('MEMORY_SERVICE', `Error clearing memories for ${userId}:`, error);
      return false;
    }
  }


  async updatePrivacySettings(userId, privacySettings) {
    try {
      const updates = {};
      for (const [key, value] of Object.entries(privacySettings)) {
        updates[`privacy.${key}`] = value;
      }

      await this.updateUserMemory(userId, updates);
      logger.info('MEMORY_SERVICE', `Updated privacy settings for user ${userId}`);
      return true;
    } catch (error) {
      logger.error('MEMORY_SERVICE', `Error updating privacy settings for ${userId}:`, error);
      return false;
    }
  }
}

module.exports = new MemoryService();
