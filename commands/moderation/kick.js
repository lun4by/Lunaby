const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const ConversationService = require('../../services/ConversationService.js');
const { logModAction } = require('../../utils/modUtils.js');
const { sendModLog, createModActionEmbed } = require('../../utils/modLogUtils.js');
const { handlePermissionError } = require('../../utils/permissionUtils.js');
const logger = require('../../utils/logger.js');
const prompts = require('../../config/prompts.js');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('kick')
		.setDescription('Đuổi một thành viên khỏi server')
		.addUserOption(option =>
			option.setName('user').setDescription('Thành viên cần đuổi').setRequired(true)
		)
		.addStringOption(option =>
			option.setName('reason').setDescription('Lý do đuổi').setRequired(false)
		)
		.setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),

	async execute(interaction) {
		if (!interaction.member.permissions.has(PermissionFlagsBits.KickMembers)) {
			return interaction.reply({
				content: 'Bạn không có quyền sử dụng lệnh này!',
				ephemeral: true,
			});
		}

		const targetUser = interaction.options.getUser('user');
		const targetMember = interaction.options.getMember('user');

		if (!targetMember) {
			return interaction.reply({
				content: 'Không tìm thấy thành viên này!',
				ephemeral: true,
			});
		}

		const reason = interaction.options.getString('reason')?.trim() || 'Không có lý do cụ thể';

		if (!targetMember.kickable) {
			return interaction.reply({
				content: 'Không thể đuổi thành viên này!',
				ephemeral: true,
			});
		}

		await interaction.deferReply();

		try {
			const prompt = prompts.moderation.kick
				.replace('${username}', targetUser.username)
				.replace('${reason}', reason);

			const aiResponse = await ConversationService.getCompletion(prompt);

			const kickEmbed = new EmbedBuilder()
				.setColor(0xffa500)
				.setTitle('👢 Đuổi thành công')
				.setDescription(aiResponse)
				.addFields(
					{ name: 'Người dùng', value: targetUser.tag, inline: true },
					{ name: 'ID', value: targetUser.id, inline: true },
					{ name: 'Lý do', value: reason, inline: false },
					{ name: 'Moderator', value: interaction.user.tag, inline: true },
					{ name: 'Ngày', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
				)
				.setFooter({ text: `Được thực hiện bởi ${interaction.user.tag}` })
				.setTimestamp();

			await targetMember.kick(reason);

			await logModAction({
				guildId: interaction.guild.id,
				targetId: targetUser.id,
				moderatorId: interaction.user.id,
				action: 'kick',
				reason,
			});

			try {
				await interaction.editReply({ embeds: [kickEmbed] });
			} catch (error) {
				if (error.code === 50013 || error.message.includes('permission')) {
					await handlePermissionError(interaction, 'embedLinks', interaction.user.username, 'editReply');
				} else {
					throw error;
				}
			}

			const logEmbed = createModActionEmbed({
				title: '👢 Đuổi thành công',
				description: `Đã đuổi ${targetUser.tag} khỏi server.`,
				color: 0xffa500,
				fields: [
					{ name: 'Người dùng', value: targetUser.tag, inline: true },
					{ name: 'ID', value: targetUser.id, inline: true },
					{ name: 'Moderator', value: `${interaction.user.tag} (<@${interaction.user.id}>)`, inline: true },
					{ name: 'Lý do', value: reason, inline: false },
					{ name: 'Ngày', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false },
				],
				footer: `Server: ${interaction.guild.name}`,
			});

			await sendModLog(interaction.guild, logEmbed, true);
		} catch (error) {
			logger.error('MODERATION', `Lỗi khi đuổi ${targetUser.tag}: ${error.message}`);
			await interaction.editReply({
				content: `Đã xảy ra lỗi khi đuổi ${targetUser.tag}: ${error.message}`,
			});
		}
	},
};
