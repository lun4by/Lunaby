const { SlashCommandBuilder, AttachmentBuilder } = require('discord.js');
const ImageService = require('../../services/ImageService.js');
const logger = require('../../utils/logger.js');
const { translate: t } = require('../../utils/i18n');

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

	async execute(interaction) {
		await interaction.deferReply();
		const prompt = interaction.options.getString('prompt');
		const aspectRatio = interaction.options.getString('aspect_ratio') || '1:1';

		let progressTracker = null;

		try {
			progressTracker = ImageService.trackImageGenerationProgress(interaction, prompt);
			await progressTracker.update(t(interaction, 'commands.image.progress.initializing'), 5);

			const imageResult = await ImageService.generateImage(prompt, interaction, progressTracker, {
				aspect_ratio: aspectRatio,
				output_format: 'png'
			});

			if (imageResult && imageResult.buffer) {
				const attachment = new AttachmentBuilder(imageResult.buffer, { name: 'generated-image.png' });
				await interaction.followUp({ files: [attachment] });
			} else {
				await interaction.followUp({
					content: t(interaction, 'commands.image.errors.noResult'),
				});
				logger.warn('IMAGE', 'Image generation returned no result buffer');
			}
		} catch (error) {
			logger.error('COMMAND', 'Error while generating image:', error);
			await interaction.followUp({
				content: t(interaction, 'commands.image.errors.general'),
			});
		}
	},
};


