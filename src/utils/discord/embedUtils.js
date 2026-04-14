const { EmbedBuilder } = require('discord.js');

const { createEmbed } = require('./builderFactory');
const COLORS = {
    LUNABY: 0x1ABC9C,
};

function createLunabyEmbed() {
    return createEmbed()
        .setColor(COLORS.LUNABY)
        .setTimestamp();
}

module.exports = {
    COLORS,
    createLunabyEmbed,
};