const { AttachmentBuilder } = require('discord.js');
const { LevelUp } = require('lunaby-canvas');
const logger = require('../../utils/logger');

async function generateLevelUpCard(user, oldLevel, newLevel) {
    try {
        const card = new LevelUp()
            .setAvatar(user.displayAvatarURL({ extension: 'png', size: 512 }))
            .setUsername(user.username.toUpperCase(), '#ffffff')
            .setLevels(oldLevel, newLevel)
            .setAvatarBorder('#2b2d31')
            .setBackground('color', '#1e1f22');

        const buffer = await card.build();
        return new AttachmentBuilder(buffer, { name: 'levelup.png' });
    } catch (err) {
        logger.error('levelup_canvas', 'Failed to build LevelUp canvas:', err);
        throw err;
    }
}

module.exports = { generateLevelUpCard };