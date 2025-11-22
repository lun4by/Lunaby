const {
	SlashCommandBuilder,
	EmbedBuilder,
	ActionRowBuilder,
	StringSelectMenuBuilder,
	StringSelectMenuOptionBuilder,
	ComponentType,
} = require('discord.js');
const fs = require('fs');
const path = require('path');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('help')
		.setDescription('Hiển thị danh sách lệnh và thông tin trợ giúp'),

	async execute(interaction) {
		const isOwner = interaction.user.id === process.env.OWNER_ID;

		const commandsPath = path.join(__dirname, '../');
		const commandFolders = fs.readdirSync(commandsPath, { withFileTypes: true })
			.filter((dirent) => dirent.isDirectory())
			.map((dirent) => dirent.name);

		const visibleCategories = commandFolders.filter((folder) => {
			if (isOwner) return true;
			return folder !== 'setting';
		});

		const select = new StringSelectMenuBuilder()
			.setCustomId('category-select')
			.setPlaceholder('Chọn một danh mục')
			.addOptions(buildSelectOptions(visibleCategories));

		const row = new ActionRowBuilder().addComponents(select);

		const welcomeEmbed = new EmbedBuilder()
			.setColor(0x9B59B6)
			.setTitle('📚 Trợ Giúp - Lunaby')
			.setDescription('Chào mừng bạn đến với hệ thống trợ giúp!\n\n> Chọn một danh mục từ menu bên dưới để xem chi tiết các lệnh.')
			.setFooter({ text: 'Made with ❤️ by s4ory' })
			.setTimestamp();

		await interaction.reply({
			embeds: [welcomeEmbed],
			components: [row],
		});

		const message = await interaction.fetchReply();

		const collector = message.createMessageComponentCollector({
			time: 60000,
			componentType: ComponentType.StringSelect,
		});

		collector.on('collect', async (i) => {
			if (i.user.id !== interaction.user.id) {
				return i.reply({
					content: '❌ Chỉ người dùng gọi lệnh mới có thể sử dụng menu này!',
					ephemeral: true,
				});
			}

			const category = i.values[0];

			if (category === 'setting' && !isOwner) {
				return i.reply({
					content: '❌ Bạn không có quyền xem danh mục này!',
					ephemeral: true,
				});
			}

			const helpEmbed = buildHelpEmbed(category, visibleCategories, commandsPath);

			await i.update({
				embeds: [helpEmbed],
				components: [row],
			});
		});

		collector.on('end', async (collected) => {
			try {
				const disabledRow = new ActionRowBuilder().addComponents(
					select.setDisabled(true),
				);

				if (collected.size === 0) {
					await interaction.editReply({
						content: '⏱️ Menu trợ giúp đã hết hạn!',
						components: [disabledRow],
					});
				} else {
					await interaction.editReply({
						components: [disabledRow],
					});
				}
			} catch (error) {
				console.error('Error when disabling the help menu:', error);
			}
		});
	},
};

function buildSelectOptions(categories) {
	const options = [
		new StringSelectMenuOptionBuilder()
			.setLabel('Tất cả lệnh')
			.setDescription('Xem tất cả các lệnh có sẵn')
			.setValue('all')
			.setEmoji('📋'),
	];

	for (const folder of categories) {
		const metadata = getCategoryMetadata(folder);
		options.push(
			new StringSelectMenuOptionBuilder()
				.setLabel(metadata.label)
				.setDescription(metadata.description)
				.setValue(folder)
				.setEmoji(metadata.emoji),
		);
	}

	return options;
}

function buildHelpEmbed(category, visibleCategories, commandsPath) {
	const embed = new EmbedBuilder()
		.setColor(0x9B59B6)
		.setFooter({ text: 'Made with ❤️ by Lunaby Team' })
		.setTimestamp();

	if (category === 'all') {
		embed
			.setTitle('📋 Tất cả lệnh')
			.setDescription('Danh sách tất cả các lệnh có sẵn theo danh mục:');

		for (const folder of visibleCategories) {
			const folderPath = path.join(commandsPath, folder);
			const commandFiles = fs.readdirSync(folderPath).filter((file) => file.endsWith('.js'));
			const metadata = getCategoryMetadata(folder);

			const commandList = commandFiles.map((file) => {
				const command = require(path.join(folderPath, file));
				return formatCommandSummary(command);
			}).join('\n');

			embed.addFields({
				name: `${metadata.emoji} ${metadata.label}`,
				value: commandList || 'Không có lệnh nào',
			});
		}

		return embed;
	}

	const metadata = getCategoryMetadata(category);

	embed
		.setTitle(`${metadata.emoji} ${metadata.label}`)
		.setDescription(`Chi tiết các lệnh trong danh mục **${metadata.label}**:`);

	const folderPath = path.join(commandsPath, category);
	const commandFiles = fs.readdirSync(folderPath).filter((file) => file.endsWith('.js'));

	const commandList = commandFiles.map((file) => {
		const command = require(path.join(folderPath, file));
		const description = command.data.description || 'Không có mô tả';
		return `/${command.data.name} : ${description}`;
	}).join('\n');

	embed.addFields({
		name: '\u200B',
		value: `\`\`\`${commandList || 'Không có lệnh nào'}\`\`\``,
	});

	return embed;
}

function formatCommandSummary(commandModule) {
	const description = commandModule.data.description || 'Không có mô tả';
	return `\`/${commandModule.data.name}\` - ${description}`;
}

function formatCommandDetails(commandModule) {
	const description = commandModule.data.description || 'Không có mô tả';

	return {
		name: `/${commandModule.data.name}`,
		value: `\`\`\`${description}\`\`\``,
		inline: false,
	};
}

function getCategoryMetadata(category) {
	const categoryMap = {
		'AIcore': { label: 'AI Core', description: 'Các lệnh AI nâng cao', emoji: '🤖' },
		'Core': { label: 'Core', description: 'Các lệnh cơ bản của bot', emoji: '⚙️' },
		'moderation': { label: 'Moderation', description: 'Các lệnh quản lý server', emoji: '🛡️' },
		'social': { label: 'Social', description: 'Các lệnh tương tác xã hội', emoji: '👥' },
		'system': { label: 'System', description: 'Các lệnh quản lý hệ thống', emoji: '🔧' },
	};

	return categoryMap[category] || {
		label: capitalizeFirstLetter(category),
		description: `Danh mục ${capitalizeFirstLetter(category)}`,
		emoji: '📁',
	};
}

function capitalizeFirstLetter(value) {
	return value.charAt(0).toUpperCase() + value.slice(1);
}


