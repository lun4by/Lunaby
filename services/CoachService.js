const mongoClient = require("./mongoClient.js");
const logger = require("../utils/logger.js");
const axios = require("axios");

/**
 * Personal AI Coach Service
 * Track goals, habits, and provide motivation
 */
class CoachService {
  constructor() {
    this.collectionName = "user_goals";
    this.habitsCollectionName = "user_habits";
    this.lunabyBaseURL = process.env.LUNABY_BASE_URL || "https://api.lunie.dev/v1";
    this.lunabyApiKey = process.env.LUNABY_API_KEY;
  }

  /**
   * Create a new goal for user
   */
  async createGoal(userId, goalData) {
    try {
      const db = await mongoClient.connect();
      const collection = db.collection(this.collectionName);
      
      const goal = {
        userId,
        title: goalData.title,
        description: goalData.description || "",
        category: goalData.category || "general",
        targetDate: goalData.targetDate ? new Date(goalData.targetDate) : null,
        milestones: goalData.milestones || [],
        progress: 0,
        status: "active",
        createdAt: new Date(),
        updatedAt: new Date(),
        checkIns: [],
      };
      
      const result = await collection.insertOne(goal);
      goal._id = result.insertedId;
      
      logger.info("COACH", `Created goal for user ${userId}: ${goal.title}`);
      
      return {
        success: true,
        goal,
      };
    } catch (error) {
      logger.error("COACH", `Error creating goal: ${error.message}`);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Update goal progress
   */
  async updateGoalProgress(goalId, progress, note = null) {
    try {
      const db = await mongoClient.connect();
      const collection = db.collection(this.collectionName);
      const { ObjectId } = require("mongodb");
      
      const checkIn = {
        progress,
        note,
        timestamp: new Date(),
      };
      
      const result = await collection.updateOne(
        { _id: new ObjectId(goalId) },
        {
          $set: {
            progress,
            updatedAt: new Date(),
          },
          $push: {
            checkIns: checkIn,
          },
        }
      );
      
      if (result.modifiedCount > 0) {
        logger.info("COACH", `Updated goal progress: ${goalId} -> ${progress}%`);
        
        // Check if goal is completed
        if (progress >= 100) {
          await this.completeGoal(goalId);
        }
        
        return {
          success: true,
          progress,
        };
      }
      
      return {
        success: false,
        error: "Goal not found",
      };
    } catch (error) {
      logger.error("COACH", `Error updating goal progress: ${error.message}`);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Complete a goal
   */
  async completeGoal(goalId) {
    try {
      const db = await mongoClient.connect();
      const collection = db.collection(this.collectionName);
      const { ObjectId } = require("mongodb");
      
      await collection.updateOne(
        { _id: new ObjectId(goalId) },
        {
          $set: {
            status: "completed",
            completedAt: new Date(),
            progress: 100,
          },
        }
      );
      
      logger.info("COACH", `Goal completed: ${goalId}`);
      return true;
    } catch (error) {
      logger.error("COACH", `Error completing goal: ${error.message}`);
      return false;
    }
  }

  /**
   * Get user's goals
   */
  async getUserGoals(userId, status = "active") {
    try {
      const db = await mongoClient.connect();
      const collection = db.collection(this.collectionName);
      
      const query = { userId };
      if (status) {
        query.status = status;
      }
      
      const goals = await collection
        .find(query)
        .sort({ createdAt: -1 })
        .toArray();
      
      return goals;
    } catch (error) {
      logger.error("COACH", `Error getting user goals: ${error.message}`);
      return [];
    }
  }

  /**
   * Create a habit tracker
   */
  async createHabit(userId, habitData) {
    try {
      const db = await mongoClient.connect();
      const collection = db.collection(this.habitsCollectionName);
      
      const habit = {
        userId,
        name: habitData.name,
        description: habitData.description || "",
        frequency: habitData.frequency || "daily", // daily, weekly, custom
        targetDays: habitData.targetDays || [],
        streak: 0,
        longestStreak: 0,
        totalCompletions: 0,
        createdAt: new Date(),
        lastCompleted: null,
        completions: [],
        active: true,
      };
      
      const result = await collection.insertOne(habit);
      habit._id = result.insertedId;
      
      logger.info("COACH", `Created habit for user ${userId}: ${habit.name}`);
      
      return {
        success: true,
        habit,
      };
    } catch (error) {
      logger.error("COACH", `Error creating habit: ${error.message}`);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Log habit completion
   */
  async logHabitCompletion(habitId, date = new Date()) {
    try {
      const db = await mongoClient.connect();
      const collection = db.collection(this.habitsCollectionName);
      const { ObjectId } = require("mongodb");
      
      const habit = await collection.findOne({ _id: new ObjectId(habitId) });
      
      if (!habit) {
        return {
          success: false,
          error: "Habit not found",
        };
      }
      
      // Check if already logged today
      const today = new Date(date);
      today.setHours(0, 0, 0, 0);
      
      const alreadyLogged = habit.completions.some(c => {
        const compDate = new Date(c);
        compDate.setHours(0, 0, 0, 0);
        return compDate.getTime() === today.getTime();
      });
      
      if (alreadyLogged) {
        return {
          success: false,
          error: "Already logged for today",
        };
      }
      
      // Calculate new streak
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      
      let newStreak = 1;
      if (habit.lastCompleted) {
        const lastDate = new Date(habit.lastCompleted);
        lastDate.setHours(0, 0, 0, 0);
        
        if (lastDate.getTime() === yesterday.getTime()) {
          newStreak = habit.streak + 1;
        }
      }
      
      const longestStreak = Math.max(habit.longestStreak, newStreak);
      
      await collection.updateOne(
        { _id: new ObjectId(habitId) },
        {
          $push: {
            completions: date,
          },
          $set: {
            streak: newStreak,
            longestStreak,
            lastCompleted: date,
          },
          $inc: {
            totalCompletions: 1,
          },
        }
      );
      
      logger.info("COACH", `Habit completion logged: ${habitId}`);
      
      return {
        success: true,
        streak: newStreak,
        longestStreak,
      };
    } catch (error) {
      logger.error("COACH", `Error logging habit: ${error.message}`);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Get user's habits
   */
  async getUserHabits(userId) {
    try {
      const db = await mongoClient.connect();
      const collection = db.collection(this.habitsCollectionName);
      
      const habits = await collection
        .find({ userId, active: true })
        .sort({ createdAt: -1 })
        .toArray();
      
      return habits;
    } catch (error) {
      logger.error("COACH", `Error getting user habits: ${error.message}`);
      return [];
    }
  }

  /**
   * Generate motivational message
   */
  async generateMotivation(userId, context = "") {
    try {
      const goals = await this.getUserGoals(userId, "active");
      const habits = await this.getUserHabits(userId);
      
      let prompt = "Generate a motivational message for a user";
      
      if (goals.length > 0) {
        prompt += ` who is working on ${goals.length} goal(s)`;
        const recentGoal = goals[0];
        prompt += `: "${recentGoal.title}" (${recentGoal.progress}% complete)`;
      }
      
      if (habits.length > 0) {
        const activeStreaks = habits.filter(h => h.streak > 0);
        if (activeStreaks.length > 0) {
          prompt += `. They have ${activeStreaks.length} active habit streak(s)`;
        }
      }
      
      if (context) {
        prompt += `. Context: ${context}`;
      }
      
      prompt += ". Keep it short, positive, and actionable.";
      
      const response = await axios.post(
        `${this.lunabyBaseURL}/chat/completions`,
        {
          model: "lunaby-pro",
          messages: [
            {
              role: "system",
              content: "You are a supportive personal coach. Generate uplifting, motivational messages.",
            },
            {
              role: "user",
              content: prompt,
            },
          ],
          max_tokens: 150,
          temperature: 0.8,
        },
        {
          headers: {
            "Authorization": `Bearer ${this.lunabyApiKey}`,
            "Content-Type": "application/json",
          },
          timeout: 15000,
        }
      );
      
      return response.data.choices[0].message.content.trim();
    } catch (error) {
      logger.error("COACH", `Error generating motivation: ${error.message}`);
      return "Keep pushing forward! You've got this! 💪";
    }
  }

  /**
   * Get progress summary
   */
  async getProgressSummary(userId) {
    try {
      const goals = await this.getUserGoals(userId);
      const habits = await this.getUserHabits(userId);
      
      const activeGoals = goals.filter(g => g.status === "active");
      const completedGoals = goals.filter(g => g.status === "completed");
      
      const avgProgress = activeGoals.length > 0
        ? activeGoals.reduce((sum, g) => sum + g.progress, 0) / activeGoals.length
        : 0;
      
      const totalStreak = habits.reduce((sum, h) => sum + h.streak, 0);
      const longestStreak = Math.max(...habits.map(h => h.longestStreak), 0);
      
      return {
        goals: {
          total: goals.length,
          active: activeGoals.length,
          completed: completedGoals.length,
          avgProgress: Math.round(avgProgress),
        },
        habits: {
          total: habits.length,
          totalStreak,
          longestStreak,
        },
      };
    } catch (error) {
      logger.error("COACH", `Error getting progress summary: ${error.message}`);
      return null;
    }
  }

  /**
   * Format progress summary for Discord
   */
  formatProgressSummary(summary) {
    if (!summary) return "No progress data available.";
    
    let output = `📊 **Your Progress Summary**\n\n`;
    
    output += `**Goals**\n`;
    output += `Active: ${summary.goals.active}\n`;
    output += `Completed: ${summary.goals.completed}\n`;
    output += `Average Progress: ${summary.goals.avgProgress}%\n\n`;
    
    output += `**Habits**\n`;
    output += `Tracked: ${summary.habits.total}\n`;
    output += `Combined Streak: ${summary.habits.totalStreak} days\n`;
    output += `Longest Streak: ${summary.habits.longestStreak} days\n`;
    
    return output;
  }
}

module.exports = new CoachService();
