const { EmbedBuilder } = require('discord.js');

// Pre-defined GIF URLs for each action (anime style)
const GIF_LIBRARY = {
    pat: [
        'https://media.tenor.com/WJkDJfDP34UAAAAC/anime-pat.gif',
        'https://media.tenor.com/N41zMy5GXHQAAAAC/anime-pat-anime-patting.gif',
        'https://media.tenor.com/FMm7FhLOoEsAAAAC/head-pat.gif',
        'https://media.tenor.com/VqZfmgYlZIIAAAAC/head-pats-anime.gif',
        'https://media.tenor.com/E6fMkQRZBhMAAAAC/anime-pat.gif',
    ],
    hug: [
        'https://media.tenor.com/9e1aE_xBLCsAAAAC/anime-hug.gif',
        'https://media.tenor.com/l-yCBGKZii8AAAAC/anime-hug.gif',
        'https://media.tenor.com/evlLE_JZ2yIAAAAC/anime-hug.gif',
        'https://media.tenor.com/kBGhsJ0s6_sAAAAC/hug-anime.gif',
        'https://media.tenor.com/F_rdSX1fkm0AAAAC/anime-hug.gif',
    ],
    slap: [
        'https://media.tenor.com/Ws6Dm1ZW_vMAAAAC/anime-slap.gif',
        'https://media.tenor.com/rVXByOJInSsAAAAC/anime-slap.gif',
        'https://media.tenor.com/BQQU6qdByIkAAAAC/slap-anime.gif',
        'https://media.tenor.com/Rgjidmu7u38AAAAC/anime-slap.gif',
        'https://media.tenor.com/p-W0AokU9lkAAAAC/anime-slap.gif',
    ],
    punch: [
        'https://media.tenor.com/PFDKZ0qU3uoAAAAC/anime-punch.gif',
        'https://media.tenor.com/WKMGeE4OwB4AAAAC/punch-anime.gif',
        'https://media.tenor.com/uGEv1WMoHRgAAAAC/anime-fight.gif',
        'https://media.tenor.com/p5b7CJPIZ8YAAAAC/saitama-punch.gif',
        'https://media.tenor.com/D5JsgA0EREQAAAAC/anime-punch.gif',
    ],
    kiss: [
        'https://media.tenor.com/MYbSB7PzVbUAAAAC/anime-kiss.gif',
        'https://media.tenor.com/0Ht4G6dCEesAAAAC/anime-kiss.gif',
        'https://media.tenor.com/b3DRiPeFPpEAAAAC/anime-kiss.gif',
        'https://media.tenor.com/w4djHnfm-GIAAAAC/anime-kiss.gif',
        'https://media.tenor.com/2oXBOmZlbssAAAAC/anime-kiss.gif',
    ],
    poke: [
        'https://media.tenor.com/7Ow1VNneV5IAAAAC/anime-poke.gif',
        'https://media.tenor.com/VuQd0pKJoOYAAAAC/anime-poke.gif',
        'https://media.tenor.com/DUKUhaiMpOAAAAAC/poke-anime.gif',
        'https://media.tenor.com/M2x9gQRsPzwAAAAC/anime-poke.gif',
        'https://media.tenor.com/xbW95aY3dlgAAAAC/poke-anime.gif',
    ],
};

const ACTION_MESSAGES = {
    pat: { verb: 'xoa đầu', emoji: '🤗', color: 0xFFD700, selfMsg: 'tự xoa đầu mình' },
    hug: { verb: 'ôm', emoji: '🫂', color: 0xFF69B4, selfMsg: 'tự ôm mình' },
    slap: { verb: 'tát', emoji: '👋', color: 0xFF4500, selfMsg: 'tự tát mình' },
    punch: { verb: 'đấm', emoji: '👊', color: 0xDC143C, selfMsg: 'tự đấm mình' },
    kiss: { verb: 'hôn', emoji: '💋', color: 0xFF1493, selfMsg: 'hôn gió' },
    poke: { verb: 'chọc', emoji: '👉', color: 0x00CED1, selfMsg: 'tự chọc mình' },
};

/**
 * Get a random GIF for the given action.
 */
function getRandomGif(action) {
    const gifs = GIF_LIBRARY[action];
    if (!gifs || gifs.length === 0) return null;
    return gifs[Math.floor(Math.random() * gifs.length)];
}

/**
 * Build a GIF action embed.
 * @param {string} action - pat, hug, slap, punch, kiss, poke
 * @param {User} sender - The user performing the action
 * @param {User|null} target - The target user (can be null for self)
 */
function buildActionEmbed(action, sender, target) {
    const info = ACTION_MESSAGES[action];
    if (!info) return null;

    const gifUrl = getRandomGif(action);

    let description;
    if (!target || target.id === sender.id) {
        description = `${info.emoji} **${sender.displayName || sender.username}** ${info.selfMsg}!`;
    } else {
        description = `${info.emoji} **${sender.displayName || sender.username}** đã ${info.verb} **${target.displayName || target.username}**!`;
    }

    const embed = new EmbedBuilder()
        .setColor(info.color)
        .setDescription(description);

    if (gifUrl) {
        embed.setImage(gifUrl);
    }

    embed.setFooter({ text: 'Lunaby Fun' });

    return embed;
}

module.exports = { buildActionEmbed, getRandomGif, ACTION_MESSAGES, GIF_LIBRARY };
