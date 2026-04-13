-- Lunaby MariaDB schema
-- Apply manually before starting bot:
--   mariadb -h <host> -u <user> -p <database> < src/database/schema/mariadb_schema.sql

CREATE TABLE IF NOT EXISTS image_blacklist (
  id INT AUTO_INCREMENT PRIMARY KEY,
  keyword VARCHAR(255) NOT NULL UNIQUE,
  category VARCHAR(50) NOT NULL,
  description TEXT,
  severity ENUM('low', 'medium', 'high') DEFAULT 'medium',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_category (category),
  INDEX idx_keyword (keyword)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS user_blacklist (
  user_id VARCHAR(32) NOT NULL PRIMARY KEY,
  reason TEXT,
  created_by VARCHAR(32),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS guild_blacklist (
  guild_id VARCHAR(32) NOT NULL PRIMARY KEY,
  reason TEXT,
  created_by VARCHAR(32),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS user_prefixes (
  user_id VARCHAR(32) PRIMARY KEY,
  prefix VARCHAR(10) NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS server_prefixes (
  guild_id VARCHAR(32) PRIMARY KEY,
  prefix VARCHAR(10) NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS user_roles (
  user_id VARCHAR(32) PRIMARY KEY,
  role ENUM('owner', 'admin', 'pro', 'user') DEFAULT 'user',
  created_at BIGINT,
  updated_at BIGINT,
  INDEX idx_role (role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS user_quotas (
  user_id VARCHAR(32) PRIMARY KEY,
  current_usage INT DEFAULT 0,
  total_usage INT DEFAULT 0,
  limit_period INT DEFAULT 75,
  current_image_usage INT DEFAULT 0,
  total_image_usage INT DEFAULT 0,
  image_limit_period INT DEFAULT 5,
  period_start BIGINT,
  created_at BIGINT,
  updated_at BIGINT,
  INDEX idx_total_usage (total_usage)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS mod_settings (
  guild_id VARCHAR(32) PRIMARY KEY,
  log_channel_id VARCHAR(32),
  mod_action_logs BOOLEAN DEFAULT TRUE,
  monitor_logs BOOLEAN DEFAULT TRUE,
  updated_by VARCHAR(32),
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS mod_warnings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  guild_id VARCHAR(32) NOT NULL,
  user_id VARCHAR(32) NOT NULL,
  moderator_id VARCHAR(32) NOT NULL,
  reason TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user_guild (guild_id, user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS mod_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  guild_id VARCHAR(32) NOT NULL,
  target_id VARCHAR(32),
  moderator_id VARCHAR(32),
  action VARCHAR(50) NOT NULL,
  reason TEXT,
  duration INT DEFAULT NULL,
  count INT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_guild_target (guild_id, target_id),
  INDEX idx_guild_action (guild_id, action)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS guild_settings (
  guild_id VARCHAR(32) PRIMARY KEY,
  prefix VARCHAR(10) DEFAULT NULL,
  xp_active BOOLEAN DEFAULT FALSE,
  xp_exceptions JSON DEFAULT ('[]'),
  welcome_enabled BOOLEAN DEFAULT FALSE,
  welcome_channel VARCHAR(32),
  welcome_message TEXT,
  leaving_enabled BOOLEAN DEFAULT FALSE,
  leaving_channel VARCHAR(32),
  leaving_message TEXT,
  muted_role VARCHAR(32),
  suggest_channel VARCHAR(32),
  level_up_notifications BOOLEAN DEFAULT TRUE,
  level_up_channel VARCHAR(32) DEFAULT NULL,
  vote_log_channel VARCHAR(32) DEFAULT NULL,
  use_embeds BOOLEAN DEFAULT TRUE,
  voice_toggle_enabled BOOLEAN DEFAULT FALSE,
  language VARCHAR(10) DEFAULT 'vi',
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS command_toggles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  guild_id VARCHAR(32) NOT NULL,
  channel_id VARCHAR(32) NOT NULL,
  command_name VARCHAR(50) NOT NULL,
  updated_by VARCHAR(32),
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_guild_channel_cmd (guild_id, channel_id, command_name),
  INDEX idx_guild_channel (guild_id, channel_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS command_locks (
  command_name VARCHAR(50) PRIMARY KEY,
  reason VARCHAR(255) DEFAULT NULL,
  updated_by VARCHAR(32),
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS bot_settings (
  setting_key VARCHAR(50) PRIMARY KEY,
  setting_value VARCHAR(255),
  updated_by VARCHAR(32),
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS user_levels (
  guild_id VARCHAR(32) NOT NULL,
  user_id VARCHAR(32) NOT NULL,
  xp INT DEFAULT 0,
  level INT DEFAULT 1,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (guild_id, user_id),
  INDEX idx_guild_xp (guild_id, xp DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS user_consents (
  user_id VARCHAR(32) PRIMARY KEY,
  consented BOOLEAN DEFAULT FALSE,
  version VARCHAR(10) DEFAULT '1.0',
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS user_profiles (
  user_id VARCHAR(32) PRIMARY KEY,
  global_xp INT DEFAULT 0,
  global_level INT DEFAULT 1,
  bio TEXT,
  color VARCHAR(20),
  background VARCHAR(255),
  inventory JSON DEFAULT ('[]'),
  badges JSON DEFAULT ('[]'),
  social JSON DEFAULT ('{}'),
  cosmetics JSON DEFAULT ('{}'),
  extra_data JSON DEFAULT ('{}'),
  language VARCHAR(10) DEFAULT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS user_economy (
  user_id VARCHAR(32) PRIMARY KEY,
  wallet INT DEFAULT 0,
  bank INT DEFAULT 0,
  shards INT DEFAULT 0,
  streak_current INT DEFAULT 0,
  streak_alltime INT DEFAULT 0,
  streak_timestamp BIGINT DEFAULT 0,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS lvoice_config (
  guild_id VARCHAR(32) PRIMARY KEY,
  creator_channel_id VARCHAR(32),
  category_id VARCHAR(32),
  default_name VARCHAR(100) DEFAULT '{user}',
  default_limit INT DEFAULT 0,
  default_bitrate INT DEFAULT 64000,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS lvoice_active (
  channel_id VARCHAR(32) PRIMARY KEY,
  guild_id VARCHAR(32) NOT NULL,
  owner_id VARCHAR(32) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_guild (guild_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS system_notices (
  id INT AUTO_INCREMENT PRIMARY KEY,
  guild_id VARCHAR(32) NULL,
  message TEXT NOT NULL,
  starts_at DATETIME NOT NULL,
  expires_at DATETIME NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_by VARCHAR(32) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_notice_window (is_active, starts_at, expires_at),
  INDEX idx_notice_guild (guild_id, is_active, expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;