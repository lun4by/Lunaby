const mongoClient = require('./mongoClient');
const logger = require('../../utils/logger');
const Profile = require('./profiledb');
const Validators = require('../../utils/validators');
const { COLLECTIONS } = require('../../config/constants');

class UserProfileDB {
  async getUserProfile(userId) {
    try {
      Validators.validateUserIdOrThrow(userId, 'getUserProfile');

      const db = mongoClient.getDb();
      const profiles = db.collection(COLLECTIONS.USER_PROFILES);

      let profile = await profiles.findOne({ _id: userId });

      if (!profile) {
        profile = Profile.createDefaultProfile(userId);
        await profiles.insertOne(profile);
        logger.info('DATABASE', `Created new profile for user ${userId}`);
      }

      return profile;
    } catch (error) {
      logger.error('DATABASE', 'Error getting user profile:', error);
      throw error;
    }
  }

  async updateUserProfile(userId, updateData) {
    try {
      Validators.validateUserIdOrThrow(userId, 'updateUserProfile');

      const db = mongoClient.getDb();
      const profiles = db.collection(COLLECTIONS.USER_PROFILES);

      const result = await profiles.updateOne(
        { _id: userId },
        { $set: updateData },
        { upsert: true }
      );

      return result.acknowledged;
    } catch (error) {
      logger.error('DATABASE', 'Error updating user profile:', error);
      return false;
    }
  }

  async updateUserEconomy(userId, resourceType, amount) {
    try {
      Validators.validateUserIdOrThrow(userId, 'updateUserEconomy');

      const db = mongoClient.getDb();
      const profiles = db.collection(COLLECTIONS.USER_PROFILES);

      const fieldPath = `data.economy.${resourceType}`;
      const updateObj = { $inc: {} };
      updateObj.$inc[fieldPath] = amount;

      await profiles.updateOne(
        { _id: userId },
        updateObj,
        { upsert: true }
      );

      const updatedProfile = await profiles.findOne(
        { _id: userId },
        { projection: { 'data.economy': 1, _id: 0 } }
      );

      return updatedProfile?.data?.economy || null;
    } catch (error) {
      logger.error('DATABASE', 'Error updating user economy:', error);
      return null;
    }
  }
}

module.exports = new UserProfileDB();
