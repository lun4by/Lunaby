const { SlashCommandBuilder } = require('discord.js');
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
    ),

  async execute(interaction) {
    const query = interaction.options.getString('query');

    try {
      await interaction.deferReply();

      logger.info('SEARCH_COMMAND', `${interaction.user.tag} searching: "${query}"`);

      if (!process.env.PERPLEXITY_API_KEY) {
        throw new Error('Perplexity API Key chưa được cấu hình');
      }

      const result = await WebSearchService.searchWithProgress(
        query,
        interaction,
        { model: 'sonar' }
      );

      await interaction.editReply({
        content: `🔍 **${query}**\n\n${result.content}`
      });
      logger.info('SEARCH_COMMAND', `Search completed: "${query}"`);

    } catch (error) {
      logger.error('SEARCH_COMMAND', `Error: ${error.message}`);

      try {
        await interaction.editReply({
          content: `❌ **Lỗi Tìm Kiếm:** ${error.message}`
        });
      } catch (err) {
        logger.error('SEARCH_COMMAND', `Reply error: ${err.message}`);
      }
    }
  }
};
