const mongoClient = require("./mongoClient.js");
const logger = require("../utils/logger.js");

/**
 * AI Memory System V2
 * Long-term memory storage for personalized AI interactions
 */
class MemoryService {
  constructor() {
    this.collectionName = "user_memories";
    this.conversationCollectionName = "conversation_history";
  }

  /**
   * Get user's memory profile
   */
  async getUserMemory(userId) {
    try {
      const db = await mongoClient.connect();
      const collection = db.collection(this.collectionName);
      
      let memory = await collection.findOne({ userId });
      
      if (!memory) {
        memory = await this.createUserMemory(userId);
      }
      
      return memory;
    } catch (error) {
      logger.error("MEMORY_SERVICE", `Error getting user memory: ${error.message}`);
      return null;
    }
  }

  /**
   * Create new user memory profile
   */
  async createUserMemory(userId) {
    try {
      const db = await mongoClient.connect();
      const collection = db.collection(this.collectionName);
      
      const newMemory = {
        userId,
        preferences: {
          language: "vi",
          tone: "friendly",
          topics_of_interest: [],
        },
        personal_info: {
          name: null,
          birthday: null,
          location: null,
          occupation: null,
          hobbies: [],
        },
        facts: [], // Array of learned facts about user
        important_dates: [],
        conversation_context: {
          last_topics: [],
          recurring_themes: [],
        },
        statistics: {
          total_interactions: 0,
          first_interaction: new Date(),
          last_interaction: new Date(),
        },
        created_at: new Date(),
        updated_at: new Date(),
      };
      
      await collection.insertOne(newMemory);
      logger.info("MEMORY_SERVICE", `Created memory profile for user ${userId}`);
      
      return newMemory;
    } catch (error) {
      logger.error("MEMORY_SERVICE", `Error creating user memory: ${error.message}`);
      return null;
    }
  }

  /**
   * Update user memory with new information
   */
  async updateUserMemory(userId, updates) {
    try {
      const db = await mongoClient.connect();
      const collection = db.collection(this.collectionName);
      
      const result = await collection.updateOne(
        { userId },
        {
          $set: {
            ...updates,
            updated_at: new Date(),
          },
        },
        { upsert: true }
      );
      
      logger.info("MEMORY_SERVICE", `Updated memory for user ${userId}`);
      return result.modifiedCount > 0 || result.upsertedCount > 0;
    } catch (error) {
      logger.error("MEMORY_SERVICE", `Error updating user memory: ${error.message}`);
      return false;
    }
  }

  /**
   * Add a new fact about the user
   */
  async addFact(userId, fact, category = "general") {
    try {
      const db = await mongoClient.connect();
      const collection = db.collection(this.collectionName);
      
      const factEntry = {
        content: fact,
        category,
        learned_at: new Date(),
        confidence: 1.0,
      };
      
      await collection.updateOne(
        { userId },
        {
          $push: { facts: factEntry },
          $set: { updated_at: new Date() },
        },
        { upsert: true }
      );
      
      logger.info("MEMORY_SERVICE", `Added fact for user ${userId}: ${fact}`);
      return true;
    } catch (error) {
      logger.error("MEMORY_SERVICE", `Error adding fact: ${error.message}`);
      return false;
    }
  }

  /**
   * Store conversation turn
   */
  async storeConversation(userId, guildId, userMessage, aiResponse, metadata = {}) {
    try {
      const db = await mongoClient.connect();
      const collection = db.collection(this.conversationCollectionName);
      
      const conversation = {
        userId,
        guildId,
        userMessage,
        aiResponse,
        metadata: {
          sentiment: metadata.sentiment || "neutral",
          topics: metadata.topics || [],
          entities: metadata.entities || [],
        },
        timestamp: new Date(),
      };
      
      await collection.insertOne(conversation);
      
      // Update user statistics
      await this.incrementInteractionCount(userId);
      
      return true;
    } catch (error) {
      logger.error("MEMORY_SERVICE", `Error storing conversation: ${error.message}`);
      return false;
    }
  }

  /**
   * Get recent conversation history
   */
  async getRecentConversations(userId, limit = 10) {
    try {
      const db = await mongoClient.connect();
      const collection = db.collection(this.conversationCollectionName);
      
      const conversations = await collection
        .find({ userId })
        .sort({ timestamp: -1 })
        .limit(limit)
        .toArray();
      
      return conversations.reverse(); // Return in chronological order
    } catch (error) {
      logger.error("MEMORY_SERVICE", `Error getting conversations: ${error.message}`);
      return [];
    }
  }

  /**
   * Increment user interaction count
   */
  async incrementInteractionCount(userId) {
    try {
      const db = await mongoClient.connect();
      const collection = db.collection(this.collectionName);
      
      await collection.updateOne(
        { userId },
        {
          $inc: { "statistics.total_interactions": 1 },
          $set: { 
            "statistics.last_interaction": new Date(),
            updated_at: new Date(),
          },
        },
        { upsert: true }
      );
      
      return true;
    } catch (error) {
      logger.error("MEMORY_SERVICE", `Error incrementing interaction count: ${error.message}`);
      return false;
    }
  }

