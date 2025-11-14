const { AttachmentBuilder } = require('discord.js');
const { RankCardBuilder, Font } = require('canvacord');

Font.loadDefault();

const generateRankCard = async (member, author, level, xp, mlvlcap, maxXPThisLevel, curXPThisLevel, percentage, rank, wreathUrl, profileCustomization = {}) => {
    // const canvas = Canvas.createCanvas(800, 600);
    // const ctx = canvas.getContext('2d');

    const {
        background = null,
        color = '#ff69b4'
    } = profileCustomization;

    const card = new RankCardBuilder()
        .setAvatar(author.displayAvatarURL({ extension: 'png', size: 512 }))
        .setUsername(member.displayName)
        .setDisplayName(author.tag)
        .setCurrentXP(curXPThisLevel)
        .setRequiredXP(maxXPThisLevel)
        .setLevel(level)
        .setRank(rank || 0)
        .setStatus(member.presence?.status || 'offline');

    if (background) {
        card.setBackground(background);
    }


    const image = await card.build({ format: 'png' });

    return new AttachmentBuilder(image, { name: 'rank.png' });
};

module.exports = generateRankCard;