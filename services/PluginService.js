const fs = require("fs").promises;
const path = require("path");
const { VM } = require("vm2");
const logger = require("../utils/logger.js");

/**
 * Plugin System
 * Load and execute community-developed plugins in sandboxed environment
 */
class PluginService {
  constructor() {
    this.pluginsDir = path.join(__dirname, "../plugins");
    this.plugins = new Map();
    this.pluginAPI = this.createPluginAPI();
    
    this.initPluginDirectory();
  }

  async initPluginDirectory() {
    try {
      await fs.mkdir(this.pluginsDir, { recursive: true });
      logger.info("PLUGIN_SYSTEM", "Plugin directory initialized");
    } catch (error) {
      logger.error("PLUGIN_SYSTEM", `Failed to create plugin directory: ${error.message}`);
    }
  }

  /**
   * Create safe API for plugins
   */
  createPluginAPI() {
    return {
      logger: {
        info: (pluginName, message) => logger.info(`PLUGIN:${pluginName}`, message),
        warn: (pluginName, message) => logger.warn(`PLUGIN:${pluginName}`, message),
        error: (pluginName, message) => logger.error(`PLUGIN:${pluginName}`, message),
      },
      utils: {
        fetch: async (url, options) => {
          const axios = require("axios");
          return await axios(url, options);
        },
        sleep: (ms) => new Promise(resolve => setTimeout(resolve, ms)),
      },
      discord: {
        // Safe Discord API methods will be injected per command
      },
    };
  }

  /**
   * Load all plugins from directory
   */
  async loadAllPlugins() {
    try {
      logger.info("PLUGIN_SYSTEM", "Loading plugins...");
      
      const files = await fs.readdir(this.pluginsDir);
      const pluginFiles = files.filter(f => f.endsWith(".plugin.js"));
      
      let loaded = 0;
      for (const file of pluginFiles) {
        const success = await this.loadPlugin(path.join(this.pluginsDir, file));
        if (success) loaded++;
      }
      
      logger.info("PLUGIN_SYSTEM", `Loaded ${loaded}/${pluginFiles.length} plugins`);
      return loaded;
    } catch (error) {
      logger.error("PLUGIN_SYSTEM", `Error loading plugins: ${error.message}`);
      return 0;
    }
  }

  /**
   * Load a single plugin
   */
  async loadPlugin(pluginPath) {
    try {
      const code = await fs.readFile(pluginPath, "utf8");
      const pluginName = path.basename(pluginPath, ".plugin.js");
      
      // Validate plugin structure
      const validation = await this.validatePlugin(code);
      if (!validation.valid) {
        logger.error("PLUGIN_SYSTEM", `Invalid plugin ${pluginName}: ${validation.error}`);
        return false;
      }
      
      // Execute plugin in sandbox
      const vm = new VM({
        timeout: 5000,
        sandbox: {
          module: { exports: {} },
          require: (name) => {
            // Only allow specific modules
            const allowedModules = ["axios"];
            if (allowedModules.includes(name)) {
              return require(name);
            }
            throw new Error(`Module '${name}' is not allowed in plugins`);
          },
          console: {
            log: (...args) => logger.info(`PLUGIN:${pluginName}`, args.join(" ")),
          },
        },
        eval: false,
        wasm: false,
      });
      
      const pluginModule = vm.run(`${code}\nmodule.exports;`);
      
      // Validate plugin exports
      if (!pluginModule.name || !pluginModule.version || !pluginModule.execute) {
        throw new Error("Plugin missing required exports: name, version, execute");
      }
      
      this.plugins.set(pluginName, {
        name: pluginModule.name,
        version: pluginModule.version,
        description: pluginModule.description || "No description",
        author: pluginModule.author || "Unknown",
        execute: pluginModule.execute,
        commands: pluginModule.commands || [],
        enabled: true,
        loadedAt: new Date(),
        path: pluginPath,
      });
      
      logger.info("PLUGIN_SYSTEM", `Loaded plugin: ${pluginModule.name} v${pluginModule.version}`);
      return true;
    } catch (error) {
      logger.error("PLUGIN_SYSTEM", `Error loading plugin ${pluginPath}: ${error.message}`);
      return false;
    }
  }

