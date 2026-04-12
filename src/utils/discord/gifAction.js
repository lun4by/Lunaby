const { EmbedBuilder } = require('discord.js');
const emojis = require('../../config/emojis');

const ACTION_MESSAGES = {
    pat: { verb: 'xoa đầu', emoji: emojis.gifActions.pat, color: 0xFFD700, selfMsg: 'tự xoa đầu mình' },
    hug: { verb: 'ôm', emoji: emojis.gifActions.hug, color: 0xFF69B4, selfMsg: 'tự ôm mình' },
    slap: { verb: 'tát', emoji: emojis.gifActions.slap, color: 0xFF4500, selfMsg: 'tự tát mình' },
    punch: { verb: 'đấm', emoji: emojis.gifActions.punch, color: 0xDC143C, selfMsg: 'tự đấm mình' },
    kiss: { verb: 'hôn', emoji: emojis.gifActions.kiss, color: 0xFF1493, selfMsg: 'hôn gió' },
    poke: { verb: 'chọc', emoji: emojis.gifActions.poke, color: 0x00CED1, selfMsg: 'tự chọc mình' },
};

const GIF_VARIANTS_PER_ACTION = 5;

function resolveDisplayName(userLike) {
    return userLike?.displayName || userLike?.globalName || userLike?.username || 'Unknown';
}

function getRandomGif(action) {
    if (!ACTION_MESSAGES[action]) return null;
    const randomNum = Math.floor(Math.random() * GIF_VARIANTS_PER_ACTION) + 1;
    return `https://cdn.lunie.dev/Lunaby/gif/${action}/${randomNum}.gif`;
}

function buildActionEmbed(action, sender, target, interaction) {
    const info = ACTION_MESSAGES[action];
    if (!info) return null;

    const gifUrl = getRandomGif(action);

    let description;
    const senderName = resolveDisplayName(sender);
    if (!target || target.id === sender.id) {
        description = `${info.emoji} ${interaction.t(`commands.fun.self_${action}`, { sender: senderName })}`;
    } else {
        description = `${info.emoji} ${interaction.t(`commands.fun.target_${action}`, { sender: senderName, target: resolveDisplayName(target) })}`;
    }

    const embed = new EmbedBuilder()
        .setColor(info.color)
        .setDescription(description);

    if (gifUrl) {
        embed.setImage(gifUrl);
    }

    embed.setTimestamp();

    return embed;
}

module.exports = { buildActionEmbed, getRandomGif, ACTION_MESSAGES };
