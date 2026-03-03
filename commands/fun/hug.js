const { SlashCommandBuilder } = require('discord.js');
const { buildActionEmbed } = require('../../utils/gifAction');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('hug')
        .setDescription('Ôm ai đó')
        .addUserOption(opt => opt.setName('user').setDescription('Người bạn muốn ôm').setRequired(false)),
    prefix: { name: 'hug', aliases: ['om'], description: 'Ôm ai đó' },
    async execute(interaction) {
        const target = interaction.options.getUser('user');
        const embed = buildActionEmbed('hug', interaction.user, target);
        await interaction.reply({ embeds: [embed] });
    }
};
