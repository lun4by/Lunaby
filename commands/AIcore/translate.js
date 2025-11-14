const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const TranslationService = require("../../services/TranslationService.js");
const logger = require("../../utils/logger.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("translate")
    .setDescription("Translate text between languages")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("text")
        .setDescription("Translate text")
        .addStringOption((option) =>
          option
            .setName("text")
            .setDescription("Text to translate")
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName("to")
            .setDescription("Target language (e.g., en, vi, ja, ko)")
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName("from")
            .setDescription("Source language (auto-detect if not specified)")
            .setRequired(false)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("detect")
        .setDescription("Detect language of text")
        .addStringOption((option) =>
          option
            .setName("text")
            .setDescription("Text to analyze")
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("languages")
        .setDescription("List supported languages")
    ),

  async execute(interaction) {
    try {
      await interaction.deferReply();

      const subcommand = interaction.options.getSubcommand();

      switch (subcommand) {
        case "text": {
          const text = interaction.options.getString("text");
          const targetLang = interaction.options.getString("to");
          const sourceLang = interaction.options.getString("from") || "auto";

          logger.info("TRANSLATE", `Translating for ${interaction.user.tag}: ${sourceLang} -> ${targetLang}`);

          const result = await TranslationService.translate(text, targetLang, sourceLang);

          if (result.success) {
            const embed = new EmbedBuilder()
              .setColor(0x0099ff)
              .setTitle("🌐 Translation")
              .addFields(
                {
                  name: "Original",
                  value: result.originalText.length > 1024 
                    ? result.originalText.substring(0, 1021) + "..."
                    : result.originalText,
                },
                {
                  name: "Translation",
                  value: result.translatedText.length > 1024 
                    ? result.translatedText.substring(0, 1021) + "..."
                    : result.translatedText,
                }
              )
              .setFooter({ text: `${result.sourceLang} → ${result.targetLang}` })
              .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
          } else {
            await interaction.editReply({
              content: `❌ Translation failed: ${result.error}`,
            });
          }
          break;
        }

        case "detect": {
          const text = interaction.options.getString("text");

          logger.info("TRANSLATE", `Detecting language for ${interaction.user.tag}`);

          const result = await TranslationService.detectLanguage(text);

          if (result.success) {
            const embed = new EmbedBuilder()
              .setColor(0x00ff00)
              .setTitle("🔍 Language Detection")
              .addFields(
                { name: "Text", value: text.substring(0, 1024) },
                { name: "Detected Language", value: result.language, inline: true },
                { name: "Code", value: result.code || "N/A", inline: true }
              )
              .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
          } else {
            await interaction.editReply({
              content: `❌ Detection failed: ${result.error}`,
            });
          }
          break;
        }

        case "languages": {
          const languages = TranslationService.getSupportedLanguages();
          
          let description = "**Supported Languages:**\n\n";
          languages.forEach(lang => {
            description += `\`${lang.code}\` - ${lang.name}\n`;
          });

          const embed = new EmbedBuilder()
            .setColor(0xff9900)
            .setTitle("🌍 Supported Languages")
            .setDescription(description.substring(0, 4000))
            .setFooter({ text: "Use language codes with /translate text" })
            .setTimestamp();

          await interaction.editReply({ embeds: [embed] });
          break;
        }
      }
    } catch (error) {
      logger.error("TRANSLATE", `Error: ${error.message}`);
      await interaction.editReply({
        content: "❌ An error occurred during translation.",
      });
    }
  },
};
