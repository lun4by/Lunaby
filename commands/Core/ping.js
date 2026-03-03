const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const packageJson = require('../../package.json');
const stringUtils = require('../../utils/string');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('ping')
		.setDescription('Kiểm tra độ trễ và trạng thái kết nối của bot'),
	prefix: { name: 'ping', aliases: ['p'], description: 'Kiểm tra độ trễ' },

	async execute(interaction) {
		const sent = await interaction.deferReply({ fetchReply: true });
		const pingLatency = ((sent.createdTimestamp - interaction.createdTimestamp) / 100).toFixed(0);

		const initialEmbed = createStatusEmbed(interaction, {
			ping: pingLatency,
			ws: interaction.client.ws.ping,
		});

		const response = await interaction.editReply({
			embeds: [initialEmbed],
			components: [createActionRow(interaction, false)],
		});

		const updatedEmbed = createStatusEmbed(interaction, {
			ping: pingLatency,
			ws: interaction.client.ws.ping,
		});

		await interaction.editReply({
			embeds: [updatedEmbed],
			components: [createActionRow(interaction, true)],
		});

		const collector = response.createMessageComponentCollector({
			componentType: ComponentType.Button,
			time: 60000,
		});

		collector.on('collect', async (i) => {
			if (i.user.id !== interaction.user.id) {
				return i.reply({
					content: 'Chỉ người đã gọi lệnh mới được sử dụng các nút này.',
					ephemeral: true,
				});
			}

			if (i.customId === 'refresh_status') {
				await i.update({
					embeds: [createStatusEmbed(i, {
						ping: pingLatency,
						ws: interaction.client.ws.ping,
					})],
					components: [createActionRow(i, false)],
				});

				const newPingLatency = pingLatency;
				const newWsLatency = interaction.client.ws.ping;

				await i.editReply({
					embeds: [createStatusEmbed(i, {
						ping: newPingLatency,
						ws: newWsLatency,
					})],
					components: [createActionRow(i, true)],
				});
			} else if (i.customId === 'detailed_info') {
				const detailedEmbed = createDetailedEmbed(i);
				await i.reply({
					embeds: [detailedEmbed],
					ephemeral: true,
				});
			}
		});

		collector.on('end', () => {
			interaction.editReply({
				components: [createActionRow(interaction, false)],
			}).catch(() => { });
		});
	},
};

function createDetailedEmbed(context) {
	const memoryUsage = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2);
	const shardCount = context.client.shard ? context.client.shard.count : 1;

	return new EmbedBuilder()
		.setColor(0x9B59B6)
		.setTitle('Thông tin chi tiết')
		.addFields(
			{ name: 'Phiên bản Bot', value: `\`${packageJson.version}\``, inline: true },
			{ name: 'Phiên bản discord.js', value: `\`${packageJson.dependencies['discord.js'].replace('^', '')}\``, inline: true },
			{ name: 'Phiên bản Node.js', value: `\`${process.version}\``, inline: true },
			{ name: 'Thời gian hoạt động', value: `\`${stringUtils.formatUptime(process.uptime())}\``, inline: false },
			{ name: 'Bộ nhớ sử dụng', value: `\`${memoryUsage} MB\``, inline: true },
			{ name: 'Nền tảng', value: `\`${process.platform} ${process.arch}\``, inline: true },
			{ name: 'Số lượng shard', value: `\`${shardCount}\``, inline: true },
		)
		.setFooter({ text: 'Lunaby AI - Phát triển bởi s4ory' })
		.setTimestamp();
}

function createStatusEmbed(context, { ping, ws }) {
	let statusColor;
	if (ping < 200) statusColor = 0x57F287;
	else if (ping < 400) statusColor = 0xFEE75C;
	else statusColor = 0xED4245;

	const latencyLines = [
		`> **Bot**: \`${ping}ms\``,
		`> **WebSocket**: \`${ws}ms\``,
	].join('\n');

	return new EmbedBuilder()
		.setColor(statusColor)
		.setAuthor({
			name: 'Lunaby AI',
			iconURL: 'https://raw.githubusercontent.com/Lun4by/Lunaby/refs/heads/main/assets/lunaby-avatar.png',
		})
		.setTitle('Trạng thái hệ thống')
		.addFields({
			name: 'Độ trễ',
			value: latencyLines,
			inline: false,
		})
		.setFooter({
			text: `Lunaby v${packageJson.version} - ${stringUtils.formatUptime(process.uptime())}`,
		})
		.setTimestamp();
}

function createActionRow(context, enabled = true) {
	return new ActionRowBuilder().addComponents(
		new ButtonBuilder()
			.setCustomId('refresh_status')
			.setLabel('Làm mới')
			.setEmoji('🔄')
			.setStyle(ButtonStyle.Primary)
			.setDisabled(!enabled),
		new ButtonBuilder()
			.setCustomId('detailed_info')
			.setLabel('Chi tiết')
			.setEmoji('ℹ️')
			.setStyle(ButtonStyle.Secondary)
			.setDisabled(!enabled),
	);
}




