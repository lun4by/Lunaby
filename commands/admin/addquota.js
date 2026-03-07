const { SlashCommandBuilder } = require('discord.js');
const QuotaService = require('../../services/QuotaService');
const { createLunabyEmbed } = require('../../utils/embedUtils');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('addquota')
        .setDescription('Thêm hoặc bớt lượt sử dụng AI cho một người dùng (Admin Only)')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('Người dùng cần thay đổi lượt')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('amount')
                .setDescription('Số lượt muốn cộng thêm (dùng số âm để trừ đi)')
                .setRequired(true)),

    prefix: { name: 'addquota', aliases: ['givequota', 'setquota'], description: 'Thêm/bớt quota cho user', adminOnly: true },

    async execute(interaction) {
        if (!interaction.isCommand || !interaction.isCommand()) {
            return this.executePrefix(interaction.message || interaction, [
                interaction.args[0],
                interaction.args[1]
            ]);
        }

        const targetUser = interaction.options.getUser('user');
        const amount = interaction.options.getInteger('amount');

        await this.handleQuotaChange(interaction, targetUser, amount);
    },

    async executePrefix(message, args) {
        if (!args || args.length < 2) {
            return message.reply(`**Cách dùng:** \`e.addquota @user <số_lượng>\``);
        }

        const targetUser = message.mentions.users.first() || await message.client.users.fetch(args[0]).catch(() => null);
        if (!targetUser) {
            return message.reply('Không tìm thấy người dùng này.');
        }

        const amount = parseInt(args[1]);
        if (isNaN(amount)) {
            return message.reply('Số lượng phải là một con số hợp lệ.');
        }

        await this.handleQuotaChange(message, targetUser, amount);
    },

    async handleQuotaChange(interactionOrMessage, targetUser, amount) {
        const isInteraction = interactionOrMessage.isCommand && interactionOrMessage.isCommand();
        const replyFunc = isInteraction ? (data) => interactionOrMessage.reply(data) : (data) => interactionOrMessage.reply(data);

        try {
            const beforeStats = await QuotaService.getUserMessageStats(targetUser.id);
            if (beforeStats.limits.period === -1) {
                return replyFunc({ content: `**${targetUser.tag}** hiện đang có quyền sử dụng vô hạn (Owner/Admin) nên không cần cộng thêm.`, ephemeral: true });
            }
            await QuotaService.addQuota(targetUser.id, amount);

            const afterStats = await QuotaService.getUserMessageStats(targetUser.id);

            const actionWord = amount >= 0 ? 'Cộng thêm' : 'Trừ đi';
            const color = amount >= 0 ? 0x2ECC71 : 0xE74C3C;

            const embed = createLunabyEmbed()
                .setTitle('✨ Cập nhật Quota thành công')
                .setColor(color)
                .setDescription(`${actionWord} **${Math.abs(amount)} lượt** cho người dùng <@${targetUser.id}>.`)
                .addFields(
                    { name: '👤 Người dùng', value: targetUser.tag, inline: true },
                    { name: '📊 Lượt cũ', value: `${beforeStats.limits.period} lượt`, inline: true },
                    { name: '📈 Lượt mới', value: `${afterStats.limits.period} lượt`, inline: true },
                    { name: '📉 Đã dùng', value: `${afterStats.usage.current} lượt`, inline: true },
                    { name: '✅ Còn lại', value: `${afterStats.remaining.messages} lượt`, inline: true }
                );

            await replyFunc({ embeds: [embed] });
        } catch (error) {
            console.error('Error in addquota command:', error);
            await replyFunc({ content: '❌ Đã xảy ra lỗi khi cập nhật Quota cho người dùng này.', ephemeral: true });
        }
    }
};