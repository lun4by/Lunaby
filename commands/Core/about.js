const {
	SlashCommandBuilder,
	AttachmentBuilder,
	EmbedBuilder,
	ButtonBuilder,
	ActionRowBuilder,
	ButtonStyle,
} = require('discord.js');
const { createCanvas, loadImage } = require('canvas');
const AICore = require('../../services/AICore');
const { formatUptime } = require('../../utils/string');
const packageJson = require('../../package.json');
const logger = require('../../utils/logger');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('about')
		.setDescription('Hiển thị thông tin chi tiết về Lunaby bot'),

	async execute(interaction) {
		await interaction.deferReply();

		const contextData = buildContextData(interaction);

		try {
			const canvasBuffer = await renderAboutCanvas(interaction, contextData);
			const attachment = new AttachmentBuilder(canvasBuffer, { name: 'about-lunaby.png' });

			const aboutEmbed = new EmbedBuilder()
				.setColor(0x9B59B6)
				.setImage('attachment://about-lunaby.png')
				.setFooter({ text: 'Lunaby AI - Phát triển bởi s4ory' });

			const row = buildActionRow(interaction);

			await interaction.editReply({
				embeds: [aboutEmbed],
				files: [attachment],
				components: [row],
			});
		} catch (error) {
			logger.error('ABOUT', 'Error generating about image:', error);
			await sendFallbackEmbed(interaction, contextData);
		}
	},
};

function buildContextData(interaction) {
	return {
		modelName: AICore.getModelName() || 'Anthropic Claude',
		memoryUsage: (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2),
		serverCount: interaction.client.guilds.cache.size,
		uptime: formatUptime(process.uptime(), false),
		runtime: formatUptime(process.uptime(), true),
		version: packageJson.version,
		nodeVersion: process.version,
		currentDate: new Date().toISOString().split('T')[0],
	};
}

async function renderAboutCanvas(context, data) {
	const canvas = createCanvas(900, 500);
	const ctx = canvas.getContext('2d');

	ctx.fillStyle = '#1e1e2e';
	ctx.fillRect(0, 0, 900, 500);

	ctx.strokeStyle = 'rgba(155, 89, 182, 0.5)';
	ctx.lineWidth = 2;
	ctx.strokeRect(10, 10, 880, 480);

	ctx.strokeStyle = '#9B59B6';
	ctx.lineWidth = 1;
	ctx.beginPath();
	ctx.moveTo(50, 130);
	ctx.lineTo(850, 130);
	ctx.stroke();

	ctx.beginPath();
	ctx.moveTo(50, 370);
	ctx.lineTo(850, 370);
	ctx.stroke();

	let avatarImage;
	try {
		avatarImage = await loadImage(context.client.user.displayAvatarURL({ extension: 'png', size: 256 }));
	} catch (error) {
		logger.error('ABOUT', 'Error loading avatar:', error);
	}

	if (avatarImage) {
		ctx.drawImage(avatarImage, 50, 50, 70, 70);
	}

	ctx.font = 'bold 40px Sans';
	ctx.fillStyle = '#FFFFFF';
	ctx.fillText('Lunaby AI', 140, 85);

	ctx.font = '20px Sans';
	ctx.fillStyle = '#AE86FD';
	ctx.fillText('Trợ lý AI thông minh cho cộng đồng Discord', 140, 110);

	drawSimpleInfoBox(ctx, 50, 150, 380, 200, 'Thông tin kỹ thuật', [
		{ icon: '>', label: 'Mô hình AI', value: data.modelName },
		{ icon: '>', label: 'Thời gian hoạt động', value: data.uptime },
		{ icon: '>', label: 'Phiên bản Node', value: data.nodeVersion },
		{ icon: '>', label: 'Bộ nhớ', value: `${data.memoryUsage} MB` },
		{ icon: '>', label: 'Số server', value: data.serverCount.toString() },
	]);

	drawSimpleInfoBox(ctx, 450, 150, 400, 200, 'Tính năng', [
		{ icon: '>', label: 'Trò chuyện', value: 'AI thông minh' },
		{ icon: '>', label: 'Tạo ảnh', value: 'Stable Diffusion' },
		{ icon: '>', label: 'Lập trình', value: 'Hỗ trợ code' },
		{ icon: '>', label: 'Quản lý', value: 'Moderation' },
	]);

	ctx.font = '16px Sans';
	ctx.fillStyle = '#94A1B2';
	const footerText = `v${data.version} • ${data.currentDate}`;
	const footerWidth = ctx.measureText(footerText).width;
	ctx.fillText(footerText, 450 - footerWidth / 2, 470);

	return canvas.toBuffer();
}

