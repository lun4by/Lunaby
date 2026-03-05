const PrefixDB = require('../services/database/PrefixDB');
const consentService = require('../services/consentService');
const { handlePermissionError } = require('../utils/permissionUtils');
const MariaModDB = require('../services/database/MariaModDB');
const QuotaService = require('../services/QuotaService');
const RoleService = require('../services/RoleService');
const CooldownService = require('../services/CooldownService');
const logger = require('../utils/logger');

class PseudoInteraction {
    constructor(message, commandName, args) {
        this.message = message;
        this.commandName = commandName;
        this.args = args;

        this.user = message.author;
        this.member = message.member;
        this.guild = message.guild;
        this.guildId = message.guildId;
        this.channel = message.channel;
        this.channelId = message.channelId;
        this.client = message.client;
        this.createdTimestamp = message.createdTimestamp;

        this.replied = false;
        this.deferred = false;
        this._sentMessage = null;

        this._options = this._parseOptions(args, message);
    }

    _parseOptions(args, message) {
        const options = new Map();

        const mentionedUser = message.mentions.users.first();
        if (mentionedUser) {
            options.set('user', mentionedUser);
            options.set('target', mentionedUser);
        }

        const textArgs = args.filter(a => !a.match(/^<@!?\d+>$/));
        if (textArgs.length > 0) {
            const text = textArgs.join(' ');
            options.set('prompt', text);
            options.set('text', text);
            options.set('prefix', text);
            options.set('action', textArgs[0]);
        }

        return options;
    }

    get options() {
        const self = this;
        return {
            getString(name) { return self._options.get(name) || null; },
            getUser(name) { return self._options.get(name) || null; },
            getMember(name) {
                const user = self._options.get(name);
                if (user && self.guild) {
                    return self.guild.members.cache.get(user.id) || null;
                }
                return null;
            },
            getInteger(name) {
                const val = self._options.get(name);
                return val ? parseInt(val) : null;
            },
            getSubcommandGroup() {
                return self.args.length >= 2 ? self.args[0] : null;
            },
            getSubcommand() {
                return self.args.length >= 2 ? self.args[1] : (self.args[0] || null);
            }
        };
    }

    async deferReply(opts = {}) {
        this.deferred = true;
        if (opts.fetchReply) {
            this._sentMessage = await this.message.reply('Đang xử lý...');
            return this._sentMessage;
        }
        this._sentMessage = await this.message.reply('Đang xử lý...');
        return this._sentMessage;
    }

    async reply(content) {
        this.replied = true;
        if (typeof content === 'string') {
            this._sentMessage = await this.message.reply(content);
        } else {
            this._sentMessage = await this.message.reply(content);
        }
        return this._sentMessage;
    }

    async editReply(content) {
        if (this._sentMessage) {
            return await this._sentMessage.edit(content);
        }
        return await this.reply(content);
    }

    async followUp(content) {
        return await this.channel.send(content);
    }

    async fetchReply() {
        return this._sentMessage || this.message;
    }

    isChatInputCommand() { return true; }
}

async function handlePrefixMessage(message, client) {
    if (message.author.bot) return false;

    const prefix = await PrefixDB.resolvePrefix(message.author.id, message.guild?.id);

    if (!message.content.toLowerCase().startsWith(prefix.toLowerCase())) return false;

    const withoutPrefix = message.content.slice(prefix.length).trim();
    if (!withoutPrefix) return false;

    const args = withoutPrefix.split(/\s+/);
    const commandName = args.shift().toLowerCase();

    const command = findCommandByPrefix(client, commandName);
    if (!command) return false;

    const aiCommands = ['think', 'reset'];
    if (aiCommands.includes(command.data?.name || commandName)) {
        const hasConsented = await consentService.hasUserConsented(message.author.id);
        if (!hasConsented) {
            try {
                const consentData = consentService.createConsentEmbed(message.author);
                await message.reply(consentData);
            } catch (error) {
                if (error.code === 50013 || error.message.includes('permission')) {
                    await handlePermissionError(message, 'embedLinks', message.author.username, 'reply');
                }
            }
            return true;
        }
    }

    if (command.prefix?.adminOnly) {
        const userRole = await RoleService.getUserRole(message.author.id);
        if (userRole !== 'owner' && userRole !== 'admin') {
            await message.reply('Bạn không có quyền sử dụng lệnh này.').catch(() => { });
            return true;
        }
    }

    try {
        if (message.guildId) {
            const isDisabled = await MariaModDB.isCommandDisabled(message.guildId, message.channelId, command.data?.name || commandName);
            if (isDisabled) {
                await message.reply('Lệnh này đã bị tắt trong kênh này.');
                return true;
            }
        }

        const userRole = await RoleService.getUserRole(message.author.id);
        if (userRole !== 'owner' && userRole !== 'admin') {
            const cmdName = command.data?.name || commandName;
            const cooldownTime = command.cooldown ?? CooldownService.DEFAULT_COOLDOWN;
            const { onCooldown, remaining, expiresAtUnix } = CooldownService.check(message.author.id, cmdName, cooldownTime);
            if (onCooldown) {
                const msg = await message.reply(`Bạn phải chờ <t:${expiresAtUnix}:R> mới được xài lệnh tiếp!`);
                setTimeout(() => msg.delete().catch(() => { }), remaining * 1000);
                return true;
            }
        }

        const interaction = new PseudoInteraction(message, commandName, args);
        await command.execute(interaction);

        const cmdName = command.data?.name || commandName;
        const cooldownTime = command.cooldown ?? CooldownService.DEFAULT_COOLDOWN;
        CooldownService.set(message.author.id, cmdName, cooldownTime);

        logger.info('PREFIX', `${message.author.tag} used ${prefix}${commandName}`);
    } catch (error) {
        logger.error('PREFIX', `Error executing prefix command ${commandName}:`, error);
        await message.reply('Đã xảy ra lỗi khi thực thi lệnh này!').catch(() => { });
    }

    return true;
}

function findCommandByPrefix(client, name) {
    if (client.commands.has(name)) {
        return client.commands.get(name);
    }

    for (const [, command] of client.commands) {
        if (command.prefix) {
            if (command.prefix.name === name) return command;
            if (command.prefix.aliases?.includes(name)) return command;
        }
    }

    return null;
}

module.exports = { handlePrefixMessage, PseudoInteraction };