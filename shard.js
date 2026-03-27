require('dotenv').config();
const { ShardingManager } = require('discord.js');
const logger = require('./src/utils/logger.js');

const manager = new ShardingManager('./src/index.js', {
    token: process.env.DISCORD_TOKEN,
    totalShards: 'auto',
});

manager.on('shardCreate', (shard) => {
    logger.info('SHARD', `Shard ${shard.id} đang khởi tạo...`);

    shard.on('ready', () => {
        logger.info('SHARD', `Shard ${shard.id} đã sẵn sàng!`);
    });

    shard.on('disconnect', () => {
        logger.warn('SHARD', `Shard ${shard.id} đã mất kết nối.`);
    });

    shard.on('reconnecting', () => {
        logger.info('SHARD', `Shard ${shard.id} đang kết nối lại...`);
    });

    shard.on('death', (process) => {
        logger.error('SHARD', `Shard ${shard.id} đã chết với exit code ${process.exitCode}`);
    });
});

manager.spawn().catch((error) => {
    logger.error('SHARD', 'Không thể khởi tạo shards:', error);
});