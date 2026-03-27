const { SlashCommandBuilder } = require('discord.js');
const QuotaService = require('../../services/user/QuotaService');
const { createLunabyEmbed } = require('../../utils/embedUtils');
const logger = require('../../utils/logger');
const emojis = require('../../config/emojis.js');

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
    cooldown: 5,

    async execute(interaction) {
        const isSlash = interaction.isCommand && interaction.isCommand();
        
        const targetUser = isSlash 
            ? interaction.options.getUser('user') 
            : interaction.message?.mentions?.users?.first();
            
        let amountRaw = isSlash 
            ? interaction.options.getInteger('amount') 
            : interaction.args?.find(a => !a.match(/^<@!?\d+>$/));
            
        if (!targetUser || amountRaw === undefined || amountRaw === null) {
            const PrefixDB = require('../../services/database/PrefixDB');
            const prefix = await PrefixDB.resolvePrefix(interaction.user?.id, interaction.guild?.id);
            return interaction.reply(`${emojis.error} **Cách dùng:** \`${prefix}addquota @user <số_lượng>\``);
        }

        const amount = parseInt(amountRaw);
        if (isNaN(amount)) {
            return interaction.reply(`${emojis.error} Số lượng phải là một con số hợp lệ.`);
        }

        try {
            const beforeStats = await QuotaService.getUserMessageStats(targetUser.id);
            if (beforeStats.limits.period === -1) {
                return interaction.reply({ content: `${emojis.error} **${targetUser.tag}** hiện đang có quyền sử dụng vô hạn (Owner/Admin) nên không cần cộng thêm.`, ephemeral: true });
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
                    { name: `${emojis.success} Còn lại`, value: `${afterStats.remaining.messages} lượt`, inline: true }
                );

            await interaction.reply({ embeds: [embed] });
        } catch (error) {
            logger.error('ADMIN', 'Error in addquota command:', error);
            await interaction.reply({ content: `${emojis.error} Đã xảy ra lỗi khi cập nhật Quota cho người dùng này.`, ephemeral: true });
        }
    }
};
