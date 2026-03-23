const logger = require('../utils/logger');

const DEFAULT_COOLDOWN = 5;
const CLEANUP_INTERVAL = 5 * 60 * 1000;

const cooldowns = new Map();

function check(userId, commandName, cooldownSeconds = DEFAULT_COOLDOWN) {
    const key = `${userId}-${commandName}`;
    const expiresAt = cooldowns.get(key);

    if (expiresAt && Date.now() < expiresAt) {
        const remaining = Math.ceil((expiresAt - Date.now()) / 1000);
        const expiresAtUnix = Math.ceil(expiresAt / 1000);
        return { onCooldown: true, remaining, expiresAtUnix };
    }

    return { onCooldown: false, remaining: 0 };
}

function set(userId, commandName, cooldownSeconds = DEFAULT_COOLDOWN) {
    if (cooldownSeconds <= 0) return;
    const key = `${userId}-${commandName}`;
    cooldowns.set(key, Date.now() + cooldownSeconds * 1000);
}

function cleanup() {
    const now = Date.now();
    let cleaned = 0;
    for (const [key, expiresAt] of cooldowns) {
        if (now >= expiresAt) {
            cooldowns.delete(key);
            cleaned++;
        }
    }
    if (cleaned > 0) {
        logger.debug('COOLDOWN', `Đã dọn dẹp ${cleaned} cooldown hết hạn`);
    }
}

setInterval(cleanup, CLEANUP_INTERVAL);

module.exports = {
    check,
    set,
    cleanup,
    DEFAULT_COOLDOWN,
};