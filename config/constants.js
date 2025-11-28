module.exports = {
  // Message limits
  DISCORD_MESSAGE_MAX_LENGTH: 2000,
  SUMMARY_MESSAGE_TRUNCATE_LENGTH: 150,
  
  // Conversation settings
  MAX_CONVERSATION_LENGTH: 30,
  MAX_CONVERSATION_AGE_MS: 3 * 60 * 60 * 1000, // 3 hours
  
  // Memory settings
  RECENT_MEMORY_MESSAGES_COUNT: 10,
  RELEVANT_MEMORY_COUNT: 3,
  DETAILED_MEMORY_DISPLAY_COUNT: 15,
  DEFAULT_MEMORY_DISPLAY_COUNT: 3,
  
  // Timeout settings
  AI_TIMEOUT_MS: 25000, // 25 seconds
  API_REQUEST_TIMEOUT_MS: 120000, // 120 seconds (2 minutes)
  TYPING_INDICATOR_INTERVAL_MS: 5000, // 5 seconds
  GUILD_DEPLOY_DELAY_MS: 1000, // 1 second between deployments
  
  // Streaming settings
  STREAM_UPDATE_INTERVAL_MS: 400, // 400ms for smooth updates (was 800ms)
  STREAM_MIN_CHUNK_SIZE: 20, // Minimum characters before updating (was 30)
  STREAM_BATCH_UPDATE_SIZE: 150, // Update every N characters
  STREAM_ENABLE_BY_DEFAULT: true, // Enable streaming by default
  
  // Cache settings
  MEMORY_CACHE_EXPIRY_MS: 30 * 60 * 1000, // 30 minutes
  
  // Quota settings
  QUOTA_PERIOD_DAYS: 30,
  DEFAULT_USER_MESSAGE_LIMIT: 600,
  UNLIMITED_QUOTA: -1,
  
  // User roles
  USER_ROLES: {
    OWNER: 'owner',
    ADMIN: 'admin',
    HELPER: 'helper',
    USER: 'user'
  },
  
  // Role limits
  ROLE_LIMITS: {
    owner: -1,
    admin: -1,
    helper: -1,
    user: 600
  },
  
  // Default values
  DEFAULT_USER_ID: 'anonymous-user',
  DEFAULT_LANGUAGE: 'vi',
  DEFAULT_COMMUNICATION_STYLE: 'friendly',
  
  // AI model settings
  DEFAULT_MAX_TOKENS: 2048,
  CODE_MAX_TOKENS: 4000,
  MEMORY_EXTRACTION_MAX_TOKENS: 500,
  MEMORY_EXTRACTION_TEMPERATURE: 0.3,
  
  // Memory categories
  MEMORY_CATEGORIES: {
    PREFERENCE: 'preference',
    FACT: 'fact',
    EVENT: 'event',
    ACHIEVEMENT: 'achievement'
  },
  
  // Memory sources
  MEMORY_SOURCES: {
    CONVERSATION: 'conversation',
    COMMAND: 'command',
    AUTO_EXTRACTED: 'auto-extracted',
    MANUAL: 'manual'
  },
  
  // Message importance scale
  MIN_IMPORTANCE: 1,
  MAX_IMPORTANCE: 10,
  DEFAULT_IMPORTANCE: 5,
  HIGH_IMPORTANCE_THRESHOLD: 7,
  
  // Cleanup intervals
  CONVERSATION_CLEANUP_INTERVAL_MS: 60 * 60 * 1000, // 1 hour
  
  // Database collection names
  COLLECTIONS: {
    CONVERSATIONS: 'conversations',
    CONVERSATION_META: 'conversation_meta',
    USER_PROFILES: 'user_profiles',
    USER_MEMORIES: 'user_memories',
    USER_QUOTAS: 'user_quotas',
    GUILDS: 'guilds',
    MOD_SETTINGS: 'mod_settings',
    IMAGE_BLACKLIST: 'image_blacklist',
    MONITOR_SETTINGS: 'monitor_settings',
    MONITOR_LOGS: 'monitor_logs'
  },
  
  // Image blacklist severity levels
  SEVERITY_LEVELS: {
    LOW: 'low',
    MEDIUM: 'medium',
    HIGH: 'high'
  },
  
  // Request types
  REQUEST_TYPES: {
    IMAGE: 'image',
    MEMORY: 'memory',
    CODE: 'code',
    CHAT: 'chat'
  },
  
  // Channel types
  CHANNEL_TYPES: {
    DM: 'DM',
    GUILD_TEXT: 0
  },
  
  // Discord permission error codes
  DISCORD_ERROR_CODES: {
    MISSING_PERMISSIONS: 50013
  }
};
