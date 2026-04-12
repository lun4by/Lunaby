const { SlashCommandBuilder } = require('discord.js');
const MariaModDB = require('../../services/database/MariaModDB');
const { loadCommands, getCommandsJson } = require('../../handlers/commandHandler');
const { deployCommandsToGuild } = require('../../handlers/guildHandler');
const logger = require('../../utils/core/logger');
const emojis = require('../../config/emojis');
const {
    createHybridReply,
    deferHybridReply,
    getHybridSubcommand,
    isSlashCommandInteraction,
} = require('../../utils/discord/hybridCommand');

const NON_LOCKABLE_COMMANDS = new Set(['commandctl']);
const MAX_PREVIEW_COMMANDS = 20;

function parseCommandTokens(rawInput) {
    if (!rawInput) return [];
    return rawInput
        .toLowerCase()
        .split(/[\s,]+/)
        .map((name) => name.trim())
        .filter(Boolean);
}

function formatCommandPreview(commandNames) {
    if (!commandNames.length) return '-';
    const preview = commandNames.slice(0, MAX_PREVIEW_COMMANDS).map((name) => `\`${name}\``).join(', ');
    const hiddenCount = commandNames.length - Math.min(commandNames.length, MAX_PREVIEW_COMMANDS);
    if (hiddenCount <= 0) return preview;
    return `${preview} (+${hiddenCount})`;
}

function resolveTargetCommands(rawInput, availableCommands) {
    const normalizedInput = (rawInput || '').trim().toLowerCase();
    const availableSet = new Set(availableCommands);

    let requested = [];
    if (normalizedInput === 'all') {
        requested = availableCommands.filter((name) => !NON_LOCKABLE_COMMANDS.has(name));
    } else {
        const tokens = parseCommandTokens(normalizedInput);
        requested = [...new Set(tokens)].filter((name) => availableSet.has(name) && !NON_LOCKABLE_COMMANDS.has(name));
    }

    return requested;
}

async function reloadCommandsInProcess(client, scope, guildId) {
    const loadedCount = loadCommands(client);
    const commandsJson = getCommandsJson(client);

    let deployed = 0;
    let failed = 0;

    if (scope === 'all') {
        for (const guild of client.guilds.cache.values()) {
            try {
                await deployCommandsToGuild(guild.id, commandsJson, client);
                deployed++;
            } catch (_) {
                failed++;
            }
        }
    } else if (guildId && client.guilds.cache.has(guildId)) {
        try {
            await deployCommandsToGuild(guildId, commandsJson, client);
            deployed = 1;
        } catch (_) {
            failed = 1;
        }
    }

    return {
        shardId: client.shard?.ids?.[0] ?? 0,
        loaded: loadedCount,
        deployed,
        failed,
    };
}

