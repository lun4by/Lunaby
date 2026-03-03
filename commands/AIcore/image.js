const { SlashCommandBuilder, AttachmentBuilder } = require('discord.js');
const ImageService = require('../../services/ImageService.js');
const logger = require('../../utils/logger.js');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('image')
		.setDescription('Vẽ một hình ảnh từ ý tưởng của bạn')
		.addStringOption((option) =>
			option
				.setName('prompt')
				.setDescription('Mô tả bức tranh bạn muốn mình tạo')
				.setRequired(true),
		)
		.addStringOption((option) =>
			option
				.setName('aspect_ratio')
				.setDescription('Tỷ lệ khung hình')
				.setRequired(false)
				.addChoices(
					{ name: '1:1 (Vuông)', value: '1:1' },
					{ name: '16:9 (Ngang)', value: '16:9' },
					{ name: '9:16 (Dọc)', value: '9:16' },
					{ name: '4:3 (Ngang tiêu chuẩn)', value: '4:3' },
					{ name: '3:4 (Dọc tiêu chuẩn)', value: '3:4' },
					{ name: '21:9 (Siêu rộng)', value: '21:9' },
					{ name: '9:21 (Siêu dọc)', value: '9:21' }
				)
		),
	prefix: { name: 'image', aliases: ['img', 've'], description: 'Tạo hình ảnh' },

	async execute(interaction) {
		await interaction.deferReply();
		const prompt = interaction.options.getString('prompt');
		const aspectRatio = interaction.options.getString('aspect_ratio') || '1:1';

		try {
			const imageResult = await ImageService.generateImage(prompt, {
				aspect_ratio: aspectRatio,
				output_format: 'png'
			});

			if (imageResult && imageResult.buffer) {
				const attachment = new AttachmentBuilder(imageResult.buffer, { name: 'generated-image.png' });
				await interaction.editReply({ content: '🎨 Hình ảnh đã được tạo!', files: [attachment] });
			} else {
				await interaction.editReply({
					content: 'Không thể tạo ảnh. Vui lòng thử lại sau.',
				});
				logger.warn('IMAGE', 'Image generation returned no result buffer');
			}
		} catch (error) {
			logger.error('COMMAND', 'Error while generating image:', error);

			let errorMessage = 'Đã xảy ra lỗi khi tạo ảnh.';

			if (error.message) {
				if (error.message.includes('vi phạm') || error.message.includes('không phù hợp')) {
					errorMessage = '❌ ' + error.message;
				} else if (error.message.includes('bận') || error.message.includes('thử lại')) {
					errorMessage = '⏳ ' + error.message;
				} else {
					errorMessage = error.message;
				}
			}

			try {
				await interaction.editReply({
					content: errorMessage,
				});
			} catch (editError) {
				logger.error('COMMAND', 'Failed to send error message:', editError);
			}
		}
	},
};


