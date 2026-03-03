const { SlashCommandBuilder } = require('discord.js');
const { buildActionEmbed } = require('../../utils/gifAction');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('slap')
        .setDescription('Tát ai đó')
        .addUserOption(opt => opt.setName('user').setDescription('Người bạn muốn tát').setRequired(false)),
    prefix: { name: 'slap', aliases: ['tat'], description: 'Tát ai đó' },
    async execute(interaction) {
        const target = interaction.options.getUser('user');
        const embed = buildActionEmbed('slap', interaction.user, target);
        await interaction.reply({ embeds: [embed] });
    }
};
