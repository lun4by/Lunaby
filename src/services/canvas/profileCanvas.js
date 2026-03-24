const { AttachmentBuilder } = require('discord.js');
const { Profile } = require('lunaby-canvas');
const logger = require('../../utils/logger.js');

async function generateProfileCard(data) {
    const { user, profile = {} } = data;
    
    const theme = profile.color || '#9B59B6';

    const profileCard = new Profile()
        .setUser(user.id)
        .setBorder(theme);
        
    try {
        const buffer = await profileCard.build();
        return new AttachmentBuilder(buffer, { name: 'profile.png' });
    } catch (err) {
        logger.error('PROFILE_CANVAS', 'Failed to build profile:', err);
        throw err;
    }
}

module.exports = {
    generateProfileCard
};