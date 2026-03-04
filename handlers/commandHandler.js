const fs = require('fs');
const path = require('path');
const consentService = require('../services/consentService');
const { handlePermissionError } = require('../utils/permissionUtils');
const MariaModDB = require('../services/database/MariaModDB');
const QuotaService = require('../services/QuotaService');
const RoleService = require('../services/RoleService');
const CooldownService = require('../services/CooldownService');
const logger = require('../utils/logger.js');

let commandsJsonCache = null;
const AI_COMMANDS = new Set(['think', 'reset']);

const loadCommandsFromDirectory = (client, dir, commandsJson) => {
  const items = fs.readdirSync(dir, { withFileTypes: true });

  for (const item of items) {
    const itemPath = path.join(dir, item.name);

    if (item.isDirectory()) {
      loadCommandsFromDirectory(client, itemPath, commandsJson);
    } else if (item.name.endsWith('.js')) {
      try {
        const command = require(itemPath);
        if ('data' in command && 'execute' in command) {
          const commandName = command.data.name;
          if (client.commands.has(commandName)) {
            logger.warn('COMMAND', `Lệnh "${commandName}" đã tồn tại và sẽ bị ghi đè bởi ${itemPath}`);
          }

          try {
            const jsonData = command.data.toJSON();
            if (!jsonData || typeof jsonData !== 'object') {
              logger.error('COMMAND', `Lệnh "${commandName}" có toJSON() không hợp lệ:`, jsonData);
              continue;
            }
            if (!jsonData.name || !jsonData.description) {
              logger.error('COMMAND', `Lệnh "${commandName}" thiếu name hoặc description:`, jsonData);
              continue;
            }

            const dirParts = dir.split(path.sep);
            command.category = dirParts[dirParts.length - 1];

            client.commands.set(commandName, command);
            commandsJson.push(jsonData);
          } catch (jsonError) {
            logger.error('COMMAND', `Lỗi khi convert lệnh "${commandName}" sang JSON:`, jsonError);
            continue;
          }
        } else {
          logger.warn('COMMAND', `Lệnh tại ${itemPath} thiếu thuộc tính "data" hoặc "execute" bắt buộc.`);
        }
      } catch (error) {
        logger.error('COMMAND', `Không thể tải lệnh từ ${itemPath}:`, error);
      }
    }
  }
};

const loadCommands = (client) => {
  const commandsPath = path.join(__dirname, '../commands');
  const commandsJson = [];
  logger.info('COMMAND', 'BẮT ĐẦU TẢI LỆNH');
  client.commands.clear();
  loadCommandsFromDirectory(client, commandsPath, commandsJson);
  commandsJsonCache = commandsJson;
  logger.info('COMMAND', `ĐÃ TẢI TỔNG CỘNG ${client.commands.size} LỆNH`);
  if (!commandsJson.length) logger.warn('COMMAND', 'KHÔNG CÓ LỆNH NÀO ĐƯỢC TẢI!');
  return client.commands.size;
};

const getCommandsJson = (client) => {
  if (!commandsJsonCache) loadCommands(client);
  return commandsJsonCache;
};

const handleCommand = async (interaction, client) => {
  if (!client.commands.size) {
    logger.warn('COMMAND', 'Commands chưa được tải, đang tải lại...');
    loadCommands(client);
  }
  const command = client.commands.get(interaction.commandName);
  if (!command) {
    logger.error('COMMAND', `Không tìm thấy lệnh nào khớp với ${interaction.commandName}.`);
    return;
  }

  try {
    if (interaction.guildId) {
      const isDisabled = await MariaModDB.isCommandDisabled(interaction.guildId, interaction.channelId, interaction.commandName);
      if (isDisabled) {
        return interaction.reply({ content: 'Lệnh này đã bị tắt trong kênh này.', ephemeral: true });
      }
    }

    const userRole = await RoleService.getUserRole(interaction.user.id);
    const isPrivileged = userRole === 'owner' || userRole === 'admin';

    if (command.prefix?.adminOnly || (command.data && command.data.default_member_permissions !== undefined)) {
      if (!isPrivileged) {
        return interaction.reply({ content: 'Bạn không có quyền sử dụng lệnh này.', ephemeral: true });
      }
    }

    if (!isPrivileged) {
      const cooldownTime = command.cooldown ?? CooldownService.DEFAULT_COOLDOWN;
      const { onCooldown, remaining, expiresAtUnix } = CooldownService.check(interaction.user.id, interaction.commandName, cooldownTime);
      if (onCooldown) {
        await interaction.reply({
          content: `Bạn phải chờ <t:${expiresAtUnix}:R> mới được xài lệnh tiếp!`,
          ephemeral: true,
        });
        setTimeout(() => interaction.deleteReply().catch(() => { }), remaining * 1000);
        return;
      }
    }

    if (AI_COMMANDS.has(interaction.commandName)) {
      const hasConsented = await consentService.hasUserConsented(interaction.user.id);

      if (!hasConsented) {
        try {
          const consentData = consentService.createConsentEmbed(interaction.user);
          await interaction.reply(consentData);
        } catch (error) {
          if (error.code === 50013 || (error?.message || '').includes('permission')) {
            await handlePermissionError(interaction, 'embedLinks', interaction.user.username, 'reply');
          } else {
            throw error;
          }
        }
        return;
      }
    }

    await command.execute(interaction);

    // Set cooldown sau khi execute thành công
    const cooldownTime = command.cooldown ?? CooldownService.DEFAULT_COOLDOWN;
    CooldownService.set(interaction.user.id, interaction.commandName, cooldownTime);

    logger.info('COMMAND', `Người dùng ${interaction.user.tag} đã sử dụng lệnh /${interaction.commandName}`);
  } catch (error) {
    logger.error('COMMAND', `Lỗi khi thực thi lệnh ${interaction.commandName}:`, error);
    const errPayload = { content: 'Đã xảy ra lỗi khi thực thi lệnh này!', ephemeral: true };
    const respond = interaction.replied || interaction.deferred
      ? interaction.followUp(errPayload)
      : interaction.reply(errPayload);
    await respond.catch(() => { });
  }
};

module.exports = {
  loadCommands,
  handleCommand,
  getCommandsJson
};