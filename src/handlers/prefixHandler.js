const PrefixDB = require('../services/database/PrefixDB');
const consentService = require('../services/user/consentService');
const { handlePermissionError } = require('../utils/permissionUtils');
const MariaModDB = require('../services/database/MariaModDB');
const QuotaService = require('../services/user/QuotaService');
const RoleService = require('../services/user/RoleService');
const CooldownService = require('../services/user/CooldownService');
const logger = require('../utils/logger');
const emojis = require('../config/emojis');

class PseudoInteraction {
    constructor(message, commandName, args, command) {
        this.message = message;
        this.commandName = commandName;
        this.args = args;
        this.command = command; // Inject command here to parse schema

        this.user = message.author;
        this.member = message.member;
        this.guild = message.guild;
        this.guildId = message.guildId;
        this.channel = message.channel;
        this.channelId = message.channelId;
        this.client = message.client;
        this.createdTimestamp = message.createdTimestamp;
        this.t = message.t;
        this.memberPermissions = message.member?.permissions ?? null;

        this.replied = false;
        this.deferred = false;
        this._sentMessage = null;

        this._options = this._parseOptions(args, message);
    }

    _parseOptions(args, message) {
        const options = new Map();

        // Lấy mention user
        const mentionedUser = message.mentions.users.first();
        if (mentionedUser) {
            options.set('user', mentionedUser);
            options.set('target', mentionedUser);
        }

        // Lọc ra các text args (không phải mention)
        const textArgs = args.filter(a => !a.match(/^<@!?\d+>$/));

        // Nếu command có schema slash, parse theo đúng thứ tự option
        if (this.command?.data) {
            try {
                const jsonData = this.command.data.toJSON();
                const schemaOptions = (jsonData.options || []).filter(opt => opt.type !== 1 && opt.type !== 2);
                // Discord option types: 3=STRING, 4=INTEGER, 5=BOOLEAN, 6=USER, 7=CHANNEL, 10=NUMBER

                let textIdx = 0;
                for (const opt of schemaOptions) {
                    const name = opt.name;

                    // Type 6 = USER → đã xử lý qua mention ở trên
                    if (opt.type === 6) continue;

                    // Type 4 = INTEGER, Type 10 = NUMBER
                    if (opt.type === 4 || opt.type === 10) {
                        if (textIdx < textArgs.length) {
                            const parsed = parseInt(textArgs[textIdx], 10);
                            if (!isNaN(parsed)) {
                                options.set(name, parsed);
                                textIdx++;
                            }
                        }
                        continue;
                    }

                    // Type 3 = STRING
                    if (opt.type === 3) {
                        // Nếu có choices (like 'all'/'latest'), lấy 1 arg
                        if (opt.choices && opt.choices.length > 0) {
                            if (textIdx < textArgs.length) {
                                options.set(name, textArgs[textIdx]);
                                textIdx++;
                            }
                        } else {
                            // Gom tất cả text còn lại làm string (reason, prompt...)
                            if (textIdx < textArgs.length) {
                                options.set(name, textArgs.slice(textIdx).join(' '));
                                textIdx = textArgs.length; // hết args
                            }
                        }
                        continue;
                    }
                }
            } catch (e) {
                // Fallback: parse cũ
            }
        }

        // Fallback: nếu chưa có prompt/text, gom text args
        if (!options.has('prompt') && !options.has('text')) {
            if (textArgs.length > 0) {
                const text = textArgs.join(' ');
                options.set('prompt', text);
                options.set('text', text);
            }
        }
        // Fallback cho action
        if (!options.has('action') && textArgs.length > 0) {
            options.set('action', textArgs[0]);
        }

        // userid cho lệnh unban (trường hợp không có mention mà dùng raw ID)
        if (!options.has('userid') && textArgs.length > 0 && /^\d{17,19}$/.test(textArgs[0])) {
            options.set('userid', textArgs[0]);
        }

        return options;
    }

