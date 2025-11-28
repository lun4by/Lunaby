const mongoClient = require('../mongoClient');
const logger = require('../../utils/logger');
const ConversationDB = require('./ConversationDB');
const UserProfileDB = require('./UserProfileDB');
const ImageBlacklistDB = require('./ImageBlacklistDB');
const MemoryService = require('../MemoryService');
const QuotaService = require('../QuotaService');
const { COLLECTIONS } = require('../../config/constants');

class DatabaseManager {
  async initDatabase() {
    try {
      await mongoClient.connect();
      logger.info('DATABASE', 'MongoDB connection established successfully');

      try {
        await this.initializeCollections();
        await this.initializeConversationHistory();
        await this.initializeProfiles();
        await ImageBlacklistDB.initializeDefaultBlacklist();
      } catch (setupError) {
        logger.error('DATABASE', 'Error setting up database:', setupError);
        logger.info('DATABASE', 'Attempting to reset entire database...');
        
        const resetSuccess = await this.resetDatabase();
        if (!resetSuccess) {
          throw new Error('Failed to recover by resetting database');
        }
      }
    } catch (error) {
      logger.error('DATABASE', 'Error initializing MongoDB connection:', error);
      throw error;
    }
  }

  async initializeCollections() {
    try {
      const db = mongoClient.getDb();

      try {
        const indexes = await db.collection(COLLECTIONS.CONVERSATIONS).listIndexes().toArray();
        const hasConversationIdIndex = indexes.some(index => index.name === 'conversationId_1');
        const hasUserIdMessageIndexIndex = indexes.some(index => index.name === 'userId_1_messageIndex_1');

        if (hasConversationIdIndex) {
          logger.info('DATABASE', 'Detected unnecessary conversationId_1 index...');
          try {
            await db.collection(COLLECTIONS.CONVERSATIONS).dropIndex('conversationId_1');
            logger.info('DATABASE', 'Dropped conversationId_1 index');
          } catch (dropIndexError) {
            logger.error('DATABASE', 'Failed to drop conversationId_1 index:', dropIndexError.message);
          }
        }

        if (hasUserIdMessageIndexIndex) {
          try {
            await db.collection(COLLECTIONS.CONVERSATIONS).dropIndex('userId_1_messageIndex_1');
          } catch (dropIndexError) {
            logger.error('DATABASE', 'Failed to drop userId_1_messageIndex_1 index:', dropIndexError.message);
          }
        }

        const deleteResult = await db.collection(COLLECTIONS.CONVERSATIONS).deleteMany({
          $or: [
            { userId: null },
            { messageIndex: null },
            { userId: { $exists: false } },
            { messageIndex: { $exists: false } }
          ]
        });

        if (deleteResult.deletedCount > 0) {
          logger.info('DATABASE', `Deleted ${deleteResult.deletedCount} invalid records (userId or messageIndex is null)`);
        }

      } catch (indexError) {
        logger.info('DATABASE', 'Attempting to drop and recreate conversations collection...');
        try {
          await db.collection(COLLECTIONS.CONVERSATIONS).drop();
          logger.info('DATABASE', 'Dropped conversations collection for recreation');
        } catch (dropError) {
          logger.info('DATABASE', 'Conversations collection does not exist or cannot be dropped');
        }
      }

      try {
        const collections = await db.listCollections({ name: COLLECTIONS.CONVERSATIONS }).toArray();
        if (collections.length === 0) {
          await db.createCollection(COLLECTIONS.CONVERSATIONS);
          logger.info('DATABASE', 'Created new conversations collection');
        }
      } catch (createError) {
        logger.error('DATABASE', 'Error creating conversations collection:', createError);
      }

      try {
        await db.collection(COLLECTIONS.CONVERSATIONS).createIndex({ userId: 1, messageIndex: 1 }, { unique: true });
      } catch (indexError) {
        logger.error('DATABASE', 'Error creating userId_1_messageIndex_1 index:', indexError);
        await this.resetConversationsCollection();
      }

      await db.collection(COLLECTIONS.CONVERSATION_META).createIndex({ userId: 1 }, { unique: true });

      try {
        await db.createCollection(COLLECTIONS.MOD_SETTINGS);
        await db.createCollection(COLLECTIONS.IMAGE_BLACKLIST);
        logger.info('DATABASE', 'Created moderation system collections');
      } catch (error) {
        logger.info('DATABASE', 'Moderation system collections already exist or cannot be created');
      }

      try {
        await db.collection(COLLECTIONS.MOD_SETTINGS).createIndex({ guildId: 1 }, { unique: true });
        await db.collection(COLLECTIONS.IMAGE_BLACKLIST).createIndex({ category: 1 });
        await db.collection(COLLECTIONS.IMAGE_BLACKLIST).createIndex({ keyword: 1 });
        logger.info('DATABASE', 'Created moderation system indexes');
      } catch (error) {
        logger.error('DATABASE', 'Error creating moderation system indexes:', error);
      }

      try {
        await QuotaService.initializeCollection();
        logger.info('DATABASE', 'Initialized quota system');
      } catch (error) {
        logger.error('DATABASE', 'Error initializing quota system:', error);
      }

      logger.info('DATABASE', 'Set up MongoDB collections and indexes');
    } catch (error) {
      logger.error('DATABASE', 'Error setting up MongoDB collections:', error);
      throw error;
    }
  }

