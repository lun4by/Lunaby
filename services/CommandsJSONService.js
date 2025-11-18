const fs = require('fs').promises;
const path = require('path');
const { PermissionFlagsBits } = require('discord.js');
const logger = require('../utils/logger.js');

class CommandsJSONService {
  constructor() {
    this.outputDir = path.join(__dirname, '../assets');
    this.outputPath = path.join(this.outputDir, 'commands.json');
  }

  
  async generateCommandsJSON() {
    try {
      const commandsData = await this.scanCommands();
      
      await fs.mkdir(this.outputDir, { recursive: true });
      
      await fs.writeFile(this.outputPath, JSON.stringify(commandsData, null, 2), 'utf8');
      
      logger.info('COMMANDS_JSON', `Đã tạo file commands.json với ${commandsData.length} lệnh`);
      return true;
      
    } catch (error) {
      logger.error('COMMANDS_JSON', 'Lỗi khi tạo file JSON lệnh:', error);
      return false;
    }
  }

  
  async scanCommands() {
    const commands = [];
    const commandsDir = path.join(__dirname, '../commands');
    
    try {
      const categories = await fs.readdir(commandsDir, { withFileTypes: true });
      
      for (const category of categories) {
        if (!category.isDirectory()) continue;
        
        const categoryPath = path.join(commandsDir, category.name);
        const commandFiles = await fs.readdir(categoryPath);
        
        for (const file of commandFiles) {
          if (!file.endsWith('.js')) continue;
          
          try {
            const commandPath = path.join(categoryPath, file);
            const command = require(commandPath);
            
            if (command.data && command.execute) {
              const commandData = {
                name: command.data.name,
                aliases: command.data.aliases || [],
                clientPermissions: this.getClientPermissions(command.data),
                group: category.name,
                description: command.data.description || 'Không có mô tả',
                parameters: this.getParameters(command.data),
                examples: this.getExamples(command.data),
                guildOnly: command.data.guildOnly || false,
                requiresDatabase: command.requiresDatabase || false,
                rankcommand: command.rankcommand || false,
                nsfw: command.nsfw || false,
                cooldown: command.cooldown || null
              };
              
              commands.push(commandData);
            }
          } catch (error) {
            logger.warn('COMMANDS_JSON', `Không thể load lệnh ${file}:`, error.message);
          }
        }
      }
      
      return commands.sort((a, b) => {
        if (a.group !== b.group) {
          return a.group.localeCompare(b.group);
        }
        return a.name.localeCompare(b.name);
      });
      
    } catch (error) {
      logger.error('COMMANDS_JSON', 'Lỗi khi quét lệnh:', error);
      return [];
    }
  }

  
  getClientPermissions(commandData) {
    const permissions = [];
    
    if (commandData.default_member_permissions) {
      const permissionFlags = {
        [PermissionFlagsBits.Administrator]: 'ADMINISTRATOR',
        [PermissionFlagsBits.ManageGuild]: 'MANAGE_GUILD',
        [PermissionFlagsBits.ManageChannels]: 'MANAGE_CHANNELS',
        [PermissionFlagsBits.ManageRoles]: 'MANAGE_ROLES',
        [PermissionFlagsBits.ManageMessages]: 'MANAGE_MESSAGES',
        [PermissionFlagsBits.EmbedLinks]: 'EMBED_LINKS',
        [PermissionFlagsBits.AttachFiles]: 'ATTACH_FILES',
        [PermissionFlagsBits.ReadMessageHistory]: 'READ_MESSAGE_HISTORY',
        [PermissionFlagsBits.UseExternalEmojis]: 'USE_EXTERNAL_EMOJIS',
        [PermissionFlagsBits.AddReactions]: 'ADD_REACTIONS',
        [PermissionFlagsBits.SendMessages]: 'SEND_MESSAGES',
        [PermissionFlagsBits.SendTTSMessages]: 'SEND_TTS_MESSAGES',
        [PermissionFlagsBits.UseSlashCommands]: 'USE_SLASH_COMMANDS'
      };
      
      for (const [flag, name] of Object.entries(permissionFlags)) {
        if (commandData.default_member_permissions & flag) {
          permissions.push(name);
        }
      }
    }
    
    if (!permissions.includes('EMBED_LINKS')) {
      permissions.push('EMBED_LINKS');
    }
    
    return permissions;
  }

  
  getParameters(commandData) {
    const parameters = [];
    
    if (commandData.options) {
      for (const option of commandData.options) {
        let paramDesc = option.description || option.name;
        
        if (option.required) {
          paramDesc = `${paramDesc} (bắt buộc)`;
        } else {
          paramDesc = `${paramDesc} (tùy chọn)`;
        }
        
        if (option.choices && option.choices.length > 0) {
          const choices = option.choices.map(c => c.name).join(', ');
          paramDesc += ` - Lựa chọn: ${choices}`;
        }
        
        parameters.push(paramDesc);
      }
    }
    
    return parameters;
  }

  getExamples(commandData) {
    const examples = [];
    const commandName = commandData.name;
    
    examples.push(`/${commandName}`);
    
    if (commandData.options && commandData.options.length > 0) {
      const exampleWithParams = `/${commandName} ` + 
        commandData.options
          .filter(opt => opt.required)
          .slice(0, 2)
          .map(opt => {
            if (opt.choices && opt.choices.length > 0) {
              return opt.choices[0].name;
            }
            return `<${opt.name}>`;
          })
          .join(' ');
      
      if (exampleWithParams !== `/${commandName} `) {
        examples.push(exampleWithParams);
      }
    }
    
    return examples;
  }

  
  async fileExists() {
    try {
      await fs.access(this.outputPath);
      return true;
    } catch {
      return false;
    }
  }

  
  async getFileInfo() {
    try {
      const stats = await fs.stat(this.outputPath);
      return {
        size: stats.size,
        created: stats.birthtime,
        modified: stats.mtime
      };
    } catch {
      return null;
    }
  }
}

module.exports = new CommandsJSONService();
