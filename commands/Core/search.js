const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const WebSearchService = require('../../services/WebSearchService');
const logger = require('../../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('search')
    .setDescription('Tìm kiếm thông tin trực tuyến')
    .addStringOption(option =>
      option
        .setName('query')
        .setDescription('Nội dung cần tìm kiếm')
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option
        .setName('tokens')
        .setDescription('Số token tối đa (256-2048)')
        .setRequired(false)
        .setMinValue(256)
        .setMaxValue(2048)
    ),

  async execute(interaction) {
    const query = interaction.options.getString('query');
    const tokens = interaction.options.getInteger('tokens') || 2048;

    try {
      await interaction.deferReply();

      logger.info('SEARCH_COMMAND', `${interaction.user.tag} searching: "${query}"`);

      if (!process.env.PERPLEXITY_API_KEY) {
        throw new Error('Perplexity API Key chưa được cấu hình');
      }

      const result = await WebSearchService.searchWithProgress(
        query,
        interaction,
        { model: 'sonar', max_tokens: tokens }
      );

      const embed = new EmbedBuilder()
        .setColor(0x00A8E8)
        .setTitle(`🔍 ${query}`)
        .setDescription(result.content.substring(0, 4096))
        .setFooter({
          text: `Tokens: ${result.usage?.total_tokens || 0} | Perplexity AI`,
          iconURL: 'https://www.perplexity.ai/favicon.ico'
        })
        .setTimestamp();

      if (result.images?.length > 0) {
        embed.setThumbnail(result.images[0]);
      }

      await interaction.editReply({ embeds: [embed] });
      logger.info('SEARCH_COMMAND', `Search completed: "${query}"`);

    } catch (error) {
      logger.error('SEARCH_COMMAND', `Error: ${error.message}`);

      const errorEmbed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle('❌ Lỗi Tìm Kiếm')
        .setDescription(error.message)
        .setTimestamp();

      try {
        await interaction.editReply({ embeds: [errorEmbed] });
      } catch (err) {
        logger.error('SEARCH_COMMAND', `Reply error: ${err.message}`);
      }
    }
  }
};