function buildActionRow(context) {
	return new ActionRowBuilder().addComponents(
		new ButtonBuilder()
			.setLabel('Mời Bot')
			.setURL(`https://discord.com/api/oauth2/authorize?client_id=${context.client.user.id}&permissions=0&scope=bot%20applications.commands`)
			.setStyle(ButtonStyle.Link),
		new ButtonBuilder()
			.setLabel('Tài liệu')
			.setURL('https://github.com/Lun4by/Lunaby')
			.setStyle(ButtonStyle.Link),
		new ButtonBuilder()
			.setLabel('Hỗ trợ')
			.setURL('https://discord.gg/52hSMAt')
			.setStyle(ButtonStyle.Link),
		new ButtonBuilder()
			.setLabel('Website')
			.setURL('https://lunaby.io.vn')
			.setStyle(ButtonStyle.Link),
	);
}

async function sendFallbackEmbed(interaction, data) {
	const fallbackEmbed = new EmbedBuilder()
		.setColor(0x9B59B6)
		.setTitle('Về Lunaby AI')
		.setThumbnail(interaction.client.user.displayAvatarURL({ dynamic: true, size: 512 }))
		.setDescription('Trợ lý AI thông minh cho cộng đồng Discord của bạn')
		.addFields(
			{ name: 'Mô hình AI', value: data.modelName, inline: true },
			{ name: 'Thời gian chạy', value: data.runtime, inline: true },
			{ name: 'Số server', value: data.serverCount.toString(), inline: true },
			{ name: 'Bộ nhớ', value: `${data.memoryUsage} MB`, inline: true },
			{ name: 'Phiên bản Node', value: data.nodeVersion, inline: true },
		)
		.setFooter({
			text: `Lunaby v${data.version}`,
		})
		.setTimestamp();

	const row = buildActionRow(interaction);

	await interaction.editReply({
		embeds: [fallbackEmbed],
		components: [row],
	});
}

function drawSimpleInfoBox(ctx, x, y, width, height, title, items) {
	ctx.fillStyle = 'rgba(155, 89, 182, 0.1)';
	ctx.fillRect(x, y, width, height);

	ctx.strokeStyle = 'rgba(155, 89, 182, 0.3)';
	ctx.lineWidth = 1;
	ctx.strokeRect(x, y, width, height);

	ctx.font = 'bold 20px Sans';
	ctx.fillStyle = '#FFFFFF';
	ctx.fillText(title, x + 15, y + 25);

	ctx.strokeStyle = 'rgba(155, 89, 182, 0.5)';
	ctx.beginPath();
	ctx.moveTo(x + 15, y + 35);
	ctx.lineTo(x + width - 15, y + 35);
	ctx.stroke();

	let yOffset = y + 60;
	ctx.font = '16px Sans';

	items.forEach((item) => {
		ctx.fillStyle = '#FFFFFF';
		ctx.fillText(item.icon, x + 20, yOffset);

		ctx.fillStyle = '#AE86FD';
		ctx.fillText(`${item.label}:`, x + 50, yOffset);

		ctx.fillStyle = '#FFFFFF';
		const labelWidth = ctx.measureText(`${item.label}: `).width;
		ctx.fillText(item.value, x + 50 + labelWidth, yOffset);

		yOffset += 30;
	});
}


