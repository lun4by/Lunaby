const { SlashCommandBuilder } = require('discord.js');
const { buildActionEmbed } = require('../../utils/gifAction');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('punch')
        .setDescription('Đấm ai đó')
        .addUserOption(opt => opt.setName('user').setDescription('Người bạn muốn đấm').setRequired(false)),
    prefix: { name: 'punch', aliases: ['dam'], description: 'Đấm ai đó' },
    async execute(interaction) {
        const target = interaction.options.getUser('user');
        const embed = buildActionEmbed('punch', interaction.user, target);
        await interaction.reply({ embeds: [embed] });
    }
};
