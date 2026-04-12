const { AttachmentBuilder } = require('discord.js');
const { Top } = require('lunaby-canvas');
const logger = require('../../utils/core/logger');

async function generateLeaderboardCard(usersData) {
    try {
        const topCard = new Top()
            .setUsersData(usersData)
            .setScoreMessage("XP:")
            .setabbreviateNumber(true)
            .setOpacity(0.6)
            .setColors({
                box: '#2b2d31',
                username: '#ffffff',
                score: '#ffffff',
                firstRank: '#f1c40f',
                secondRank: '#95a5a6',
                thirdRank: '#cd7f32'
            })
            .setBackground("color", "#1e1f22");

        const buffer = await topCard.build();
        return new AttachmentBuilder(buffer, { name: 'leaderboard.png' });
    } catch (err) {
        logger.error('leaderboard_canvas', 'Failed to build leaderboard canvas:', err);
        throw err;
    }
}

module.exports = {
    generateLeaderboardCard
};
