const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const DebateService = require("../../services/DebateService.js");
const logger = require("../../utils/logger.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("debate")
    .setDescription("Debate with AI on any topic")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("start")
        .setDescription("Start a new debate")
        .addStringOption((option) =>
          option
            .setName("topic")
            .setDescription("What do you want to debate about?")
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName("position")
            .setDescription("Your position")
            .setRequired(true)
            .addChoices(
              { name: "For/Pro", value: "for" },
              { name: "Against/Con", value: "against" }
            )
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("argue")
        .setDescription("Submit your argument")
        .addStringOption((option) =>
          option
            .setName("argument")
            .setDescription("Your argument")
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("status")
        .setDescription("Check current debate status")
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("end")
        .setDescription("End the debate early")
    ),

  async execute(interaction) {
    try {
      await interaction.deferReply();

      const subcommand = interaction.options.getSubcommand();
      const userId = interaction.user.id;

      switch (subcommand) {
        case "start": {
          const topic = interaction.options.getString("topic");
          const position = interaction.options.getString("position");

          logger.info("DEBATE", `Starting debate for ${interaction.user.tag}: ${topic}`);

          const result = await DebateService.startDebate(userId, topic, position);

          if (result.success) {
            const embed = new EmbedBuilder()
              .setColor(0x9b59b6)
              .setTitle("🎭 Debate Started!")
              .setDescription(`**Topic:** ${result.topic}`)
              .addFields(
                {
                  name: "Your Position",
                  value: result.userPosition,
                  inline: true,
                },
                {
                  name: "AI Position",
                  value: result.aiPosition,
                  inline: true,
                },
                {
                  name: "AI's Opening Statement",
                  value: result.aiOpening.substring(0, 1000),
                }
              )
              .setFooter({ text: "Use /debate argue to submit your argument" })
              .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
          } else {
            await interaction.editReply({
              content: `❌ Failed to start debate: ${result.error}`,
            });
          }
          break;
        }

        case "argue": {
          const argument = interaction.options.getString("argument");

          logger.info("DEBATE", `Argument submitted by ${interaction.user.tag}`);

          // Find user's active debate
          const debates = Array.from(DebateService.activeDebates.values());
          const userDebate = debates.find(d => d.userId === userId && d.status === "active");

          if (!userDebate) {
            return await interaction.editReply({
              content: "❌ You don't have an active debate. Start one with `/debate start`",
            });
          }

          const result = await DebateService.submitArgument(userDebate.id, argument);

          if (result.success) {
            if (result.debateEnded) {
              const winnerText = result.winner === "user" 
                ? "🏆 You Win!" 
                : result.winner === "ai" 
                ? "🤖 AI Wins!" 
                : "🤝 It's a Tie!";

              const embed = new EmbedBuilder()
                .setColor(result.winner === "user" ? 0x00ff00 : 0xff9900)
                .setTitle("🎭 Debate Concluded!")
                .addFields(
                  { name: "Result", value: winnerText },
                  {
                    name: "Final Scores",
                    value: `You: ${result.finalScores.user.toFixed(1)}\nAI: ${result.finalScores.ai.toFixed(1)}`,
                    inline: true,
                  },
                  { name: "Summary", value: result.summary.substring(0, 1000) }
                )
                .setTimestamp();

              await interaction.editReply({ embeds: [embed] });
            } else {
              const embed = new EmbedBuilder()
                .setColor(0x3498db)
                .setTitle(`🎭 Round ${result.round}`)
                .addFields(
                  {
                    name: "Current Scores",
                    value: `You: ${result.currentScores.user.toFixed(1)}\nAI: ${result.currentScores.ai.toFixed(1)}`,
                    inline: true,
                  },
                  {
                    name: "AI's Counter-Argument",
                    value: result.aiCounterArgument.substring(0, 1000),
                  }
                )
                .setFooter({ text: "Submit your next argument with /debate argue" })
                .setTimestamp();

              await interaction.editReply({ embeds: [embed] });
            }
          } else {
            await interaction.editReply({
              content: `❌ Error: ${result.error}`,
            });
          }
          break;
        }

        case "status": {
          const debates = Array.from(DebateService.activeDebates.values());
          const userDebate = debates.find(d => d.userId === userId);

          if (!userDebate) {
            return await interaction.editReply({
              content: "❌ You don't have any active debates.",
            });
          }

          const statusText = DebateService.formatDebateStatus(userDebate);

          const embed = new EmbedBuilder()
            .setColor(0x3498db)
            .setDescription(statusText)
            .setTimestamp();

          await interaction.editReply({ embeds: [embed] });
          break;
        }

        case "end": {
          const debates = Array.from(DebateService.activeDebates.values());
          const userDebate = debates.find(d => d.userId === userId && d.status === "active");

          if (!userDebate) {
            return await interaction.editReply({
              content: "❌ You don't have an active debate.",
            });
          }

          const result = DebateService.endDebate(userDebate.id);

          if (result.success) {
            const winnerText = result.winner === "user" 
              ? "You were leading! 🏆" 
              : result.winner === "ai" 
              ? "AI was leading 🤖" 
              : "It was a tie! 🤝";

            const embed = new EmbedBuilder()
              .setColor(0xe74c3c)
              .setTitle("🎭 Debate Ended")
              .addFields(
                {
                  name: "Final Scores",
                  value: `You: ${result.finalScores.user.toFixed(1)}\nAI: ${result.finalScores.ai.toFixed(1)}`,
                },
                { name: "Result", value: winnerText }
              )
              .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
          } else {
            await interaction.editReply({
              content: `❌ Error: ${result.error}`,
            });
          }
          break;
        }
      }
    } catch (error) {
      logger.error("DEBATE", `Error: ${error.message}`);
      await interaction.editReply({
        content: "❌ An error occurred during the debate.",
      });
    }
  },
};
