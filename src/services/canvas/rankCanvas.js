const { AttachmentBuilder } = require('discord.js');
const { Rank } = require('lunaby-canvas');

const generateRankCard = async ({ member, author, level, rank, currentXp, requiredXp, profileCustomization = {} }) => {
    const {
        background = null,
        color = '#ff69b4'
    } = profileCustomization;

    const rankObj = new Rank()
        .setAvatar(author.displayAvatarURL({ extension: 'png', size: 512 }))
        .setUsername(member.displayName)
        .setCurrentXp(currentXp)
        .setRequiredXp(requiredXp)
        .setLevel(level, "LVL")
        .setRank(rank || 0, "RANK")
        .setStatus(member.presence?.status || 'offline')
        .setBarColor(color);

    if (background) {
        rankObj.setBackground("image", background);
    }

    const image = await rankObj.build();

    return new AttachmentBuilder(image, { name: 'rank.png' });
};

module.exports = generateRankCard;