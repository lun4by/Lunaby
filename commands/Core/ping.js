const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const packageJson = require('../../package.json');
const { formatUptime } = require('../../utils/string');
const { createLunabyEmbed } = require('../../utils/embedUtils');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('ping')
		.setDescription('Kiểm tra độ trễ và trạng thái kết nối của bot'),
	prefix: { name: 'ping', aliases: ['p'], description: 'Kiểm tra độ trễ' },
	cooldown: 10,

	async execute(interaction) {
		const sent = await interaction.deferReply({ fetchReply: true });
		const pingLatency = ((sent.createdTimestamp - interaction.createdTimestamp) / 100).toFixed(0);
		const latency = { ping: pingLatency, ws: interaction.client.ws.ping };

		const response = await interaction.editReply({
			embeds: [createStatusEmbed(latency, interaction.client)],
			components: [createActionRow(true)],
		});

		const collector = response.createMessageComponentCollector({
			componentType: ComponentType.Button,
			time: 60000,
		});

		collector.on('collect', async (i) => {
			if (i.user.id !== interaction.user.id) {
				return i.reply({ content: 'Chỉ người đã gọi lệnh mới được sử dụng các nút này.', ephemeral: true });
			}

			if (i.customId === 'refresh_status') {
				const refreshed = { ping: pingLatency, ws: interaction.client.ws.ping };
				await i.update({
					embeds: [createStatusEmbed(refreshed, interaction.client)],
					components: [createActionRow(true)],
				});
			} else if (i.customId === 'detailed_info') {
				await i.reply({ embeds: [createDetailedEmbed(i)], ephemeral: true });
			}
		});

		collector.on('end', () => {
			interaction.editReply({ components: [createActionRow(false)] }).catch(() => { });
		});
	},
};

function createStatusEmbed({ ping, ws }, client) {
	const color = ping < 200 ? 0x57F287 : ping < 400 ? 0xFEE75C : 0xED4245;

	return createLunabyEmbed()
		.setColor(color)
		.setAuthor({
			name: 'Lunaby',
			iconURL: client.user.displayAvatarURL(),
		})
		.addFields({ name: 'Trạng thái hệ thống', value: `> **Bot**: \`${ping}ms\`\n> **WebSocket**: \`${ws}ms\``, inline: false })
		.setFooter({ text: `Lunaby v${packageJson.version} - ${formatUptime(process.uptime())}` });
}

function createDetailedEmbed(context) {
	const mem = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2);
	const shards = context.client.shard?.count || 1;

	return createLunabyEmbed()
		.setColor(0x9B59B6)
		.setTitle('Thông tin chi tiết')
		.addFields(
			{ name: 'Phiên bản Bot', value: `\`${packageJson.version}\``, inline: true },
			{ name: 'Phiên bản discord.js', value: `\`${packageJson.dependencies['discord.js'].replace('^', '')}\``, inline: true },
			{ name: 'Phiên bản Node.js', value: `\`${process.version}\``, inline: true },
			{ name: 'Thời gian hoạt động', value: `\`${formatUptime(process.uptime())}\``, inline: false },
			{ name: 'Bộ nhớ sử dụng', value: `\`${mem} MB\``, inline: true },
			{ name: 'Nền tảng', value: `\`${process.platform} ${process.arch}\``, inline: true },
			{ name: 'Số lượng shard', value: `\`${shards}\``, inline: true },
		)
		.setFooter({ text: 'Lunaby AI - Phát triển bởi s4ory' });
}

function createActionRow(enabled = true) {
	return new ActionRowBuilder().addComponents(
		new ButtonBuilder()
			.setCustomId('refresh_status')
			.setLabel('Làm mới')
			.setStyle(ButtonStyle.Primary)
			.setDisabled(!enabled),
		new ButtonBuilder()
			.setCustomId('detailed_info')
			.setLabel('Chi tiết')
			.setStyle(ButtonStyle.Secondary)
			.setDisabled(!enabled),
	);
}