  async resetConversationsCollection() {
    try {
      const db = mongoClient.getDb();

      try {
        const collections = await db.listCollections({ name: COLLECTIONS.CONVERSATIONS }).toArray();
        if (collections.length > 0) {
          await db.collection(COLLECTIONS.CONVERSATIONS).drop();
          logger.info('DATABASE', 'Dropped conversations collection for recreation');
        }
      } catch (dropError) {
        logger.info('DATABASE', 'Conversations collection does not exist or cannot be dropped');
      }

      try {
        await db.createCollection(COLLECTIONS.CONVERSATIONS);
        logger.info('DATABASE', 'Created new conversations collection');
      } catch (createError) {
        logger.info('DATABASE', 'Conversations collection already exists or cannot be created');
      }

      try {
        await db.collection(COLLECTIONS.CONVERSATIONS).createIndex({ timestamp: 1 });
        logger.info('DATABASE', 'Created timestamp_1 index');

        await db.collection(COLLECTIONS.CONVERSATIONS).createIndex({ userId: 1, messageIndex: 1 }, { unique: true });
        logger.info('DATABASE', 'Created userId_1_messageIndex_1 index');
      } catch (indexError) {
        logger.error('DATABASE', 'Error creating indexes for conversations collection:', indexError);
        return false;
      }

      logger.info('DATABASE', 'Recreated conversations collection with correct indexes');
      return true;
    } catch (error) {
      logger.error('DATABASE', 'Error resetting conversations collection:', error);
      return false;
    }
  }

  async initializeConversationHistory() {
    try {
      const db = mongoClient.getDb();

      try {
        const indexes = await db.collection(COLLECTIONS.CONVERSATIONS).listIndexes().toArray();
        const hasConversationIdIndex = indexes.some(index => index.name === 'conversationId_1');

        if (hasConversationIdIndex) {
          await this.resetConversationsCollection();
        } else {
          const hasTimeIndex = indexes.some(index => index.name === 'timestamp_1');

          if (!hasTimeIndex) {
            await db.collection(COLLECTIONS.CONVERSATIONS).createIndex({ timestamp: 1 });
            logger.info('DATABASE', 'Created timestamp index for conversations collection');
          }
        }
      } catch (indexError) {
        await this.resetConversationsCollection();
      }

      const conversationMeta = await db.collection(COLLECTIONS.CONVERSATION_META).findOne({
        metaVersion: { $exists: true }
      });

      if (!conversationMeta) {
        await db.collection(COLLECTIONS.CONVERSATION_META).insertOne({
          metaVersion: 1,
          lastCleanup: Date.now(),
          config: {
            maxConversationLength: ConversationDB.maxConversationLength,
            maxConversationAge: ConversationDB.maxConversationAge
          }
        });
        logger.info('DATABASE', 'Initialized conversation history configuration');
      } else {
        await db.collection(COLLECTIONS.CONVERSATION_META).updateOne(
          { metaVersion: { $exists: true } },
          {
            $set: {
              'config.maxConversationLength': ConversationDB.maxConversationLength,
              'config.maxConversationAge': ConversationDB.maxConversationAge,
            }
          }
        );
      }

      await ConversationDB.cleanupOldConversations();

      logger.info('DATABASE', 'Conversation history system ready');
    } catch (error) {
      logger.error('DATABASE', 'Error initializing conversation history:', error);
    }
  }

  async initializeProfiles() {
    try {
      const db = mongoClient.getDb();

      const collections = await db.listCollections({ name: COLLECTIONS.USER_PROFILES }).toArray();
      if (collections.length === 0) {
        await db.createCollection(COLLECTIONS.USER_PROFILES);
        logger.info('DATABASE', 'Created user_profiles collection');
      }

      try {
        const indexes = await db.collection(COLLECTIONS.USER_PROFILES).listIndexes().toArray();
        const hasUserIdIndex = indexes.some(index => index.name === 'userId_1');

        if (hasUserIdIndex) {
          await db.collection(COLLECTIONS.USER_PROFILES).dropIndex('userId_1');
          logger.info('DATABASE', 'Dropped old userId_1 index from user_profiles collection');
        }
      } catch (indexError) {
        logger.warn('DATABASE', 'Warning when dropping old index:', indexError.message);
      }

      logger.info('DATABASE', 'User profile system ready');

      try {
        await MemoryService.initializeMemoryCollection();
        logger.info('DATABASE', 'Initialized AI Memory System V2');
      } catch (memoryError) {
        logger.error('DATABASE', 'Error initializing Memory System:', memoryError);
      }
    } catch (error) {
      logger.error('DATABASE', 'Error initializing profile system:', error);
    }
  }

  async resetDatabase() {
    try {
      const db = mongoClient.getDb();

      const collectionsToReset = [
        COLLECTIONS.CONVERSATIONS,
        COLLECTIONS.CONVERSATION_META,
        COLLECTIONS.MOD_SETTINGS,
        COLLECTIONS.IMAGE_BLACKLIST,
        'monitor_settings',
        'monitor_logs'
      ];

      for (const collectionName of collectionsToReset) {
        try {
          const collections = await db.listCollections({ name: collectionName }).toArray();
          if (collections.length > 0) {
            await db.collection(collectionName).drop();
            logger.info('DATABASE', `Dropped collection ${collectionName}`);
          }
        } catch (dropError) {
          logger.info('DATABASE', `Collection ${collectionName} does not exist or cannot be dropped`);
        }
      }

      await this.initializeCollections();
      await this.initializeConversationHistory();
      await this.initializeProfiles();
      await ImageBlacklistDB.initializeDefaultBlacklist();

      logger.info('DATABASE', 'Database successfully reset and recreated');
      return true;
    } catch (error) {
      logger.error('DATABASE', 'Error resetting database:', error);
      return false;
    }
  }
}

module.exports = new DatabaseManager();
