const mongoClient = require('./mongoClient');
const logger = require('../../utils/logger');
const ConversationDB = require('./ConversationDB');
const UserProfileDB = require('./UserProfileDB');
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
      } catch (setupError) {
        logger.error('DATABASE', 'Error setting up database:', setupError);
        logger.info('DATABASE', 'Attempting to reset entire database...');

        if (!await this.resetDatabase()) {
          throw new Error('Failed to recover by resetting database');
        }
      }
    } catch (error) {
      logger.error('DATABASE', 'Error initializing MongoDB connection:', error);
      throw error;
    }
  }

  async getIndexNames(collection) {
    try {
      const indexes = await collection.listIndexes().toArray();
      return indexes.map(idx => idx.name);
    } catch {
      return [];
    }
  }

  async safeDropIndex(collection, indexName) {
    try {
      await collection.dropIndex(indexName);
      logger.info('DATABASE', `Dropped ${indexName} index`);
      return true;
    } catch (e) {
      logger.error('DATABASE', `Failed to drop ${indexName} index:`, e.message);
      return false;
    }
  }

  async ensureCollection(db, name) {
    try {
      const exists = (await db.listCollections({ name }).toArray()).length > 0;
      if (!exists) {
        await db.createCollection(name);
        logger.info('DATABASE', `Created ${name} collection`);
      }
      return true;
    } catch (e) {
      logger.error('DATABASE', `Error ensuring ${name} collection:`, e.message);
      return false;
    }
  }

  async initializeCollections() {
    const db = mongoClient.getDb();
    const convCollection = db.collection(COLLECTIONS.CONVERSATIONS);

    const indexNames = await this.getIndexNames(convCollection);

    if (indexNames.includes('conversationId_1')) {
      await this.safeDropIndex(convCollection, 'conversationId_1');
    }
    if (indexNames.includes('userId_1_messageIndex_1')) {
      await this.safeDropIndex(convCollection, 'userId_1_messageIndex_1');
    }

    const deleteResult = await convCollection.deleteMany({
      $or: [
        { userId: null },
        { messageIndex: null },
        { userId: { $exists: false } },
        { messageIndex: { $exists: false } }
      ]
    });
    if (deleteResult.deletedCount > 0) {
      logger.info('DATABASE', `Deleted ${deleteResult.deletedCount} invalid records`);
    }

    await this.ensureCollection(db, COLLECTIONS.CONVERSATIONS);
    await this.ensureCollection(db, COLLECTIONS.MOD_SETTINGS);

    try {
      await convCollection.createIndex({ userId: 1, messageIndex: 1 }, { unique: true });
      await db.collection(COLLECTIONS.CONVERSATION_META).createIndex({ userId: 1 }, { unique: true });
      await db.collection(COLLECTIONS.MOD_SETTINGS).createIndex({ guildId: 1 }, { unique: true });
    } catch (e) {
      logger.error('DATABASE', 'Error creating indexes:', e.message);
      await this.resetConversationsCollection();
    }

    try {
      await QuotaService.initializeCollection();
      logger.info('DATABASE', 'Quota system ready');
    } catch (e) {
      logger.error('DATABASE', 'Error initializing quota system:', e.message);
    }

    logger.info('DATABASE', 'Set up MongoDB collections and indexes');
  }

  async resetConversationsCollection() {
    const db = mongoClient.getDb();

    try {
      await db.collection(COLLECTIONS.CONVERSATIONS).drop();
      logger.info('DATABASE', 'Dropped conversations collection');
    } catch {
      logger.info('DATABASE', 'Conversations collection does not exist');
    }

    await this.ensureCollection(db, COLLECTIONS.CONVERSATIONS);

    try {
      const convCollection = db.collection(COLLECTIONS.CONVERSATIONS);
      await convCollection.createIndex({ timestamp: 1 });
      await convCollection.createIndex({ userId: 1, messageIndex: 1 }, { unique: true });
      logger.info('DATABASE', 'Recreated conversations collection with indexes');
      return true;
    } catch (e) {
      logger.error('DATABASE', 'Error creating conversation indexes:', e.message);
      return false;
    }
  }

  async initializeConversationHistory() {
    const db = mongoClient.getDb();
    const convCollection = db.collection(COLLECTIONS.CONVERSATIONS);
    const indexNames = await this.getIndexNames(convCollection);

    if (indexNames.includes('conversationId_1')) {
      await this.resetConversationsCollection();
    } else if (!indexNames.includes('timestamp_1')) {
      try {
        await convCollection.createIndex({ timestamp: 1 });
        logger.info('DATABASE', 'Created timestamp index');
      } catch (e) {
        await this.resetConversationsCollection();
      }
    }

    const metaCollection = db.collection(COLLECTIONS.CONVERSATION_META);
    const config = {
      maxConversationLength: ConversationDB.maxConversationLength,
      maxConversationAge: ConversationDB.maxConversationAge
    };

    await metaCollection.updateOne(
      { metaVersion: { $exists: true } },
      { $set: { config }, $setOnInsert: { metaVersion: 1, lastCleanup: Date.now() } },
      { upsert: true }
    );

    await ConversationDB.cleanupOldConversations();
    logger.info('DATABASE', 'Conversation history system ready');
  }

  async initializeProfiles() {
    const db = mongoClient.getDb();

    await this.ensureCollection(db, COLLECTIONS.USER_PROFILES);

    const indexNames = await this.getIndexNames(db.collection(COLLECTIONS.USER_PROFILES));
    if (indexNames.includes('userId_1')) {
      await this.safeDropIndex(db.collection(COLLECTIONS.USER_PROFILES), 'userId_1');
    }

    logger.info('DATABASE', 'User profile system ready');

    try {
      await MemoryService.initializeMemoryCollection();
      logger.debug('DATABASE', 'Memory system ready');
    } catch (e) {
      logger.error('DATABASE', 'Error initializing Memory System:', e.message);
    }
  }

  async resetDatabase() {
    const db = mongoClient.getDb();

    const collectionsToReset = [
      COLLECTIONS.CONVERSATIONS,
      COLLECTIONS.CONVERSATION_META,
      COLLECTIONS.MOD_SETTINGS,
      'image_blacklist',
      'monitor_settings',
      'monitor_logs'
    ];

    for (const name of collectionsToReset) {
      try {
        const exists = (await db.listCollections({ name }).toArray()).length > 0;
        if (exists) {
          await db.collection(name).drop();
          logger.info('DATABASE', `Dropped collection ${name}`);
        }
      } catch {
        logger.info('DATABASE', `Collection ${name} cannot be dropped`);
      }
    }

    await this.initializeCollections();
    await this.initializeConversationHistory();
    await this.initializeProfiles();

    logger.info('DATABASE', 'Database successfully reset');
    return true;
  }
}

module.exports = new DatabaseManager();