  /**
   * Get context-aware system prompt
   */
  async getContextualPrompt(userId, basePrompt) {
    try {
      const memory = await this.getUserMemory(userId);
      
      if (!memory) {
        return basePrompt;
      }
      
      let contextualPrompt = basePrompt + "\n\n=== User Context ===\n";
      
      // Add personal information
      if (memory.personal_info.name) {
        contextualPrompt += `User's name: ${memory.personal_info.name}\n`;
      }
      
      if (memory.personal_info.hobbies && memory.personal_info.hobbies.length > 0) {
        contextualPrompt += `Hobbies: ${memory.personal_info.hobbies.join(", ")}\n`;
      }
      
      // Add preferences
      contextualPrompt += `Preferred tone: ${memory.preferences.tone}\n`;
      
      if (memory.preferences.topics_of_interest.length > 0) {
        contextualPrompt += `Topics of interest: ${memory.preferences.topics_of_interest.join(", ")}\n`;
      }
      
      // Add important facts
      if (memory.facts && memory.facts.length > 0) {
        contextualPrompt += "\nImportant facts about user:\n";
        memory.facts.slice(-5).forEach(fact => {
          contextualPrompt += `- ${fact.content}\n`;
        });
      }
      
      // Add recent conversation context
      const recentConversations = await this.getRecentConversations(userId, 3);
      if (recentConversations.length > 0) {
        contextualPrompt += "\nRecent conversation context:\n";
        recentConversations.forEach(conv => {
          if (conv.metadata.topics && conv.metadata.topics.length > 0) {
            contextualPrompt += `- Topics discussed: ${conv.metadata.topics.join(", ")}\n`;
          }
        });
      }
      
      contextualPrompt += "==================\n\n";
      contextualPrompt += "Use this context to provide more personalized and relevant responses.";
      
      return contextualPrompt;
    } catch (error) {
      logger.error("MEMORY_SERVICE", `Error building contextual prompt: ${error.message}`);
      return basePrompt;
    }
  }

  /**
   * Extract and store facts from conversation
   */
  async extractAndStoreFacts(userId, message, aiResponse) {
    try {
      // Simple pattern matching for common personal info
      const patterns = {
        name: /my name is (\w+)|call me (\w+)|i'm (\w+)|tôi tên là (\w+)|gọi tôi là (\w+)/i,
        hobby: /i (like|love|enjoy) ([\w\s]+)|tôi thích ([\w\s]+)/i,
        location: /i live in ([\w\s]+)|i'm from ([\w\s]+)|tôi ở ([\w\s]+)|tôi đến từ ([\w\s]+)/i,
      };
      
      const updates = {};
      
      // Extract name
      const nameMatch = message.match(patterns.name);
      if (nameMatch) {
        const name = nameMatch[1] || nameMatch[2] || nameMatch[3] || nameMatch[4] || nameMatch[5];
        updates["personal_info.name"] = name;
        await this.addFact(userId, `User's name is ${name}`, "personal");
      }
      
      // Extract location
      const locationMatch = message.match(patterns.location);
      if (locationMatch) {
        const location = locationMatch[1] || locationMatch[2] || locationMatch[3] || locationMatch[4];
        updates["personal_info.location"] = location;
        await this.addFact(userId, `User lives in ${location}`, "location");
      }
      
      // Update if we found anything
      if (Object.keys(updates).length > 0) {
        await this.updateUserMemory(userId, updates);
      }
      
      return true;
    } catch (error) {
      logger.error("MEMORY_SERVICE", `Error extracting facts: ${error.message}`);
      return false;
    }
  }

  /**
   * Search user's conversation history
   */
  async searchConversations(userId, query, limit = 5) {
    try {
      const db = await mongoClient.connect();
      const collection = db.collection(this.conversationCollectionName);
      
      const conversations = await collection
        .find({
          userId,
          $or: [
            { userMessage: { $regex: query, $options: "i" } },
            { aiResponse: { $regex: query, $options: "i" } },
          ],
        })
        .sort({ timestamp: -1 })
        .limit(limit)
        .toArray();
      
      return conversations;
    } catch (error) {
      logger.error("MEMORY_SERVICE", `Error searching conversations: ${error.message}`);
      return [];
    }
  }

  /**
   * Get memory statistics
   */
  async getMemoryStats(userId) {
    try {
      const memory = await this.getUserMemory(userId);
      const db = await mongoClient.connect();
      const conversationCollection = db.collection(this.conversationCollectionName);
      
      const totalConversations = await conversationCollection.countDocuments({ userId });
      
      return {
        total_interactions: memory?.statistics?.total_interactions || 0,
        total_conversations: totalConversations,
        facts_learned: memory?.facts?.length || 0,
        first_interaction: memory?.statistics?.first_interaction,
        last_interaction: memory?.statistics?.last_interaction,
      };
    } catch (error) {
      logger.error("MEMORY_SERVICE", `Error getting memory stats: ${error.message}`);
      return null;
    }
  }
}

module.exports = new MemoryService();
