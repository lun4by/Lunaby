const mongoClient = require("./mongoClient.js");
const logger = require("../utils/logger.js");
const axios = require("axios");

/**
 * Analytics Service
 * Track and analyze server activity, sentiment, and trends
 */
class AnalyticsService {
  constructor() {
    this.collectionName = "server_analytics";
    this.messageCollectionName = "message_analytics";
    this.lunabyBaseURL = process.env.LUNABY_BASE_URL || "https://api.lunie.dev/v1";
    this.lunabyApiKey = process.env.LUNABY_API_KEY;
  }

  /**
   * Analyze message sentiment using AI
   */
  async analyzeSentiment(text) {
    try {
      const response = await axios.post(
        `${this.lunabyBaseURL}/chat/completions`,
        {
          model: "lunaby-pro",
          messages: [
            {
              role: "system",
              content: "Analyze the sentiment of the message. Respond with only one word: positive, negative, or neutral.",
            },
            {
              role: "user",
              content: text,
            },
          ],
          max_tokens: 10,
          temperature: 0.1,
        },
        {
          headers: {
            "Authorization": `Bearer ${this.lunabyApiKey}`,
            "Content-Type": "application/json",
          },
          timeout: 10000,
        }
      );
      
      const sentiment = response.data.choices[0].message.content.trim().toLowerCase();
      return sentiment;
    } catch (error) {
      logger.error("ANALYTICS", `Sentiment analysis error: ${error.message}`);
      return "neutral";
    }
  }

  /**
   * Extract topics/keywords from text
   */
  async extractTopics(text) {
    try {
      const response = await axios.post(
        `${this.lunabyBaseURL}/chat/completions`,
        {
          model: "lunaby-pro",
          messages: [
            {
              role: "system",
              content: "Extract 3-5 main topics or keywords from this text. Respond with only comma-separated keywords.",
            },
            {
              role: "user",
              content: text,
            },
          ],
          max_tokens: 100,
          temperature: 0.3,
        },
        {
          headers: {
            "Authorization": `Bearer ${this.lunabyApiKey}`,
            "Content-Type": "application/json",
          },
          timeout: 10000,
        }
      );
      
      const topicsStr = response.data.choices[0].message.content.trim();
      const topics = topicsStr.split(",").map(t => t.trim()).filter(t => t.length > 0);
      return topics;
    } catch (error) {
      logger.error("ANALYTICS", `Topic extraction error: ${error.message}`);
      return [];
    }
  }

  /**
   * Track message for analytics
   */
  async trackMessage(guildId, userId, channelId, content, metadata = {}) {
    try {
      const db = await mongoClient.connect();
      const collection = db.collection(this.messageCollectionName);
      
      // Analyze sentiment and topics for meaningful messages
      let sentiment = "neutral";
      let topics = [];
      
      if (content && content.length > 10) {
        sentiment = await this.analyzeSentiment(content);
        topics = await extractTopics(content);
      }
      
      const messageData = {
        guildId,
        userId,
        channelId,
        content: content.substring(0, 500), // Store first 500 chars
        contentLength: content.length,
        sentiment,
        topics,
        hasAttachment: metadata.hasAttachment || false,
        hasEmbed: metadata.hasEmbed || false,
        mentionCount: metadata.mentionCount || 0,
        timestamp: new Date(),
      };
      
      await collection.insertOne(messageData);
      
      // Update server-level statistics
      await this.updateServerStats(guildId, sentiment);
      
      return true;
    } catch (error) {
      logger.error("ANALYTICS", `Error tracking message: ${error.message}`);
      return false;
    }
  }

  /**
   * Update server-level statistics
   */
  async updateServerStats(guildId, sentiment) {
    try {
      const db = await mongoClient.connect();
      const collection = db.collection(this.collectionName);
      
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const update = {
        $inc: {
          "stats.total_messages": 1,
          [`stats.sentiment.${sentiment}`]: 1,
        },
        $set: {
          lastActivity: new Date(),
        },
      };
      
      await collection.updateOne(
        { guildId, date: today },
        update,
        { upsert: true }
      );
      
      return true;
    } catch (error) {
      logger.error("ANALYTICS", `Error updating server stats: ${error.message}`);
      return false;
    }
  }

  /**
   * Get server analytics for a date range
   */
  async getServerAnalytics(guildId, startDate, endDate) {
    try {
      const db = await mongoClient.connect();
      const collection = db.collection(this.collectionName);
      
      const analytics = await collection
        .find({
          guildId,
          date: {
            $gte: startDate,
            $lte: endDate,
          },
        })
        .sort({ date: 1 })
        .toArray();
      
      return analytics;
    } catch (error) {
      logger.error("ANALYTICS", `Error getting analytics: ${error.message}`);
      return [];
    }
  }

  /**
   * Get trending topics for a guild
   */
  async getTrendingTopics(guildId, days = 7) {
    try {
      const db = await mongoClient.connect();
      const collection = db.collection(this.messageCollectionName);
      
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      
      const pipeline = [
        {
          $match: {
            guildId,
            timestamp: { $gte: startDate },
            topics: { $exists: true, $ne: [] },
          },
        },
        { $unwind: "$topics" },
        {
          $group: {
            _id: "$topics",
            count: { $sum: 1 },
          },
        },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ];
      
      const trendingTopics = await collection.aggregate(pipeline).toArray();
      
      return trendingTopics.map(t => ({
        topic: t._id,
        count: t.count,
      }));
    } catch (error) {
      logger.error("ANALYTICS", `Error getting trending topics: ${error.message}`);
      return [];
    }
  }

