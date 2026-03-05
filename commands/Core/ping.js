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

function createActionRow(enabled = true) {
	return new ActionRowBuilder().addComponents(
		new ButtonBuilder()
			.setCustomId('refresh_status')
			.setLabel('Làm mới')
			.setStyle(ButtonStyle.Primary)
			.setDisabled(!enabled),
	);
}