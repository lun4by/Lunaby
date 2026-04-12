require('dotenv').config({ quiet: true });
const { ShardingManager } = require('discord.js');
const logger = require('./src/utils/core/logger.js');

const manager = new ShardingManager('./src/index.js', {
    token: process.env.DISCORD_TOKEN,
    totalShards: 'auto',
});

manager.on('shardCreate', (shard) => {
    logger.info('shard', `Shard ${shard.id} đang khởi tạo...`);

    shard.on('ready', () => {
        logger.info('shard', `Shard ${shard.id} đã sẵn sàng!`);
    });

    shard.on('disconnect', () => {
        logger.warn('shard', `Shard ${shard.id} đã mất kết nối.`);
    });

    shard.on('reconnecting', () => {
        logger.info('shard', `Shard ${shard.id} đang kết nối lại...`);
    });

    shard.on('death', (process) => {
        logger.error('shard', `Shard ${shard.id} đã chết với exit code ${process.exitCode}`);
    });
});

manager.spawn().catch((error) => {
    logger.error('shard', 'Không thể khởi tạo shards:', error);
});
