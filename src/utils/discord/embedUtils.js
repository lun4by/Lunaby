const { EmbedBuilder } = require('discord.js');

const COLORS = {
    LUNABY: 0x1ABC9C,
};

function createLunabyEmbed() {
    return new EmbedBuilder()
        .setColor(COLORS.LUNABY)
        .setTimestamp();
}

module.exports = {
    COLORS,
    createLunabyEmbed,
};