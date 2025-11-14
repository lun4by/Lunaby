const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const AnalyticsService = require("../../services/AnalyticsService.js");
const logger = require("../../utils/logger.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("analytics")
    .setDescription("Server analytics and insights")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("report")
        .setDescription("Generate server analytics report")
        .addIntegerOption((option) =>
          option
            .setName("days")
            .setDescription("Number of days to analyze")
            .setRequired(false)
            .addChoices(
              { name: "7 days", value: 7 },
              { name: "14 days", value: 14 },
              { name: "30 days", value: 30 }
            )
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("trending")
        .setDescription("Show trending topics")
        .addIntegerOption((option) =>
          option
            .setName("days")
            .setDescription("Number of days to analyze")
            .setRequired(false)
            .setMinValue(1)
            .setMaxValue(30)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("sentiment")
        .setDescription("Show sentiment distribution")
        .addIntegerOption((option) =>
          option
            .setName("days")
            .setDescription("Number of days to analyze")
            .setRequired(false)
            .setMinValue(1)
            .setMaxValue(30)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("active")
        .setDescription("Show most active users")
        .addIntegerOption((option) =>
          option
            .setName("days")
            .setDescription("Number of days to analyze")
            .setRequired(false)
            .setMinValue(1)
            .setMaxValue(30)
        )
    ),

  async execute(interaction) {
    try {
      // Check if user has permission (admin or moderator)
      if (!interaction.member.permissions.has("ManageGuild")) {
        return await interaction.reply({
          content: "❌ You need Manage Server permission to use analytics.",
          ephemeral: true,
        });
      }

      await interaction.deferReply();

      const subcommand = interaction.options.getSubcommand();
      const guildId = interaction.guild.id;

      switch (subcommand) {
        case "report": {
          const days = interaction.options.getInteger("days") || 7;

          logger.info("ANALYTICS", `Generating ${days}-day report for ${interaction.guild.name}`);

          const report = await AnalyticsService.generateReport(guildId, days);

          if (!report) {
            return await interaction.editReply({
              content: "❌ Failed to generate report. There may not be enough data yet.",
            });
          }

          const formatted = AnalyticsService.formatReport(report);

          const embed = new EmbedBuilder()
            .setColor(0x3498db)
            .setDescription(formatted)
            .setFooter({ text: `Generated at ${new Date().toLocaleString()}` })
            .setTimestamp();

          await interaction.editReply({ embeds: [embed] });
          break;
        }

        case "trending": {
          const days = interaction.options.getInteger("days") || 7;

          logger.info("ANALYTICS", `Fetching trending topics for ${interaction.guild.name}`);

          const topics = await AnalyticsService.getTrendingTopics(guildId, days);

          if (topics.length === 0) {
            return await interaction.editReply({
              content: "No trending topics found for this period.",
            });
          }

          const embed = new EmbedBuilder()
            .setColor(0xe74c3c)
            .setTitle(`🔥 Trending Topics (Last ${days} days)`)
            .setTimestamp();

          topics.forEach((topic, i) => {
            embed.addFields({
              name: `${i + 1}. ${topic.topic}`,
              value: `${topic.count} mentions`,
              inline: true,
            });
          });

          await interaction.editReply({ embeds: [embed] });
          break;
        }

        case "sentiment": {
          const days = interaction.options.getInteger("days") || 7;

          logger.info("ANALYTICS", `Fetching sentiment distribution for ${interaction.guild.name}`);

          const distribution = await AnalyticsService.getSentimentDistribution(guildId, days);

          if (!distribution) {
            return await interaction.editReply({
              content: "No sentiment data available for this period.",
            });
          }

          const total = distribution.positive + distribution.neutral + distribution.negative;
          const posPercent = total > 0 ? ((distribution.positive / total) * 100).toFixed(1) : 0;
          const neuPercent = total > 0 ? ((distribution.neutral / total) * 100).toFixed(1) : 0;
          const negPercent = total > 0 ? ((distribution.negative / total) * 100).toFixed(1) : 0;

          const embed = new EmbedBuilder()
            .setColor(0x9b59b6)
            .setTitle(`😊 Sentiment Analysis (Last ${days} days)`)
            .addFields(
              {
                name: "😊 Positive",
                value: `${distribution.positive} (${posPercent}%)`,
                inline: true,
              },
              {
                name: "😐 Neutral",
                value: `${distribution.neutral} (${neuPercent}%)`,
                inline: true,
              },
              {
                name: "😟 Negative",
                value: `${distribution.negative} (${negPercent}%)`,
                inline: true,
              }
            )
            .setFooter({ text: `Total messages: ${total}` })
            .setTimestamp();

          await interaction.editReply({ embeds: [embed] });
          break;
        }

        case "active": {
          const days = interaction.options.getInteger("days") || 7;

          logger.info("ANALYTICS", `Fetching active users for ${interaction.guild.name}`);

          const activeUsers = await AnalyticsService.getMostActiveUsers(guildId, days);

          if (activeUsers.length === 0) {
            return await interaction.editReply({
              content: "No activity data available for this period.",
            });
          }

          const embed = new EmbedBuilder()
            .setColor(0xf39c12)
            .setTitle(`👥 Most Active Users (Last ${days} days)`)
            .setTimestamp();

          activeUsers.forEach((user, i) => {
            const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`;
            embed.addFields({
              name: `${medal} <@${user.userId}>`,
              value: `${user.messageCount} messages | ${user.positivityScore}% positive`,
            });
          });

          await interaction.editReply({ embeds: [embed] });
          break;
        }
      }
    } catch (error) {
      logger.error("ANALYTICS", `Error: ${error.message}`);
      await interaction.editReply({
        content: "❌ An error occurred while generating analytics.",
      });
    }
  },
};
