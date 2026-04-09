const mongoClient = require('./mongoClient');
const logger = require('../../utils/logger');
const Validators = require('../../utils/validators');
const {
  MAX_CONVERSATION_LENGTH,
  MAX_CONVERSATION_AGE_MS,
  COLLECTIONS
} = require('../../config/constants');

class ConversationDB {
  constructor() {
    this.maxConversationLength = MAX_CONVERSATION_LENGTH;
    this.maxConversationAge = MAX_CONVERSATION_AGE_MS;
  }

  escapeRegex(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  buildLegacyUserRegex(userId) {
    if (!/^\d{17,20}$/.test(String(userId))) {
      return null;
    }

    const escapedUserId = this.escapeRegex(userId);
    return new RegExp(`^(?:DM-|\\d{17,20}-)${escapedUserId}$`);
  }

  async migrateLegacyConversationIfNeeded(db, userId) {
    try {
      const legacyUserRegex = this.buildLegacyUserRegex(userId);
      if (!legacyUserRegex) {
        return false;
      }

      const legacyMessages = await db.collection(COLLECTIONS.CONVERSATIONS)
        .find({ userId: { $regex: legacyUserRegex } })
        .sort({ timestamp: 1, messageIndex: 1 })
        .toArray();

      if (!legacyMessages.length) {
        return false;
      }

      let nextMessageIndex = 0;
      let hasSystemMessage = false;

      const normalizedMessages = legacyMessages
        .filter((msg) => typeof msg?.content === 'string' && msg.content.trim().length > 0)
        .filter((msg) => {
          if (msg.role !== 'system') return true;
          if (hasSystemMessage) return false;
          hasSystemMessage = true;
          return true;
        })
        .map((msg) => ({
          userId,
          messageIndex: nextMessageIndex++,
          role: msg.role || 'user',
          content: msg.content,
          timestamp: msg.timestamp || Date.now(),
        }));

      if (!normalizedMessages.length) {
        return false;
      }

      await db.collection(COLLECTIONS.CONVERSATIONS).insertMany(normalizedMessages, { ordered: true });

      const legacyUserIds = [...new Set(legacyMessages.map((msg) => msg.userId).filter(Boolean))];
      if (legacyUserIds.length > 0) {
        await db.collection(COLLECTIONS.CONVERSATIONS).deleteMany({ userId: { $in: legacyUserIds } });
      }

      const legacyMetaRows = await db.collection(COLLECTIONS.CONVERSATION_META)
        .find({ userId: { $regex: legacyUserRegex } })
        .project({ _id: 0, userId: 1, lastUpdated: 1 })
        .toArray();

      const latestLegacyUpdate = legacyMetaRows.reduce((max, row) => {
        const currentValue = Number(row?.lastUpdated || 0);
        return Math.max(max, currentValue);
      }, 0);

      await db.collection(COLLECTIONS.CONVERSATION_META).updateOne(
        { userId },
        { $set: { lastUpdated: latestLegacyUpdate || Date.now() } },
        { upsert: true }
      );

      const legacyMetaUserIds = [...new Set(legacyMetaRows.map((row) => row.userId).filter(Boolean))];
      if (legacyMetaUserIds.length > 0) {
        await db.collection(COLLECTIONS.CONVERSATION_META).deleteMany({ userId: { $in: legacyMetaUserIds } });
      }

      logger.info('DATABASE', `Migrated legacy conversation history to global userId: ${userId}`);
      return true;
    } catch (error) {
      logger.warn('DATABASE', `Could not migrate legacy conversation history for ${userId}:`, error);
      return false;
    }
  }

  async getNextMessageIndex(db, userId) {
    const lastMessage = await db.collection(COLLECTIONS.CONVERSATIONS)
      .find({ userId }, { projection: { messageIndex: 1 } })
      .sort({ messageIndex: -1 })
      .limit(1)
      .toArray();

    return lastMessage.length > 0 ? Number(lastMessage[0].messageIndex) + 1 : 0;
  }

  async getConversationHistory(userId, systemPrompt, modelName) {
    try {
      Validators.validateUserIdOrThrow(userId, 'getConversationHistory');
      const validUserId = Validators.normalizeUserId(userId);

      const db = mongoClient.getDb();
      let count = await db.collection(COLLECTIONS.CONVERSATIONS).countDocuments({ userId: validUserId });

      if (count === 0) {
        const migrated = await this.migrateLegacyConversationIfNeeded(db, validUserId);
        if (migrated) {
          count = await db.collection(COLLECTIONS.CONVERSATIONS).countDocuments({ userId: validUserId });
        }
      }

      if (count === 0) {
        const systemMessage = {
          role: 'system',
          content: systemPrompt + ` You are running on ${modelName} model.`
        };
        await this.addMessageToConversation(validUserId, systemMessage.role, systemMessage.content);
        logger.debug('DATABASE', `New conversation created for user: ${validUserId}`);
        return [systemMessage];
      }

      await db.collection(COLLECTIONS.CONVERSATION_META).updateOne(
        { userId: validUserId },
        { $set: { lastUpdated: Date.now() } },
        { upsert: true }
      );

      const messages = await db.collection(COLLECTIONS.CONVERSATIONS)
        .find({ userId: validUserId })
        .sort({ messageIndex: 1 })
        .project({ _id: 0, role: 1, content: 1 })
        .toArray();

      logger.debug('DATABASE', `Retrieved ${messages.length} messages for userId: ${validUserId}`);

      if (messages.length === 0) {
        logger.warn('DATABASE', `Inconsistency detected: ${count} messages found but 0 retrieved for userId: ${validUserId}`);
        const systemMessage = {
          role: 'system',
          content: systemPrompt + ` You are running on ${modelName} model.`
        };
        await this.addMessageToConversation(validUserId, systemMessage.role, systemMessage.content);
        return [systemMessage];
      }

      return messages;
    } catch (error) {
      logger.error('DATABASE', 'Error getting conversation history:', error);
      return [{
        role: 'system',
        content: systemPrompt + ` You are running on ${modelName} model.`
      }];
    }
  }

  async addMessageToConversation(userId, role, content) {
    try {
      Validators.validateUserIdOrThrow(userId, 'addMessageToConversation');
      const validUserId = Validators.normalizeUserId(userId);

      if (!role) {
        logger.error('DATABASE', 'Cannot add message with empty role');
        return false;
      }

      if (!content) {
        logger.warn('DATABASE', `Adding message with empty content for userId: ${validUserId}`);
      }

      const db = mongoClient.getDb();

      await db.collection(COLLECTIONS.CONVERSATION_META).updateOne(
        { userId: validUserId },
        { $set: { lastUpdated: Date.now() } },
        { upsert: true }
      );

      for (let attempt = 0; attempt < 3; attempt++) {
        const messageIndex = await this.getNextMessageIndex(db, validUserId);

        try {
          await db.collection(COLLECTIONS.CONVERSATIONS).insertOne({
            userId: validUserId,
            messageIndex,
            role,
            content,
            timestamp: Date.now()
          });

          logger.debug('DATABASE', `Added message (${role}) for userId: ${validUserId}, messageIndex: ${messageIndex}`);
          await this.pruneOldMessages(validUserId);
          return true;
        } catch (insertError) {
          if (insertError.code === 11000) {
            logger.warn('DATABASE', `Duplicate key detected for userId ${validUserId}, retrying with a fresh messageIndex...`);
            continue;
          }

          logger.error('DATABASE', `Error adding message for userId: ${validUserId}`, insertError);
          return false;
        }
      }

      logger.error('DATABASE', `Failed to add message for userId ${validUserId} after multiple retries`);
      return false;
    } catch (error) {
      logger.error('DATABASE', 'Error adding message to MongoDB:', error);
      return false;
    }
  }

  async pruneOldMessages(userId) {
    try {
      const db = mongoClient.getDb();
      const count = await db.collection(COLLECTIONS.CONVERSATIONS).countDocuments({ userId });

      if (count > this.maxConversationLength) {
        const excessCount = count - this.maxConversationLength;

        const oldestMsgs = await db.collection(COLLECTIONS.CONVERSATIONS)
          .find({ userId }, { projection: { messageIndex: 1, role: 1 } })
          .sort({ messageIndex: 1 })
          .limit(excessCount + 1)
          .toArray();

        let startIndex = 0;
        if (oldestMsgs.length > 0 && oldestMsgs[0].role === 'system') {
          startIndex = 1;
        }

        const messageIndexesToDelete = oldestMsgs
          .slice(startIndex, startIndex + excessCount)
          .map(msg => msg.messageIndex);

        if (messageIndexesToDelete.length > 0) {
          await db.collection(COLLECTIONS.CONVERSATIONS).deleteMany({
            userId,
            messageIndex: { $in: messageIndexesToDelete }
          });

          logger.debug('DATABASE', `Pruned ${messageIndexesToDelete.length} old messages for userId: ${userId}`);
        }
      }
    } catch (error) {
      logger.error('DATABASE', `Error pruning conversation for userId: ${userId}`, error);
    }
  }

  async clearConversationHistory(userId, systemPrompt, modelName) {
    try {
      Validators.validateUserIdOrThrow(userId, 'clearConversationHistory');
      const validUserId = Validators.normalizeUserId(userId);

      const db = mongoClient.getDb();

      await db.collection(COLLECTIONS.CONVERSATIONS).deleteMany({ userId: validUserId });
      logger.info('DATABASE', `Cleared conversation history for userId: ${validUserId}`);

      const systemMessage = {
        role: 'system',
        content: systemPrompt + ` You are running on ${modelName} model.`
      };

      const success = await this.addMessageToConversation(validUserId, systemMessage.role, systemMessage.content);

      if (success) {
        await db.collection(COLLECTIONS.CONVERSATION_META).updateOne(
          { userId: validUserId },
          { $set: { lastUpdated: Date.now() } },
          { upsert: true }
        );
        logger.debug('DATABASE', `Conversation reinitialized for user: ${validUserId}`);
        return true;
      } else {
        logger.error('DATABASE', `Failed to add system prompt after clearing for userId: ${validUserId}`);
        return false;
      }
    } catch (error) {
      logger.error('DATABASE', `Error clearing conversation history: ${error.message}`, error);
      return false;
    }
  }

  async cleanupOldConversations() {
    try {
      const db = mongoClient.getDb();
      const now = Date.now();
      const cutoffTime = now - this.maxConversationAge;

      logger.debug('DATABASE', `Finding conversations older than ${Math.round(this.maxConversationAge / (1000 * 60 * 60))} hours...`);

      const oldUsers = await db.collection(COLLECTIONS.CONVERSATION_META)
        .find({ lastUpdated: { $lt: cutoffTime } })
        .project({ userId: 1, _id: 0, lastUpdated: 1 })
        .toArray();

      if (oldUsers.length > 0) {
        const userIds = oldUsers.map(user => user.userId);
        logger.info('DATABASE', `Found ${oldUsers.length} old conversations to cleanup`);

        oldUsers.forEach(user => {
          const inactiveDuration = Math.round((now - user.lastUpdated) / (1000 * 60 * 60));
          logger.debug('DATABASE', `Conversation for userId: ${user.userId} inactive for ${inactiveDuration} hours`);
        });

        const deleteResult = await db.collection(COLLECTIONS.CONVERSATIONS).deleteMany({ userId: { $in: userIds } });
        const metaDeleteResult = await db.collection(COLLECTIONS.CONVERSATION_META).deleteMany({ userId: { $in: userIds } });

        logger.info('DATABASE', `Cleaned up ${oldUsers.length} old conversations (deleted ${deleteResult.deletedCount} messages, ${metaDeleteResult.deletedCount} metadata records)`);
        return oldUsers.length;
      } else {
        logger.debug('DATABASE', 'No old conversations to cleanup');
        return 0;
      }
    } catch (error) {
      logger.error('DATABASE', `Error cleaning up old conversations: ${error.message}`, error);
      return 0;
    }
  }

  setMaxConversationLength(value) {
    this.maxConversationLength = value;
  }

  setMaxConversationAge(value) {
    this.maxConversationAge = value;
  }
}

module.exports = new ConversationDB();
