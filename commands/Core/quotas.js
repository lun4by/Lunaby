const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const TokenService = require('../../services/TokenService.js');
const logger = require('../../utils/logger.js');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('quotas')
		.setDescription('Xem thống kê quotas')
		.addSubcommand((subcommand) =>
			subcommand
				.setName('user')
				.setDescription('Xem thống kê quotas của người dùng')
				.addUserOption((option) =>
					option
						.setName('target')
						.setDescription('Người dùng cần xem (để trống để xem của bạn)')
						.setRequired(false),
			),
		)
		.addSubcommand((subcommand) =>
			subcommand
				.setName('system')
				.setDescription('Xem thống kê hạn quotas toàn hệ thống (Owner/Admin)'),
		),

	async execute(interaction) {
		try {
			await interaction.deferReply({ ephemeral: true });

			const subcommand = interaction.options.getSubcommand();

			if (subcommand === 'user') {
				await handleUserStats(interaction);
			} else {
				await handleSystemStats(interaction);
			}
		} catch (error) {
			logger.error('ADMIN', 'Error while retrieving quota statistics:', error);
			await interaction.editReply({
				content: `Lỗi khi lấy thống kê: ${error.message}`,
				ephemeral: true,
			});
		}
	},
};

async function handleUserStats(interaction) {
	const targetUser = interaction.options.getUser('target') || interaction.user;

    if (interaction.user.id !== ownerId) {
      return interaction.reply({
        content: 'Bạn không có quyền sử dụng lệnh này!',
        ephemeral: true,
      });
    }

	const stats = await TokenService.getUserMessageStats(targetUser.id);
	const roleNames = {
		owner: 'Owner',
		admin: 'Admin',
		helper: 'Helper',
		user: 'User'
	};

	const embed = new EmbedBuilder()
		.setTitle(`Thống kê Quota của ${targetUser.username}`)
		.setColor('#0099ff')
		.setThumbnail(targetUser.displayAvatarURL())
		.addFields(
			{
				name: 'Vai trò',
				value: roleNames[stats.role] || stats.role,
				inline: true,
			},
			{
				name: 'Hạn mức ngày',
				value: formatLimit(stats.limits.daily),
				inline: true,
			},
			{ name: '\u200b', value: '\u200b', inline: true },
			{
				name: 'Hôm nay',
				value: formatUses(stats.usage.daily),
				inline: true,
			},
			{
				name: 'Tuần này',
				value: formatUses(stats.usage.weekly),
				inline: true,
			},
			{
				name: 'Tháng này',
				value: formatUses(stats.usage.monthly),
				inline: true,
			},
			{
				name: 'Tổng cộng',
				value: formatUses(stats.usage.total),
				inline: true,
			},
			{
				name: 'Còn lại hôm nay',
				value: formatLimit(stats.remaining.daily),
				inline: true,
			},
			{ name: '\u200b', value: '\u200b', inline: true },
		)
		.setFooter({ text: `User ID: ${targetUser.id}` })
		.setTimestamp();

	if (stats.recentHistory && stats.recentHistory.length > 0) {
		const historyLines = stats.recentHistory
			.slice(-5)
			.reverse()
			.map((entry) =>
				`${entry.messages.toLocaleString()} - ${entry.operation}`,
			)
			.join('\n');

		embed.addFields({
			name: 'Lịch sử gần đây',
			value: historyLines || 'Chưa có lịch sử',
			inline: false,
		});
	}

	await interaction.editReply({ embeds: [embed] });
}

async function handleSystemStats(interaction) {
	const requesterRole = await TokenService.getUserRole(interaction.user.id);
	if (!['owner', 'admin'].includes(requesterRole)) {
		await interaction.editReply({
			content: 'Bạn không có quyền xem thống kê hệ thống!',
			ephemeral: true,
		});
		return;
	}

	const stats = await TokenService.getSystemStats();
	const roleNames = {
		owner: 'Owner',
		admin: 'Admin',
		helper: 'Helper',
		user: 'User'
	};

	const embed = new EmbedBuilder()
		.setTitle('Thống kê Quota Hệ thống')
		.setColor('#ff9900')
		.addFields(
			{
				name: 'Tổng người dùng',
				value: stats.totalUsers.toLocaleString(),
				inline: true,
			},
			{
				name: roleNames.owner || 'Owner',
				value: stats.byRole.owner.toString(),
				inline: true,
			},
			{
				name: roleNames.admin || 'Admin',
				value: stats.byRole.admin.toString(),
				inline: true,
			},
			{
				name: roleNames.helper || 'Helper',
				value: stats.byRole.helper.toString(),
				inline: true,
			},
			{
				name: roleNames.user || 'User',
				value: stats.byRole.user.toString(),
				inline: true,
			},
			{ name: '\u200b', value: '\u200b', inline: true },
			{
				name: 'Sử dụng ngày',
				value: formatUses(stats.totalMessagesUsed.daily),
				inline: true,
			},
			{
				name: 'Sử dụng tuần',
				value: formatUses(stats.totalMessagesUsed.weekly),
				inline: true,
			},
			{
				name: 'Sử dụng tháng',
				value: formatUses(stats.totalMessagesUsed.monthly),
				inline: true,
			},
			{
				name: 'Tổng sử dụng',
				value: formatUses(stats.totalMessagesUsed.total),
				inline: false,
			},
		)
		.setFooter({
			text: `Yêu cầu bởi ${interaction.user.tag}`,
		})
		.setTimestamp();

	if (stats.topUsers && stats.topUsers.length > 0) {
		const topUsersText = stats.topUsers
			.slice(0, 10)
			.map((user, index) =>
				`${index + 1}. <@${user.userId}>: ${user.daily.toLocaleString()} - ${roleNames[user.role] || user.role}`,
			)
			.join('\n');

		embed.addFields({
			name: 'Top người dùng (Hôm nay)',
			value: topUsersText,
			inline: false,
		});
	}

	await interaction.editReply({ embeds: [embed] });
}

function formatLimit(value) {
	if (value === -1) {
		return 'Không giới hạn';
	}
	return `${value.toLocaleString()} tin nhắn/ngày`;
}

function formatUses(value) {
	return `${value.toLocaleString()} tin nhắn`;
}





