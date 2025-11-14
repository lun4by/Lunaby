const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const ConversationService = require('../../services/ConversationService.js');
const { logModAction } = require('../../utils/modUtils.js');
const { sendModLog, createModActionEmbed } = require('../../utils/modLogUtils.js');
const { handlePermissionError } = require('../../utils/permissionUtils.js');
const logger = require('../../utils/logger.js');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('ban')
		.setDescription('Cấm một người dùng khỏi server')
		.addUserOption((option) =>
			option.setName('user').setDescription('Người dùng cần cấm').setRequired(true),
		)
		.addStringOption((option) =>
			option.setName('reason').setDescription('Lý do cấm').setRequired(false),
		)
		.addIntegerOption((option) =>
			option
				.setName('days')
				.setDescription('Số ngày tin nhắn cần xóa (0-7)')
				.setMinValue(0)
				.setMaxValue(7)
				.setRequired(false),
		)
		.setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

	async execute(interaction) {
		if (!interaction.member.permissions.has(PermissionFlagsBits.BanMembers)) {
			return interaction.reply({
				content: 'Bạn không có quyền sử dụng lệnh này!',
				ephemeral: true,
			});
		}

		const targetUser = interaction.options.getUser('user');
		const targetMember = interaction.options.getMember('user');
		const reason =
			interaction.options.getString('reason') ||
			'Không có lý do cụ thể';
		const deleteMessageDays = interaction.options.getInteger('days') || 1;

		if (targetMember && !targetMember.bannable) {
			return interaction.reply({
				content: 'Không thể cấm người dùng này!',
				ephemeral: true,
			});
		}

		await interaction.deferReply();

		try {
			const prompts = require('../../config/prompts.js');
			const prompt = prompts.moderation.ban
				.replace('${username}', targetUser.username)
				.replace('${reason}', reason);

			const aiResponse = await ConversationService.getCompletion(prompt);

			const banEmbed = new EmbedBuilder()
				.setColor(0xff0000)
				.setTitle('🔨 Cấm thành công')
				.setDescription(aiResponse)
				.addFields(
					{
						name: 'Lý do',
						value: reason,
						inline: true,
					},
					{
						name: 'Xóa tin nhắn',
						value: `${deleteMessageDays} ngày`,
						inline: true,
					},
					{
						name: 'Moderator',
						value: interaction.user.tag,
						inline: true,
					},
				)
				.setFooter({
					text: `Được thực hiện bởi ${interaction.user.tag}`,
				})
				.setTimestamp();

			// Ban the user
			await interaction.guild.members.ban(targetUser, {
				deleteMessageDays: deleteMessageDays,
				reason: `${reason} - Bởi ${interaction.user.tag}`,
			});

			// Log the action
			await logModAction({
				guildId: interaction.guild.id,
				targetId: targetUser.id,
				moderatorId: interaction.user.id,
				action: 'ban',
				reason: reason,
			});

			try {
				await interaction.editReply({ embeds: [banEmbed] });
			} catch (error) {
				if (error.code === 50013 || error.message.includes('permission')) {
					await handlePermissionError(
						interaction,
						'embedLinks',
						interaction.user.username,
						'editReply',
					);
				} else {
					throw error;
				}
			}

			const logEmbed = createModActionEmbed({
				title: '🔨 Cấm thành công',
				description: `Đã cấm ${targetUser.tag} khỏi server.`,
				color: 0xff0000,
				fields: [
					{
						name: 'Người dùng',
						value: `${targetUser.tag}`,
						inline: true,
					},
					{
						name: 'ID người dùng',
						value: targetUser.id,
						inline: true,
					},
					{
						name: 'Moderator',
						value: `${interaction.user.tag} (<@${interaction.user.id}>)`,
						inline: true,
					},
					{
						name: 'Lý do',
						value: reason,
						inline: false,
					},
					{
						name: 'Xóa tin nhắn',
						value: `${deleteMessageDays} ngày`,
						inline: true,
					},
					{
						name: 'Ngày',
						value: `<t:${Math.floor(Date.now() / 1000)}:F>`,
						inline: false,
					},
				],
				footer: `Server: ${interaction.guild.name}`,
			});

			await sendModLog(interaction.guild, logEmbed, true);

			try {
				const dmEmbed = new EmbedBuilder()
					.setColor(0xff0000)
					.setTitle(
						`Bạn đã bị cấm tại ${interaction.guild.name}`,
					)
					.setDescription(
						`Lý do: ${reason}`,
					)
					.setFooter({
						text: 'Nếu bạn cho rằng đây là sai lầm, hãy liên hệ ban quản trị server.',
					})
					.setTimestamp();

				await targetUser.send({ embeds: [dmEmbed] });
			} catch (error) {
				logger.error(
					'MODERATION',
					`Không thể gửi DM cho ${targetUser.tag}`,
				);
			}
		} catch (error) {
			logger.error(
				'MODERATION',
				`Lỗi khi cấm ${targetUser.tag}: ${error.message}`,
			);
			await interaction.editReply({
				content: `Đã xảy ra lỗi khi cấm ${targetUser.tag}: ${error.message}`,
				ephemeral: true,
			});
		}
	},
};