    get options() {
        const self = this;
        let subGroupName = null;
        let subCommandName = null;

        if (self.command?.data) {
            try {
                const jsonData = self.command.data.toJSON();
                if (jsonData.options) {
                    const arg0 = self.args[0]?.toLowerCase();
                    const arg1 = self.args[1]?.toLowerCase();

                    // 2 = SUB_COMMAND_GROUP, 1 = SUB_COMMAND
                    const groupOpt = jsonData.options.find(opt => opt.name === arg0 && opt.type === 2);
                    const subCmdOpt = jsonData.options.find(opt => opt.name === arg0 && opt.type === 1);

                    if (groupOpt) {
                        subGroupName = arg0;
                        const subOpt = groupOpt.options?.find(opt => opt.name === arg1 && opt.type === 1);
                        if (subOpt) {
                            subCommandName = arg1;
                        }
                    } else if (subCmdOpt) {
                        subCommandName = arg0;
                    }
                }
            } catch (e) {
                // Ignore parse errors, fallback to null
            }
        }

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
                if (val === undefined || val === null) return null;
                const parsed = parseInt(val, 10);
                return Number.isNaN(parsed) ? null : parsed;
            },
            getSubcommandGroup() {
                return subGroupName;
            },
            getSubcommand() {
                return subCommandName;
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
            if (typeof content === 'object' && content.embeds && !content.content) {
                content.content = '';
            }
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

    if (command.prefix?.adminOnly) {
        const userRole = await RoleService.getUserRole(message.author.id);
        if (userRole !== 'owner' && userRole !== 'admin') {
            await message.reply(`${emojis.error} Bạn không có quyền sử dụng lệnh này.`).catch(() => { });
            return true;
        }
    } else if (command.data?.default_member_permissions) {
        const requiredPermissions = BigInt(command.data.default_member_permissions);
        if (message.member && !message.member.permissions.has(requiredPermissions)) {
            await message.reply(`${emojis.error} Bạn không có đủ quyền trong server để sử dụng lệnh này.`).catch(() => { });
            return true;
        }
    }

    try {
        // TEMP DEBUG: hard console logging to bypass logger filters; remove after prefix bug is identified.
        console.log('[TEMP PREFIX TRACE]', {
            commandName,
            rawContent: message.content,
            userId: message.author?.id,
            userTag: message.author?.tag,
            guildId: message.guildId,
            channelId: message.channelId,
            hasMessageT: typeof message.t === 'function',
        });

        if (message.guildId) {
            const isDisabled = await MariaModDB.isCommandDisabled(message.guildId, message.channelId, command.data?.name || commandName);
            if (isDisabled) {
                await message.reply(`${emojis.error} Lệnh này đã bị tắt trong kênh này.`);
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

        const interaction = new PseudoInteraction(message, commandName, args, command);
        await command.execute(interaction);

        const cmdName = command.data?.name || commandName;
        const cooldownTime = command.cooldown ?? CooldownService.DEFAULT_COOLDOWN;
        CooldownService.set(message.author.id, cmdName, cooldownTime);

        logger.info('COMMAND_USAGE', `[Server: ${message.guild?.name || 'DM'}] [Channel: ${message.channel?.name || 'N/A'}] User ${message.author.tag} (${message.author.id}) used: ${prefix}${commandName}`);
    } catch (error) {
        // TEMP DEBUG: hard console logging to bypass logger filters; remove after prefix bug is identified.
        console.error('[TEMP PREFIX ERROR]', {
            commandName,
            userId: message.author?.id,
            userTag: message.author?.tag,
            guildId: message.guildId,
            channelId: message.channelId,
            hasMessageT: typeof message.t === 'function',
        });
        console.error(error?.stack || error);
        logger.error('PREFIX', `Error executing prefix command ${commandName}:`, error);
        await message.reply(`${emojis.error} Đã xảy ra lỗi khi thực thi lệnh này!`).catch(() => { });
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
