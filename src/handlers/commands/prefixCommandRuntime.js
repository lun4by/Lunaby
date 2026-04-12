class PseudoInteraction {
  constructor(message, commandName, args, command) {
    this.message = message;
    this.commandName = commandName;
    this.args = args;
    this.command = command;

    this.user = message.author;
    this.author = message.author;
    this.member = message.member;
    this.guild = message.guild;
    this.guildId = message.guildId;
    this.channel = message.channel;
    this.channelId = message.channelId;
    this.client = message.client;
    this.content = message.content;
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

    const mentionedUser = message.mentions.users.first();
    if (mentionedUser) {
      options.set('user', mentionedUser);
      options.set('target', mentionedUser);
    }

    const mentionedChannel = message.mentions.channels.first();
    if (mentionedChannel) {
      options.set('channel', mentionedChannel);
    }

    const textArgs = args.filter((arg) => !/^<@!?\d+>$/.test(arg));

    if (this.command?.data) {
      try {
        const jsonData = this.command.data.toJSON();
        const schemaOptions = (jsonData.options || []).filter((option) => option.type !== 1 && option.type !== 2);

        let textIndex = 0;
        for (const option of schemaOptions) {
          const { name, type } = option;

          if (type === 6 || type === 7) {
            continue;
          }

          if (type === 4 || type === 10) {
            if (textIndex < textArgs.length) {
              const rawValue = textArgs[textIndex];
              const parsedValue = type === 10 ? Number(rawValue) : parseInt(rawValue, 10);

              if (!Number.isNaN(parsedValue)) {
                options.set(name, parsedValue);
                textIndex++;
              }
            }
            continue;
          }

          if (type === 5) {
            if (textIndex < textArgs.length) {
              const value = textArgs[textIndex].toLowerCase();
              if (['true', 'yes', 'on', 'enable', 'enabled', '1'].includes(value)) {
                options.set(name, true);
                textIndex++;
              } else if (['false', 'no', 'off', 'disable', 'disabled', '0'].includes(value)) {
                options.set(name, false);
                textIndex++;
              }
            }
            continue;
          }

          if (type === 3) {
            if (option.choices?.length) {
              if (textIndex < textArgs.length) {
                options.set(name, textArgs[textIndex]);
                textIndex++;
              }
            } else if (textIndex < textArgs.length) {
              options.set(name, textArgs.slice(textIndex).join(' '));
              textIndex = textArgs.length;
            }
          }
        }
      } catch (_) {
      }
    }

    if (!options.has('prompt') && !options.has('text') && textArgs.length > 0) {
      const text = textArgs.join(' ');
      options.set('prompt', text);
      options.set('text', text);
    }

    if (!options.has('action') && textArgs.length > 0) {
      options.set('action', textArgs[0]);
    }

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

          const groupOption = jsonData.options.find((option) => option.name === arg0 && option.type === 2);
          const subCommandOption = jsonData.options.find((option) => option.name === arg0 && option.type === 1);

          if (groupOption) {
            subGroupName = arg0;
            const subOption = groupOption.options?.find((option) => option.name === arg1 && option.type === 1);
            if (subOption) {
              subCommandName = arg1;
            }
          } else if (subCommandOption) {
            subCommandName = arg0;
          }
        }
      } catch (_) {
      }
    }

    return {
      getString(name) { return self._options.get(name) || null; },
      getUser(name) { return self._options.get(name) || null; },
      getBoolean(name) {
        const value = self._options.get(name);
        return typeof value === 'boolean' ? value : null;
      },
      getChannel(name) { return self._options.get(name) || null; },
      getMember(name) {
        const user = self._options.get(name);
        if (user && self.guild) {
          return self.guild.members.cache.get(user.id) || null;
        }

        return null;
      },
      getInteger(name) {
        const value = self._options.get(name);
        if (value === undefined || value === null) {
          return null;
        }

        const parsed = parseInt(value, 10);
        return Number.isNaN(parsed) ? null : parsed;
      },
      getSubcommandGroup() {
        return subGroupName;
      },
      getSubcommand() {
        return subCommandName;
      },
    };
  }

  async deferReply(options = {}) {
    this.deferred = true;
    const loadingMessage = options.fetchReply ? 'Đang xử lý...' : 'Đang xử lý...';
    this._sentMessage = await this.message.reply(loadingMessage);
    return this._sentMessage;
  }

  async reply(content) {
    this.replied = true;
    this._sentMessage = await this.message.reply(content);
    return this._sentMessage;
  }

  async editReply(content) {
    if (this._sentMessage) {
      if (typeof content === 'object' && content.embeds && !content.content) {
        content.content = '';
      }

      return this._sentMessage.edit(content);
    }

    return this.reply(content);
  }

  async followUp(content) {
    return this.channel.send(content);
  }

  async fetchReply() {
    return this._sentMessage || this.message;
  }

  isChatInputCommand() {
    return false;
  }

  isCommand() {
    return false;
  }
}

module.exports = {
  PseudoInteraction,
};