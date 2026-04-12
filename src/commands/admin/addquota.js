const { SlashCommandBuilder } = require('discord.js');
const QuotaService = require('../../services/user/QuotaService');
const logger = require('../../utils/logger');
const emojis = require('../../config/emojis.js');
const { isSlashCommandInteraction } = require('../../utils/hybridCommand');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('addquota')
        .setDescription('Thêm hoặc bớt lượt sử dụng Lunaby Pro cho một người dùng (Admin Only)')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('Người dùng cần thay đổi lượt Lunaby Pro')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('amount')
                .setDescription('Số lượt Lunaby Pro muốn cộng thêm (dùng số âm để trừ đi)')
                .setRequired(true)),

    prefix: { name: 'addquota', aliases: ['givequota', 'setquota'], description: 'Thêm/bớt quota cho user', adminOnly: true },
    cooldown: 5,

    async execute(interaction) {
        const isSlash = isSlashCommandInteraction(interaction);

        const targetUser = isSlash
            ? interaction.options.getUser('user')
            : interaction.message?.mentions?.users?.first();

        const amountRaw = isSlash
            ? interaction.options.getInteger('amount')
            : interaction.args?.find(a => !a.match(/^<@!?\d+>$/));

        if (!targetUser || amountRaw === undefined || amountRaw === null) {
            const PrefixDB = require('../../services/database/PrefixDB');
            const prefix = await PrefixDB.resolvePrefix(interaction.user?.id, interaction.guild?.id);
            return interaction.reply(`${emojis.error} ${interaction.t('commands.admin.addquota.usage', { prefix })}`);
        }

        const amount = parseInt(amountRaw, 10);
        if (Number.isNaN(amount)) {
            return interaction.reply(`${emojis.error} ${interaction.t('commands.admin.addquota.invalid_amount')}`);
        }

        try {
            const beforeStats = await QuotaService.getUserMessageStats(targetUser.id);
            if (beforeStats.limits.period === -1) {
                return interaction.reply({
                    content: `${emojis.error} ${interaction.t('commands.admin.addquota.unlimited_owner', { tag: targetUser.tag })}`,
                    ephemeral: true
                });
            }

            await QuotaService.addQuota(targetUser.id, amount);
            const afterStats = await QuotaService.getUserMessageStats(targetUser.id);

            const actionWord = amount >= 0 ? interaction.t('commands.admin.addquota.success_add') : interaction.t('commands.admin.addquota.success_sub');
            const oldLimitText = beforeStats.limits.period === -1 ? '∞' : beforeStats.limits.period;
            const newLimitText = afterStats.limits.period === -1 ? '∞' : afterStats.limits.period;
            const remainingText = afterStats.remaining.messages === -1 ? '∞' : afterStats.remaining.messages;

            await interaction.reply(
                `${emojis.success} ${interaction.t('commands.admin.addquota.success_msg', {
                    action: actionWord,
                    amount: Math.abs(amount),
                    userId: targetUser.id,
                    userTag: targetUser.tag,
                    oldLimit: oldLimitText,
                    newLimit: newLimitText,
                    usage: afterStats.usage.current,
                    remaining: remainingText,
                })}`
            );
        } catch (error) {
            logger.error('admin', 'Error in addquota command:', error);
            await interaction.reply({
                content: `${emojis.error} ${interaction.t('commands.admin.addquota.error')}`,
                ephemeral: true
            });
        }
    }
};
