const axios = require("axios");
const logger = require("../utils/logger.js");

/**
 * AI Debate Service
 * Facilitate debates between users and AI with multiple perspectives
 */
class DebateService {
  constructor() {
    this.lunabyBaseURL = process.env.LUNABY_BASE_URL || "https://api.lunie.dev/v1";
    this.lunabyApiKey = process.env.LUNABY_API_KEY;
    this.activeDebates = new Map();
  }

  /**
   * Start a new debate
   */
  async startDebate(userId, topic, userPosition) {
    try {
      logger.info("DEBATE", `Starting debate on: ${topic}`);
      
      const debateId = `${userId}-${Date.now()}`;
      
      // AI takes the opposing position
      const aiPosition = userPosition.toLowerCase() === "for" ? "against" : "for";
      
      const debate = {
        id: debateId,
        userId,
        topic,
        userPosition,
        aiPosition,
        rounds: [],
        scores: {
          user: 0,
          ai: 0,
        },
        currentRound: 1,
        maxRounds: 5,
        startedAt: new Date(),
        status: "active",
      };
      
      this.activeDebates.set(debateId, debate);
      
      // Generate AI's opening statement
      const aiOpening = await this.generateArgument(topic, aiPosition, [], debate);
      
      debate.rounds.push({
        round: 1,
        aiArgument: aiOpening,
        timestamp: new Date(),
      });
      
      return {
        success: true,
        debateId,
        topic,
        userPosition,
        aiPosition,
        aiOpening,
      };
    } catch (error) {
      logger.error("DEBATE", `Error starting debate: ${error.message}`);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Submit user's argument
   */
  async submitArgument(debateId, userArgument) {
    try {
      const debate = this.activeDebates.get(debateId);
      
      if (!debate) {
        return {
          success: false,
          error: "Debate not found or has ended",
        };
      }
      
      if (debate.status !== "active") {
        return {
          success: false,
          error: "This debate has ended",
        };
      }
      
      logger.info("DEBATE", `User submitted argument for round ${debate.currentRound}`);
      
      // Add user's argument to current round
      const currentRound = debate.rounds[debate.rounds.length - 1];
      currentRound.userArgument = userArgument;
      
      // Score the argument
      const userScore = await this.scoreArgument(userArgument, debate);
      currentRound.userScore = userScore;
      debate.scores.user += userScore;
      
      // Check if debate should continue
      if (debate.currentRound >= debate.maxRounds) {
        debate.status = "completed";
        const winner = this.determineWinner(debate);
        
        return {
          success: true,
          debateEnded: true,
          finalScores: debate.scores,
          winner,
          summary: await this.generateSummary(debate),
        };
      }
      
      // Generate AI's counter-argument
      debate.currentRound++;
      const aiCounterArgument = await this.generateArgument(
        debate.topic,
        debate.aiPosition,
        debate.rounds,
        debate
      );
      
      const aiScore = await this.scoreArgument(aiCounterArgument, debate);
      
      debate.rounds.push({
        round: debate.currentRound,
        aiArgument: aiCounterArgument,
        aiScore,
        timestamp: new Date(),
      });
      
      debate.scores.ai += aiScore;
      
      return {
        success: true,
        debateEnded: false,
        round: debate.currentRound,
        aiCounterArgument,
        currentScores: debate.scores,
      };
    } catch (error) {
      logger.error("DEBATE", `Error submitting argument: ${error.message}`);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Generate AI argument
   */
  async generateArgument(topic, position, previousRounds, debate) {
    try {
      let context = `You are debating the topic: "${topic}"\n`;
      context += `Your position: ${position}\n\n`;
      
      if (previousRounds.length > 0) {
        context += "Previous arguments:\n";
        previousRounds.forEach(round => {
          if (round.userArgument) {
            context += `\nOpponent: ${round.userArgument}\n`;
          }
          if (round.aiArgument) {
            context += `You: ${round.aiArgument}\n`;
          }
        });
      }
      
      context += `\nProvide a strong, logical argument for your position. Be persuasive but respectful.`;
      
      const response = await axios.post(
        `${this.lunabyBaseURL}/chat/completions`,
        {
          model: "lunaby-reasoning",
          messages: [
            {
              role: "system",
              content: "You are an expert debater. Construct logical, well-reasoned arguments with evidence and examples. Be persuasive but maintain respectful discourse.",
            },
            {
              role: "user",
              content: context,
            },
          ],
          max_tokens: 500,
          temperature: 0.7,
        },
        {
          headers: {
            "Authorization": `Bearer ${this.lunabyApiKey}`,
            "Content-Type": "application/json",
          },
          timeout: 30000,
        }
      );
      
      return response.data.choices[0].message.content.trim();
    } catch (error) {
      logger.error("DEBATE", `Error generating argument: ${error.message}`);
      return "I concede this point.";
    }
  }

  /**
   * Score an argument (0-10)
   */
  async scoreArgument(argument, debate) {
    try {
      const prompt = `Score this debate argument on a scale of 0-10 based on:
- Logic and reasoning (40%)
- Evidence and examples (30%)
- Persuasiveness (20%)
- Clarity (10%)

Topic: ${debate.topic}
Argument: ${argument}

Respond with only a number from 0 to 10.`;
      
      const response = await axios.post(
        `${this.lunabyBaseURL}/chat/completions`,
        {
          model: "lunaby-pro",
          messages: [
            {
              role: "system",
              content: "You are a debate judge. Score arguments fairly and consistently.",
            },
            {
              role: "user",
              content: prompt,
            },
          ],
          max_tokens: 10,
          temperature: 0.3,
        },
        {
          headers: {
            "Authorization": `Bearer ${this.lunabyApiKey}`,
            "Content-Type": "application/json",
          },
          timeout: 15000,
        }
      );
      
      const scoreStr = response.data.choices[0].message.content.trim();
      const score = parseFloat(scoreStr);
      
      return !isNaN(score) ? Math.max(0, Math.min(10, score)) : 5;
    } catch (error) {
      logger.error("DEBATE", `Error scoring argument: ${error.message}`);
      return 5; // Default score
    }
  }

  /**
   * Determine debate winner
   */
  determineWinner(debate) {
    if (debate.scores.user > debate.scores.ai) {
      return "user";
    } else if (debate.scores.ai > debate.scores.user) {
      return "ai";
    } else {
      return "tie";
    }
  }

  /**
   * Generate debate summary
   */
  async generateSummary(debate) {
    try {
      let summaryPrompt = `Summarize this debate:\n\n`;
      summaryPrompt += `Topic: ${debate.topic}\n`;
      summaryPrompt += `User position: ${debate.userPosition}\n`;
      summaryPrompt += `AI position: ${debate.aiPosition}\n\n`;
      
      summaryPrompt += "Arguments:\n";
      debate.rounds.forEach(round => {
        if (round.userArgument) {
          summaryPrompt += `User: ${round.userArgument}\n`;
        }
        summaryPrompt += `AI: ${round.aiArgument}\n\n`;
      });
      
      summaryPrompt += `Provide a brief summary highlighting the strongest points from each side.`;
      
      const response = await axios.post(
        `${this.lunabyBaseURL}/chat/completions`,
        {
          model: "lunaby-pro",
          messages: [
            {
              role: "user",
              content: summaryPrompt,
            },
          ],
          max_tokens: 500,
        },
        {
          headers: {
            "Authorization": `Bearer ${this.lunabyApiKey}`,
            "Content-Type": "application/json",
          },
          timeout: 30000,
        }
      );
      
      return response.data.choices[0].message.content.trim();
    } catch (error) {
      logger.error("DEBATE", `Error generating summary: ${error.message}`);
      return "Summary unavailable.";
    }
  }

  /**
   * Get debate status
   */
  getDebate(debateId) {
    return this.activeDebates.get(debateId) || null;
  }

  /**
   * End debate early
   */
  endDebate(debateId) {
    const debate = this.activeDebates.get(debateId);
    
    if (debate) {
      debate.status = "ended";
      const winner = this.determineWinner(debate);
      
      return {
        success: true,
        finalScores: debate.scores,
        winner,
      };
    }
    
    return {
      success: false,
      error: "Debate not found",
    };
  }

  /**
   * Format debate status for Discord
   */
  formatDebateStatus(debate) {
    if (!debate) return "Debate not found.";
    
    let output = `🎭 **Debate Status**\n\n`;
    output += `**Topic:** ${debate.topic}\n`;
    output += `**Your Position:** ${debate.userPosition}\n`;
    output += `**AI Position:** ${debate.aiPosition}\n`;
    output += `**Round:** ${debate.currentRound}/${debate.maxRounds}\n\n`;
    
    output += `**Current Scores:**\n`;
    output += `You: ${debate.scores.user.toFixed(1)} points\n`;
    output += `AI: ${debate.scores.ai.toFixed(1)} points\n\n`;
    
    if (debate.status === "completed") {
      const winner = this.determineWinner(debate);
      output += `**Winner:** ${winner === "user" ? "You! 🏆" : winner === "ai" ? "AI 🤖" : "It's a tie! 🤝"}\n`;
    }
    
    return output;
  }
}

module.exports = new DebateService();