async function reloadCommandsAcrossShards(client, scope, guildId) {
    if (!client.shard?.broadcastEval) {
        return [await reloadCommandsInProcess(client, scope, guildId)];
    }

    return client.shard.broadcastEval(
        async (shardClient, context) => {
            const path = require('path');
            const { loadCommands, getCommandsJson } = require(path.join(process.cwd(), 'src', 'handlers', 'commandHandler'));
            const { deployCommandsToGuild } = require(path.join(process.cwd(), 'src', 'handlers', 'guildHandler'));

            const loadedCount = loadCommands(shardClient);
            const commandsJson = getCommandsJson(shardClient);

            let deployed = 0;
            let failed = 0;

            if (context.scope === 'all') {
                for (const guild of shardClient.guilds.cache.values()) {
                    try {
                        await deployCommandsToGuild(guild.id, commandsJson, shardClient);
                        deployed++;
                    } catch (_) {
                        failed++;
                    }
                }
            } else if (context.guildId && shardClient.guilds.cache.has(context.guildId)) {
                try {
                    await deployCommandsToGuild(context.guildId, commandsJson, shardClient);
                    deployed = 1;
                } catch (_) {
                    failed = 1;
                }
            }

            return {
                shardId: shardClient.shard?.ids?.[0] ?? 0,
                loaded: loadedCount,
                deployed,
                failed,
            };
        },
        { context: { scope, guildId } }
    );
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('commandctl')
        .setDescription('Khóa/mở khóa lệnh bảo trì và reload lệnh runtime')
        .addSubcommand((sub) =>
            sub
                .setName('lock')
                .setDescription('Khóa lệnh để bảo trì')
                .addStringOption((opt) =>
                    opt
                        .setName('commands')
                        .setDescription('Tên lệnh, cách nhau bằng dấu phẩy hoặc "all"')
                        .setRequired(true)
                )
        )
        .addSubcommand((sub) =>
            sub
                .setName('unlock')
                .setDescription('Mở khóa lệnh sau bảo trì')
                .addStringOption((opt) =>
                    opt
                        .setName('commands')
                        .setDescription('Tên lệnh, cách nhau bằng dấu phẩy hoặc "all"')
                        .setRequired(true)
                )
        )
        .addSubcommand((sub) =>
            sub
                .setName('list')
                .setDescription('Xem danh sách lệnh đang bị khóa')
        )
        .addSubcommand((sub) =>
            sub
                .setName('reload')
                .setDescription('Reload command runtime mà không restart shard')
                .addStringOption((opt) =>
                    opt
                        .setName('scope')
                        .setDescription('Phạm vi deploy sau khi reload')
                        .setRequired(false)
                        .addChoices(
                            { name: 'Guild hiện tại', value: 'guild' },
                            { name: 'Toàn bộ guild trên tất cả shard', value: 'all' }
                        )
                )
        ),
    prefix: {
        name: 'commandctl',
        aliases: ['cmdctl', 'cmdlock'],
        description: 'Quản lý khóa/mở khóa/reload command',
        adminOnly: true,
    },
    cooldown: 3,

    async execute(interaction) {
        const isSlash = isSlashCommandInteraction(interaction);
        await deferHybridReply(interaction, { ephemeral: true });

        const replyFn = createHybridReply(interaction, { useEditReplyForSlash: isSlash });
        const subcommand = getHybridSubcommand(interaction, 'list');

        const allCommands = [...interaction.client.commands.keys()];

        try {
            if (subcommand === 'list') {
                const lockedCommands = await MariaModDB.getLockedCommands();
                if (!lockedCommands.length) {
                    return replyFn({
                        content: `${emojis.info} ${interaction.t('commands.admin.commandctl.list_empty')}`,
                        ephemeral: true,
                    });
                }

                return replyFn({
                    content: `${emojis.info} ${interaction.t('commands.admin.commandctl.list_title', {
                        count: lockedCommands.length,
                        commands: formatCommandPreview(lockedCommands),
                    })}`,
                    ephemeral: true,
                });
            }

            if (subcommand === 'lock' || subcommand === 'unlock') {
                const rawInput = isSlash
                    ? interaction.options.getString('commands')
                    : interaction.args?.slice(1).join(' ');

                if (!rawInput) {
                    return replyFn({
                        content: `${emojis.error} ${interaction.t('commands.admin.commandctl.usage')}`,
                        ephemeral: true,
                    });
                }

                let targetCommands;
                if ((rawInput || '').trim().toLowerCase() === 'all') {
                    targetCommands = subcommand === 'unlock'
                        ? await MariaModDB.getLockedCommands()
                        : resolveTargetCommands('all', allCommands);
                } else {
                    targetCommands = resolveTargetCommands(rawInput, allCommands);
                }

                if (!targetCommands.length) {
                    return replyFn({
                        content: `${emojis.error} ${interaction.t('commands.admin.commandctl.invalid_cmds')}`,
                        ephemeral: true,
                    });
                }

                if (subcommand === 'lock') {
                    await MariaModDB.lockCommands(targetCommands, interaction.user.id);
                    return replyFn({
                        content: `${emojis.success} ${interaction.t('commands.admin.commandctl.lock_success', {
                            count: targetCommands.length,
                            commands: formatCommandPreview(targetCommands),
                        })}`,
                        ephemeral: true,
                    });
                }

                await MariaModDB.unlockCommands(targetCommands);
                return replyFn({
                    content: `${emojis.success} ${interaction.t('commands.admin.commandctl.unlock_success', {
                        count: targetCommands.length,
                        commands: formatCommandPreview(targetCommands),
                    })}`,
                    ephemeral: true,
                });
            }

            if (subcommand === 'reload') {
                const rawScope = isSlash
                    ? (interaction.options.getString('scope') || 'guild')
                    : (interaction.args?.[1] || 'guild').toLowerCase();

                if (!['guild', 'all'].includes(rawScope)) {
                    return replyFn({
                        content: `${emojis.error} ${interaction.t('commands.admin.commandctl.invalid_scope')}`,
                        ephemeral: true,
                    });
                }

                const results = await reloadCommandsAcrossShards(interaction.client, rawScope, interaction.guildId);
                const summary = results.reduce((acc, row) => {
                    acc.shards += 1;
                    acc.loaded += Number(row.loaded || 0);
                    acc.deployed += Number(row.deployed || 0);
                    acc.failed += Number(row.failed || 0);
                    return acc;
                }, { shards: 0, loaded: 0, deployed: 0, failed: 0 });

                return replyFn({
                    content: `${emojis.success} ${interaction.t('commands.admin.commandctl.reload_success', {
                        scope: rawScope,
                        shards: summary.shards,
                        loaded: summary.loaded,
                        deployed: summary.deployed,
                        failed: summary.failed,
                    })}`,
                    ephemeral: true,
                });
            }

            return replyFn({
                content: `${emojis.error} ${interaction.t('commands.admin.commandctl.invalid_subcommand')}`,
                ephemeral: true,
            });
        } catch (error) {
            logger.error('admin', 'Error in commandctl command:', error);
            return replyFn({
                content: `${emojis.error} ${interaction.t('commands.admin.commandctl.error')}`,
                ephemeral: true,
            });
        }
    },
};