  /**
   * Get sentiment distribution
   */
  async getSentimentDistribution(guildId, days = 7) {
    try {
      const db = await mongoClient.connect();
      const collection = db.collection(this.messageCollectionName);
      
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      
      const pipeline = [
        {
          $match: {
            guildId,
            timestamp: { $gte: startDate },
          },
        },
        {
          $group: {
            _id: "$sentiment",
            count: { $sum: 1 },
          },
        },
      ];
      
      const sentiments = await collection.aggregate(pipeline).toArray();
      
      const distribution = {
        positive: 0,
        neutral: 0,
        negative: 0,
      };
      
      sentiments.forEach(s => {
        if (s._id in distribution) {
          distribution[s._id] = s.count;
        }
      });
      
      return distribution;
    } catch (error) {
      logger.error("ANALYTICS", `Error getting sentiment distribution: ${error.message}`);
      return null;
    }
  }

  /**
   * Get most active users
   */
  async getMostActiveUsers(guildId, days = 7, limit = 10) {
    try {
      const db = await mongoClient.connect();
      const collection = db.collection(this.messageCollectionName);
      
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      
      const pipeline = [
        {
          $match: {
            guildId,
            timestamp: { $gte: startDate },
          },
        },
        {
          $group: {
            _id: "$userId",
            messageCount: { $sum: 1 },
            avgSentiment: { $avg: { $cond: [{ $eq: ["$sentiment", "positive"] }, 1, 0] } },
          },
        },
        { $sort: { messageCount: -1 } },
        { $limit: limit },
      ];
      
      const activeUsers = await collection.aggregate(pipeline).toArray();
      
      return activeUsers.map(u => ({
        userId: u._id,
        messageCount: u.messageCount,
        positivityScore: Math.round(u.avgSentiment * 100),
      }));
    } catch (error) {
      logger.error("ANALYTICS", `Error getting active users: ${error.message}`);
      return [];
    }
  }

  /**
   * Get channel activity
   */
  async getChannelActivity(guildId, days = 7) {
    try {
      const db = await mongoClient.connect();
      const collection = db.collection(this.messageCollectionName);
      
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      
      const pipeline = [
        {
          $match: {
            guildId,
            timestamp: { $gte: startDate },
          },
        },
        {
          $group: {
            _id: "$channelId",
            messageCount: { $sum: 1 },
          },
        },
        { $sort: { messageCount: -1 } },
      ];
      
      const channelActivity = await collection.aggregate(pipeline).toArray();
      
      return channelActivity.map(c => ({
        channelId: c._id,
        messageCount: c.messageCount,
      }));
    } catch (error) {
      logger.error("ANALYTICS", `Error getting channel activity: ${error.message}`);
      return [];
    }
  }

  /**
   * Generate analytics report
   */
  async generateReport(guildId, days = 7) {
    try {
      logger.info("ANALYTICS", `Generating ${days}-day report for guild ${guildId}`);
      
      const [
        trendingTopics,
        sentimentDist,
        activeUsers,
        channelActivity,
      ] = await Promise.all([
        this.getTrendingTopics(guildId, days),
        this.getSentimentDistribution(guildId, days),
        this.getMostActiveUsers(guildId, days),
        this.getChannelActivity(guildId, days),
      ]);
      
      const totalMessages = Object.values(sentimentDist || {}).reduce((a, b) => a + b, 0);
      
      return {
        guildId,
        period: `${days} days`,
        generatedAt: new Date(),
        summary: {
          totalMessages,
          sentimentDistribution: sentimentDist,
          mostActiveUsers: activeUsers,
          channelActivity: channelActivity,
          trendingTopics: trendingTopics,
        },
      };
    } catch (error) {
      logger.error("ANALYTICS", `Error generating report: ${error.message}`);
      return null;
    }
  }

  /**
   * Format report for Discord
   */
  formatReport(report) {
    if (!report) return "Failed to generate report.";
    
    let output = `📊 **Server Analytics Report**\n`;
    output += `Period: ${report.period}\n\n`;
    
    output += `**Summary**\n`;
    output += `Total Messages: ${report.summary.totalMessages}\n\n`;
    
    if (report.summary.sentimentDistribution) {
      const dist = report.summary.sentimentDistribution;
      output += `**Sentiment Distribution**\n`;
      output += `😊 Positive: ${dist.positive}\n`;
      output += `😐 Neutral: ${dist.neutral}\n`;
      output += `😟 Negative: ${dist.negative}\n\n`;
    }
    
    if (report.summary.trendingTopics && report.summary.trendingTopics.length > 0) {
      output += `**Trending Topics**\n`;
      report.summary.trendingTopics.slice(0, 5).forEach((topic, i) => {
        output += `${i + 1}. ${topic.topic} (${topic.count} mentions)\n`;
      });
      output += `\n`;
    }
    
    if (report.summary.mostActiveUsers && report.summary.mostActiveUsers.length > 0) {
      output += `**Most Active Users**\n`;
      report.summary.mostActiveUsers.slice(0, 5).forEach((user, i) => {
        output += `${i + 1}. <@${user.userId}> - ${user.messageCount} messages\n`;
      });
    }
    
    return output;
  }
}

module.exports = new AnalyticsService();
