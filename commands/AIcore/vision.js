const {
  SlashCommandBuilder,
  AttachmentBuilder,
  EmbedBuilder,
} = require("discord.js");
const VisionService = require("../../services/VisionService.js");
const logger = require("../../utils/logger.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("vision")
    .setDescription("AI Vision - Analyze images")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("analyze")
        .setDescription("Analyze an image")
        .addStringOption((option) =>
          option
            .setName("url")
            .setDescription("Image URL or attach an image")
            .setRequired(false)
        )
        .addStringOption((option) =>
          option
            .setName("prompt")
            .setDescription("What would you like to know about the image?")
            .setRequired(false)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("ocr")
        .setDescription("Extract text from an image")
        .addStringOption((option) =>
          option
            .setName("url")
            .setDescription("Image URL or attach an image")
            .setRequired(false)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("caption")
        .setDescription("Generate a caption for an image")
        .addStringOption((option) =>
          option
            .setName("url")
            .setDescription("Image URL or attach an image")
            .setRequired(false)
        )
        .addStringOption((option) =>
          option
            .setName("style")
            .setDescription("Caption style")
            .addChoices(
              { name: "Short", value: "short" },
              { name: "Descriptive", value: "descriptive" },
              { name: "Creative", value: "creative" },
              { name: "Technical", value: "technical" }
            )
            .setRequired(false)
        )
    ),

  async execute(interaction) {
    try {
      await interaction.deferReply();

      const subcommand = interaction.options.getSubcommand();
      let imageUrl = interaction.options.getString("url");

      // Check for attached image
      if (!imageUrl && interaction.options._hoistedOptions.length > 0) {
        const attachments = Array.from(interaction.message?.attachments?.values() || []);
        if (attachments.length > 0 && attachments[0].contentType?.startsWith("image/")) {
          imageUrl = attachments[0].url;
        }
      }

      // Check if message has attachment when command is used
      if (!imageUrl) {
        // Fetch recent messages to check for images
        const messages = await interaction.channel.messages.fetch({ limit: 5 });
        for (const msg of messages.values()) {
          const attachment = msg.attachments.find(att => att.contentType?.startsWith("image/"));
          if (attachment) {
            imageUrl = attachment.url;
            break;
          }
        }
      }

      if (!imageUrl) {
        return await interaction.editReply({
          content: "❌ Please provide an image URL or attach an image!",
        });
      }

      let result;

      switch (subcommand) {
        case "analyze": {
          const prompt = interaction.options.getString("prompt") || "Describe this image in detail";
          logger.info("VISION_CMD", `Analyzing image for ${interaction.user.tag}`);
          result = await VisionService.analyzeImage(imageUrl, prompt);
          
          if (result.success) {
            const embed = new EmbedBuilder()
              .setColor(0x00ff00)
              .setTitle("🔍 Image Analysis")
              .setDescription(result.analysis)
              .setImage(imageUrl)
              .setFooter({ text: `Analyzed by ${result.model}` })
              .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
          } else {
            await interaction.editReply({
              content: `❌ Analysis failed: ${result.error}`,
            });
          }
          break;
        }

        case "ocr": {
          logger.info("VISION_CMD", `Extracting text for ${interaction.user.tag}`);
          result = await VisionService.extractText(imageUrl);
          
          if (result.success) {
            const embed = new EmbedBuilder()
              .setColor(0x0099ff)
              .setTitle("📝 Text Extraction (OCR)")
              .setDescription(result.text.length > 4000 ? result.text.substring(0, 4000) + "..." : result.text)
              .setImage(imageUrl)
              .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
          } else {
            await interaction.editReply({
              content: `❌ OCR failed: ${result.error}`,
            });
          }
          break;
        }

        case "caption": {
          const style = interaction.options.getString("style") || "descriptive";
          logger.info("VISION_CMD", `Generating ${style} caption for ${interaction.user.tag}`);
          result = await VisionService.generateCaption(imageUrl, style);
          
          if (result.success) {
            const embed = new EmbedBuilder()
              .setColor(0xff9900)
              .setTitle(`📸 ${style.charAt(0).toUpperCase() + style.slice(1)} Caption`)
              .setDescription(result.analysis)
              .setImage(imageUrl)
              .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
          } else {
            await interaction.editReply({
              content: `❌ Caption generation failed: ${result.error}`,
            });
          }
          break;
        }
      }
    } catch (error) {
      logger.error("VISION_CMD", `Error: ${error.message}`);
      await interaction.editReply({
        content: "❌ An error occurred while processing the image.",
      });
    }
  },
};
