const { SlashCommandBuilder } = require('discord.js');
const { buildActionEmbed } = require('../../utils/gifAction');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('kiss')
        .setDescription('Hôn ai đó')
        .addUserOption(opt => opt.setName('user').setDescription('Người bạn muốn hôn').setRequired(false)),
    prefix: { name: 'kiss', aliases: ['hon'], description: 'Hôn ai đó' },
    async execute(interaction) {
        const target = interaction.options.getUser('user');
        const embed = buildActionEmbed('kiss', interaction.user, target);
        await interaction.reply({ embeds: [embed] });
    }
};