  /**
   * Validate plugin code
   */
  async validatePlugin(code) {
    // Check for dangerous patterns
    const dangerousPatterns = [
      /process\./i,
      /child_process/i,
      /fs\./i,
      /eval\s*\(/i,
      /Function\s*\(/i,
      /__dirname/i,
      /__filename/i,
      /require\s*\(\s*['"](fs|child_process|net|http|https)['"]\s*\)/i,
    ];
    
    for (const pattern of dangerousPatterns) {
      if (pattern.test(code)) {
        return {
          valid: false,
          error: `Dangerous operation detected: ${pattern.source}`,
        };
      }
    }
    
    // Check for required exports
    if (!code.includes("module.exports")) {
      return {
        valid: false,
        error: "Plugin must export a module",
      };
    }
    
    return { valid: true };
  }

  /**
   * Execute plugin command
   */
  async executePlugin(pluginName, context) {
    try {
      const plugin = this.plugins.get(pluginName);
      
      if (!plugin) {
        return {
          success: false,
          error: "Plugin not found",
        };
      }
      
      if (!plugin.enabled) {
        return {
          success: false,
          error: "Plugin is disabled",
        };
      }
      
      logger.info("PLUGIN_SYSTEM", `Executing plugin: ${plugin.name}`);
      
      // Create sandboxed context with API
      const sandboxContext = {
        ...context,
        api: this.pluginAPI,
        pluginName: plugin.name,
      };
      
      // Execute with timeout
      const result = await Promise.race([
        plugin.execute(sandboxContext),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error("Plugin execution timeout")), 30000)
        ),
      ]);
      
      return {
        success: true,
        result,
      };
    } catch (error) {
      logger.error("PLUGIN_SYSTEM", `Plugin execution error: ${error.message}`);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Get plugin information
   */
  getPlugin(pluginName) {
    const plugin = this.plugins.get(pluginName);
    if (!plugin) return null;
    
    return {
      name: plugin.name,
      version: plugin.version,
      description: plugin.description,
      author: plugin.author,
      commands: plugin.commands,
      enabled: plugin.enabled,
      loadedAt: plugin.loadedAt,
    };
  }

  /**
   * List all plugins
   */
  listPlugins() {
    return Array.from(this.plugins.values()).map(plugin => ({
      name: plugin.name,
      version: plugin.version,
      description: plugin.description,
      author: plugin.author,
      enabled: plugin.enabled,
    }));
  }

  /**
   * Enable/disable plugin
   */
  togglePlugin(pluginName, enabled) {
    const plugin = this.plugins.get(pluginName);
    if (!plugin) return false;
    
    plugin.enabled = enabled;
    logger.info("PLUGIN_SYSTEM", `Plugin ${pluginName} ${enabled ? "enabled" : "disabled"}`);
    return true;
  }

  /**
   * Reload plugin
   */
  async reloadPlugin(pluginName) {
    try {
      const plugin = this.plugins.get(pluginName);
      if (!plugin) return false;
      
      this.plugins.delete(pluginName);
      const success = await this.loadPlugin(plugin.path);
      
      logger.info("PLUGIN_SYSTEM", `Plugin ${pluginName} reloaded`);
      return success;
    } catch (error) {
      logger.error("PLUGIN_SYSTEM", `Error reloading plugin: ${error.message}`);
      return false;
    }
  }

  /**
   * Unload plugin
   */
  unloadPlugin(pluginName) {
    const plugin = this.plugins.get(pluginName);
    if (!plugin) return false;
    
    this.plugins.delete(pluginName);
    logger.info("PLUGIN_SYSTEM", `Plugin ${pluginName} unloaded`);
    return true;
  }

  /**
   * Create example plugin
   */
  async createExamplePlugin() {
    const exampleCode = `// Example Lunaby Plugin
// This plugin adds a simple greeting command

module.exports = {
  name: "Example Plugin",
  version: "1.0.0",
  description: "A simple example plugin",
  author: "Lunaby Team",
  
  // Commands this plugin provides
  commands: ["greet", "hello"],
  
  // Main execution function
  async execute(context) {
    const { command, args, user, api } = context;
    
    if (command === "greet" || command === "hello") {
      const name = args[0] || user.username;
      return {
        type: "message",
        content: \`Hello, \${name}! 👋\`,
      };
    }
    
    return {
      type: "error",
      content: "Unknown command",
    };
  },
};
`;
    
    try {
      const examplePath = path.join(this.pluginsDir, "example.plugin.js");
      await fs.writeFile(examplePath, exampleCode, "utf8");
      logger.info("PLUGIN_SYSTEM", "Example plugin created");
      return true;
    } catch (error) {
      logger.error("PLUGIN_SYSTEM", `Error creating example plugin: ${error.message}`);
      return false;
    }
  }

  /**
   * Format plugin list for Discord
   */
  formatPluginList() {
    const plugins = this.listPlugins();
    
    if (plugins.length === 0) {
      return "No plugins loaded.";
    }
    
    let output = `🔌 **Loaded Plugins** (${plugins.length})\n\n`;
    
    plugins.forEach(plugin => {
      const status = plugin.enabled ? "✅" : "❌";
      output += `${status} **${plugin.name}** v${plugin.version}\n`;
      output += `   ${plugin.description}\n`;
      output += `   Author: ${plugin.author}\n\n`;
    });
    
    return output;
  }
}

module.exports = new PluginService();
