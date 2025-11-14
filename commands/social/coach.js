const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const CoachService = require("../../services/CoachService.js");
const logger = require("../../utils/logger.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("coach")
    .setDescription("Personal AI Coach - Track goals and habits")
    .addSubcommandGroup((group) =>
      group
        .setName("goal")
        .setDescription("Manage your goals")
        .addSubcommand((subcommand) =>
          subcommand
            .setName("create")
            .setDescription("Create a new goal")
            .addStringOption((option) =>
              option
                .setName("title")
                .setDescription("Goal title")
                .setRequired(true)
            )
            .addStringOption((option) =>
              option
                .setName("description")
                .setDescription("Goal description")
                .setRequired(false)
            )
            .addStringOption((option) =>
              option
                .setName("category")
                .setDescription("Goal category")
                .addChoices(
                  { name: "Health & Fitness", value: "health" },
                  { name: "Learning & Education", value: "learning" },
                  { name: "Career & Work", value: "career" },
                  { name: "Personal Development", value: "personal" },
                  { name: "Other", value: "general" }
                )
                .setRequired(false)
            )
        )
        .addSubcommand((subcommand) =>
          subcommand
            .setName("progress")
            .setDescription("Update goal progress")
            .addStringOption((option) =>
              option
                .setName("goal")
                .setDescription("Goal ID (use /coach goal list to see IDs)")
                .setRequired(true)
            )
            .addIntegerOption((option) =>
              option
                .setName("percentage")
                .setDescription("Progress percentage (0-100)")
                .setRequired(true)
                .setMinValue(0)
                .setMaxValue(100)
            )
            .addStringOption((option) =>
              option
                .setName("note")
                .setDescription("Progress note")
                .setRequired(false)
            )
        )
        .addSubcommand((subcommand) =>
          subcommand
            .setName("list")
            .setDescription("List your goals")
        )
    )
    .addSubcommandGroup((group) =>
      group
        .setName("habit")
        .setDescription("Manage your habits")
        .addSubcommand((subcommand) =>
          subcommand
            .setName("create")
            .setDescription("Create a new habit to track")
            .addStringOption((option) =>
              option
                .setName("name")
                .setDescription("Habit name")
                .setRequired(true)
            )
            .addStringOption((option) =>
              option
                .setName("description")
                .setDescription("Habit description")
                .setRequired(false)
            )
        )
        .addSubcommand((subcommand) =>
          subcommand
            .setName("log")
            .setDescription("Log habit completion for today")
            .addStringOption((option) =>
              option
                .setName("habit")
                .setDescription("Habit ID (use /coach habit list to see IDs)")
                .setRequired(true)
            )
        )
        .addSubcommand((subcommand) =>
          subcommand
            .setName("list")
            .setDescription("List your habits")
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("summary")
        .setDescription("View your progress summary")
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("motivate")
        .setDescription("Get a motivational message")
    ),

  async execute(interaction) {
    try {
      await interaction.deferReply();

      const userId = interaction.user.id;
      const subcommandGroup = interaction.options.getSubcommandGroup();
      const subcommand = interaction.options.getSubcommand();

      if (subcommandGroup === "goal") {
        switch (subcommand) {
          case "create": {
            const title = interaction.options.getString("title");
            const description = interaction.options.getString("description") || "";
            const category = interaction.options.getString("category") || "general";

            const result = await CoachService.createGoal(userId, {
              title,
              description,
              category,
            });

            if (result.success) {
              const embed = new EmbedBuilder()
                .setColor(0x00ff00)
                .setTitle("✅ Goal Created!")
                .setDescription(result.goal.title)
                .addFields(
                  { name: "Description", value: result.goal.description || "No description" },
                  { name: "Category", value: result.goal.category, inline: true },
                  { name: "Progress", value: "0%", inline: true }
                )
                .setFooter({ text: `Goal ID: ${result.goal._id}` })
                .setTimestamp();

              await interaction.editReply({ embeds: [embed] });
            } else {
              await interaction.editReply({
                content: `❌ Failed to create goal: ${result.error}`,
              });
            }
            break;
          }

          case "progress": {
            const goalId = interaction.options.getString("goal");
            const percentage = interaction.options.getInteger("percentage");
            const note = interaction.options.getString("note");

            const result = await CoachService.updateGoalProgress(goalId, percentage, note);

            if (result.success) {
              const message = percentage >= 100 
                ? "🎉 Congratulations! You've completed your goal!" 
                : `Progress updated to ${percentage}%`;

              const embed = new EmbedBuilder()
                .setColor(percentage >= 100 ? 0xffd700 : 0x3498db)
                .setTitle("📈 Goal Progress Updated")
                .setDescription(message)
                .addFields({
                  name: "Current Progress",
                  value: `${percentage}%`,
                  inline: true,
                })
                .setTimestamp();

              if (note) {
                embed.addFields({ name: "Note", value: note });
              }

              await interaction.editReply({ embeds: [embed] });
            } else {
              await interaction.editReply({
                content: `❌ Failed to update progress: ${result.error}`,
              });
            }
            break;
          }

          case "list": {
            const goals = await CoachService.getUserGoals(userId);

            if (goals.length === 0) {
              return await interaction.editReply({
                content: "You don't have any goals yet. Create one with `/coach goal create`!",
              });
            }

            const embed = new EmbedBuilder()
              .setColor(0x9b59b6)
              .setTitle("🎯 Your Goals")
              .setTimestamp();

            goals.slice(0, 10).forEach(goal => {
              const progressBar = this.createProgressBar(goal.progress);
              embed.addFields({
                name: `${goal.title} (${goal.status})`,
                value: `${goal.description.substring(0, 100)}\n${progressBar} ${goal.progress}%\nID: \`${goal._id}\``,
              });
            });

            await interaction.editReply({ embeds: [embed] });
            break;
          }
        }
      } else if (subcommandGroup === "habit") {
        switch (subcommand) {
          case "create": {
            const name = interaction.options.getString("name");
            const description = interaction.options.getString("description") || "";

            const result = await CoachService.createHabit(userId, {
              name,
              description,
            });

            if (result.success) {
              const embed = new EmbedBuilder()
                .setColor(0x00ff00)
                .setTitle("✅ Habit Created!")
                .setDescription(result.habit.name)
                .addFields(
                  { name: "Description", value: result.habit.description || "No description" },
                  { name: "Current Streak", value: "0 days", inline: true }
                )
                .setFooter({ text: `Habit ID: ${result.habit._id}` })
                .setTimestamp();

              await interaction.editReply({ embeds: [embed] });
            } else {
              await interaction.editReply({
                content: `❌ Failed to create habit: ${result.error}`,
              });
            }
            break;
          }

          case "log": {
            const habitId = interaction.options.getString("habit");

            const result = await CoachService.logHabitCompletion(habitId);

            if (result.success) {
              const embed = new EmbedBuilder()
                .setColor(0x00ff00)
                .setTitle("✅ Habit Logged!")
                .setDescription("Great job staying consistent! 💪")
                .addFields(
                  { name: "Current Streak", value: `${result.streak} days 🔥`, inline: true },
                  { name: "Longest Streak", value: `${result.longestStreak} days`, inline: true }
                )
                .setTimestamp();

              await interaction.editReply({ embeds: [embed] });
            } else {
              await interaction.editReply({
                content: `❌ ${result.error}`,
              });
            }
            break;
          }

          case "list": {
            const habits = await CoachService.getUserHabits(userId);

            if (habits.length === 0) {
              return await interaction.editReply({
                content: "You don't have any habits yet. Create one with `/coach habit create`!",
              });
            }

            const embed = new EmbedBuilder()
              .setColor(0xe67e22)
              .setTitle("📋 Your Habits")
              .setTimestamp();

            habits.slice(0, 10).forEach(habit => {
              embed.addFields({
                name: habit.name,
                value: `${habit.description.substring(0, 100)}\n🔥 Streak: ${habit.streak} days | 🏆 Best: ${habit.longestStreak} days\nID: \`${habit._id}\``,
              });
            });

            await interaction.editReply({ embeds: [embed] });
            break;
          }
        }
      } else {
        switch (subcommand) {
          case "summary": {
            const summary = await CoachService.getProgressSummary(userId);

            if (!summary) {
              return await interaction.editReply({
                content: "No data available yet. Start by creating goals and habits!",
              });
            }

            const formatted = CoachService.formatProgressSummary(summary);

            const embed = new EmbedBuilder()
              .setColor(0x3498db)
              .setDescription(formatted)
              .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
            break;
          }

          case "motivate": {
            const motivation = await CoachService.generateMotivation(userId);

            const embed = new EmbedBuilder()
              .setColor(0xffd700)
              .setTitle("💪 Motivation")
              .setDescription(motivation)
              .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
            break;
          }
        }
      }
    } catch (error) {
      logger.error("COACH", `Error: ${error.message}`);
      await interaction.editReply({
        content: "❌ An error occurred.",
      });
    }
  },

  createProgressBar(percentage) {
    const filled = Math.round(percentage / 10);
    const empty = 10 - filled;
    return "█".repeat(filled) + "░".repeat(empty);
  },
};
