const { EmbedBuilder } = require('discord.js');

const ACTION_MESSAGES = {
    pat: { verb: 'xoa đầu', emoji: '🤗', color: 0xFFD700, selfMsg: 'tự xoa đầu mình' },
    hug: { verb: 'ôm', emoji: '🫂', color: 0xFF69B4, selfMsg: 'tự ôm mình' },
    slap: { verb: 'tát', emoji: '👋', color: 0xFF4500, selfMsg: 'tự tát mình' },
    punch: { verb: 'đấm', emoji: '👊', color: 0xDC143C, selfMsg: 'tự đấm mình' },
    kiss: { verb: 'hôn', emoji: '💋', color: 0xFF1493, selfMsg: 'hôn gió' },
    poke: { verb: 'chọc', emoji: '👉', color: 0x00CED1, selfMsg: 'tự chọc mình' },
};

function getRandomGif(action) {
    if (!ACTION_MESSAGES[action]) return null;
    const randomNum = Math.floor(Math.random() * 5) + 1; // 1 to 5
    return `https://cdn.lunie.dev/Lunaby/gif/${action}/${randomNum}.gif`;
}

function buildActionEmbed(action, sender, target, interaction) {
    const info = ACTION_MESSAGES[action];
    if (!info) return null;

    const gifUrl = getRandomGif(action);

    let description;
    if (!target || target.id === sender.id) {
        description = `${info.emoji} ${interaction.t(`commands.fun.self_${action}`, { sender: sender.displayName || sender.username })}`;
    } else {
        description = `${info.emoji} ${interaction.t(`commands.fun.target_${action}`, { sender: sender.displayName || sender.username, target: target.displayName || target.username })}`;
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