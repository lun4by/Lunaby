const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const TokenService = require('../../services/TokenService.js');
const logger = require('../../utils/logger.js');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('quota')
		.setDescription('Xem giới hạn tin nhắn của bạn')
		.addUserOption((option) =>
			option
				.setName('user')
				.setDescription('Xem quota của người dùng khác (chỉ Owner)')
				.setRequired(false),
		),

	async execute(interaction) {
		try {
			await interaction.deferReply({ ephemeral: true });

			const targetUser = interaction.options.getUser('user');
			const ownerId = process.env.OWNER_ID;

			if (targetUser && interaction.user.id !== ownerId) {
				return interaction.editReply({
					content: '❌ Chỉ Owner mới có thể xem quota của người khác!',
					ephemeral: true,
				});
			}

			const userToCheck = targetUser || interaction.user;
			const stats = await TokenService.getUserMessageStats(userToCheck.id);

			const isUnlimited = stats.limits?.period === -1;
			const currentUsage = stats.usage?.current || 0;
			const periodLimit = stats.limits?.period || 600;
			const totalUsage = stats.usage?.total || 0;
			const remainingMessages = stats.remaining?.messages || 0;
			const remainingDays = stats.remaining?.days || 0;
			
			const percentUsed = isUnlimited ? 0 : Math.round((currentUsage / periodLimit) * 100);
			const progressBar = createProgressBar(percentUsed);

			const embed = new EmbedBuilder()
				.setTitle(`📊 Giới hạn Tin nhắn`)
				.setDescription(userToCheck.id === interaction.user.id ? 'Thông tin quota của bạn' : `Thông tin quota của ${userToCheck.username}`)
				.setColor(percentUsed > 80 ? '#ff0000' : percentUsed > 50 ? '#ff9900' : '#00ff00')
				.setThumbnail(userToCheck.displayAvatarURL())
				.addFields(
					{
						name: '💬 Đã sử dụng',
						value: `**${currentUsage.toLocaleString()}** / ${isUnlimited ? '∞' : periodLimit.toLocaleString()} tin nhắn`,
						inline: false,
					},
					{
						name: '📈 Tiến độ',
						value: isUnlimited ? '∞ Không giới hạn' : `${progressBar} ${percentUsed}%`,
						inline: false,
					},
					{
						name: '✨ Còn lại',
						value: isUnlimited ? '∞ Không giới hạn' : `**${remainingMessages.toLocaleString()}** tin nhắn`,
						inline: true,
					},
					{
						name: '⏰ Reset sau',
						value: isUnlimited ? 'Không cần' : `**${remainingDays}** ngày`,
						inline: true,
					},
					{
						name: '📅 Chu kỳ',
						value: '30 ngày',
						inline: true,
					},
					{
						name: '📊 Tổng đã dùng',
						value: `**${totalUsage.toLocaleString()}** tin nhắn`,
						inline: true,
					}
				)
				.setFooter({ text: `User ID: ${userToCheck.id}` })
				.setTimestamp();

			await interaction.editReply({ embeds: [embed] });
		} catch (error) {
			logger.error('QUOTA', 'Lỗi khi lấy thống kê quota:', error);
			await interaction.editReply({
				content: `❌ Lỗi khi lấy thống kê: ${error.message}`,
				ephemeral: true,
			});
		}
	},
};

function createProgressBar(percent) {
	const filled = Math.round(percent / 10);
	const empty = 10 - filled;
	return '█'.repeat(filled) + '░'.repeat(empty);
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





