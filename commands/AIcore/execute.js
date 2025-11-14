const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const CodeExecutorService = require("../../services/CodeExecutorService.js");
const logger = require("../../utils/logger.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("execute")
    .setDescription("Execute code in a safe sandbox")
    .addStringOption((option) =>
      option
        .setName("language")
        .setDescription("Programming language")
        .setRequired(true)
        .addChoices(
          { name: "JavaScript", value: "javascript" },
          { name: "Python", value: "python" },
          { name: "SQL", value: "sql" }
        )
    )
    .addStringOption((option) =>
      option
        .setName("code")
        .setDescription("Code to execute")
        .setRequired(true)
    ),

  async execute(interaction) {
    try {
      await interaction.deferReply();

      const language = interaction.options.getString("language");
      const code = interaction.options.getString("code");

      logger.info("CODE_EXEC", `Executing ${language} code for ${interaction.user.tag}`);

      // Validate code
      const validation = await CodeExecutorService.validateCode(code, language);
      
      if (!validation.safe) {
        const embed = new EmbedBuilder()
          .setColor(0xff0000)
          .setTitle("⚠️ Code Validation Failed")
          .setDescription(`Your code contains potentially dangerous operations:\n${validation.reason}`)
          .setFooter({ text: "For security reasons, this code cannot be executed." });

        return await interaction.editReply({ embeds: [embed] });
      }

      // Execute code
      const result = await CodeExecutorService.execute(code, language);

      if (result.success) {
        const embed = new EmbedBuilder()
          .setColor(0x00ff00)
          .setTitle(`✅ Code Executed Successfully`)
          .addFields(
            {
              name: "Language",
              value: result.language.toUpperCase(),
              inline: true,
            },
            {
              name: "Status",
              value: result.simulation ? "Simulation" : "Executed",
              inline: true,
            }
          )
          .setDescription(`\`\`\`${result.language}\n${code}\n\`\`\``)
          .addFields({
            name: "Output",
            value: result.output.length > 1000 
              ? `\`\`\`\n${result.output.substring(0, 1000)}...\n\`\`\``
              : `\`\`\`\n${result.output}\n\`\`\``,
          })
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
      } else {
        const embed = new EmbedBuilder()
          .setColor(0xff0000)
          .setTitle("❌ Execution Error")
          .setDescription(`\`\`\`${result.language}\n${code}\n\`\`\``)
          .addFields({
            name: "Error",
            value: `\`\`\`\n${result.error}\n\`\`\``,
          })
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
      }
    } catch (error) {
      logger.error("CODE_EXEC", `Error: ${error.message}`);
      await interaction.editReply({
        content: "❌ An error occurred while executing the code.",
      });
    }
  },
};
