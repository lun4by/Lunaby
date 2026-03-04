const {
	SlashCommandBuilder,
	ButtonBuilder,
	ActionRowBuilder,
	ButtonStyle,
} = require('discord.js');
const { formatUptime } = require('../../utils/string');
const { DEFAULT_MODEL } = require('../../config/constants');
const packageJson = require('../../package.json');
const { createLunabyEmbed } = require('../../utils/embedUtils');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('about')
		.setDescription('Hiển thị thông tin chi tiết về Lunaby bot'),
	prefix: { name: 'about', aliases: ['info', 'botinfo'], description: 'Thông tin bot' },
	cooldown: 5,

	async execute(interaction) {
		const data = buildContextData(interaction);
		const embed = createLunabyEmbed()
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
			.setFooter({ text: `Lunaby v${data.version}` })
			.setTimestamp();

		await interaction.reply({ embeds: [embed], components: [buildActionRow(interaction)] });
	},
};

function buildContextData(interaction) {
	return {
		modelName: DEFAULT_MODEL,
		memoryUsage: (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2),
		serverCount: interaction.client.guilds.cache.size,
		runtime: formatUptime(process.uptime(), true),
		version: packageJson.version,
		nodeVersion: process.version,
	};
}

function buildActionRow(context) {
	return new ActionRowBuilder().addComponents(
		new ButtonBuilder()
			.setLabel('Mời Bot')
			.setURL(`https://discord.com/api/oauth2/authorize?client_id=${context.client.user.id}&permissions=0&scope=bot%20applications.commands`)
			.setStyle(ButtonStyle.Link),
		new ButtonBuilder()
			.setLabel('Hỗ trợ')
			.setURL('https://discord.gg/52hSMAt')
			.setStyle(ButtonStyle.Link),
		new ButtonBuilder()
			.setLabel('Website')
			.setURL('https://lunaby.tech')
			.setStyle(ButtonStyle.Link),
	);
}