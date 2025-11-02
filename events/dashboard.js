const express = require('express');
const session = require('express-session');
const path = require('path');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const bodyParser = require('body-parser');
const ejs = require('ejs');
const MongoStore = require('connect-mongo');
const logger = require('../utils/logger.js');
const mongoClient = require('../services/mongoClient.js');
const fs = require('fs');

// Custom dashboard modules
const routePaths = {
  main: '../Luna-Dashboard/src/routes/main',
  auth: '../Luna-Dashboard/src/routes/auth',
  api: '../Luna-Dashboard/src/routes/api',
  commands: '../Luna-Dashboard/src/routes/commands',
  admin: '../Luna-Dashboard/src/routes/admin',
  plugins: '../Luna-Dashboard/src/routes/plugins'
};

// Import routes
const routes = {};
Object.entries(routePaths).forEach(([key, routePath]) => {
  try {
    routes[key] = require(routePath);
  } catch (error) {
    logger.warn('DASHBOARD', `⚠️ Route module ${routePath} not found, using fallback route`);
    // Create a simple fallback router
    const router = express.Router();
    router.get('/', (req, res) => {
      res.render('error', {
        title: 'Module Not Found',
        error: 'This module is not available',
        subtitle: 'Please run the dashboard setup script first'
      });
    });
    routes[key] = router;
  }
});

let dashboardApp;

async function initDashboard(client) {
  try {
    logger.info('DASHBOARD', '🔄 Khởi tạo dashboard...');

    // Check if required directories exist
    const publicPath = path.join(__dirname, '../Luna-Dashboard/src/public');
    const themesPath = path.join(__dirname, '../Luna-Dashboard/src/themes');
    
    // Create directories if they don't exist
    [publicPath, themesPath, path.join(themesPath, 'default')].forEach(dir => {
      if (!fs.existsSync(dir)) {
        logger.warn('DASHBOARD', `⚠️ Directory ${dir} not found, creating it`);
        fs.mkdirSync(dir, { recursive: true });
      }
    });

    // Dashboard config
    const config = {
      clientID: process.env.CLIENT_ID,
      clientSecret: process.env.CLIENT_SECRET || '',
      callbackURL: process.env.CALLBACK_URL || 'http://localhost:3000/login/api',
      Admin: process.env.OWNER_ID ? [process.env.OWNER_ID] : [],
      token: process.env.DISCORD_TOKEN,
      port: process.env.DASHBOARD_PORT || 3000
    };

    // Initialize Express app
    dashboardApp = express();

    // Set up view engine
    dashboardApp.set('view engine', 'ejs');
    dashboardApp.set('views', publicPath);
    
    // Middleware
    dashboardApp.use(bodyParser.json());
    dashboardApp.use(bodyParser.urlencoded({ extended: true }));

    // Static directories
    dashboardApp.use(express.static(publicPath));
    dashboardApp.use('/themes', express.static(themesPath));

    // Create basic error template if it doesn't exist
    const errorTemplate = path.join(publicPath, 'error.ejs');
    if (!fs.existsSync(errorTemplate)) {
      logger.warn('DASHBOARD', '⚠️ Error template not found, creating it');
      const errorEjs = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title><%= title %> | Lunaby AI</title>
</head>
<body style="font-family: Arial, sans-serif; background-color: #242629; color: #94A1B2; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0;">
  <div style="text-align: center; padding: 20px; background-color: #16161A; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
    <h1 style="color: #FFFFFE;"><%= error %></h1>
    <p><%= subtitle %></p>
    <a href="/" style="display: inline-block; margin-top: 20px; background-color: #7F5AF0; color: #FFFFFE; padding: 10px 20px; text-decoration: none; border-radius: 4px;">Return to Home</a>
  </div>
</body>
</html>`;
      fs.writeFileSync(errorTemplate, errorEjs);
    }

    // Session configuration
    const sessionConfig = {
      secret: 'lunaby-dashboard-secret',
      cookie: {
        maxAge: 60000 * 60 * 24 // 24 hours
      },
      saveUninitialized: false,
      resave: false,
      name: 'lunaby-dashboard-cookie'
    };

    // Use MongoDB for session storage if available
    try {
      const db = mongoClient.getDb();
      if (db) {
        sessionConfig.store = MongoStore.create({
          client: mongoClient.getMongoClient(),
          dbName: db.databaseName,
          collectionName: 'dashboard_sessions'
        });
        logger.info('DASHBOARD', '✅ Đã kết nối MongoDB cho phiên đăng nhập dashboard');
      }
    } catch (error) {
      logger.warn('DASHBOARD', '⚠️ Không thể sử dụng MongoDB cho phiên đăng nhập, sử dụng bộ nhớ');
    }

    dashboardApp.use(session(sessionConfig));

    // Passport setup
    try {
      passport.serializeUser((user, done) => {
        done(null, user);
      });
      
      passport.deserializeUser((obj, done) => {
        done(null, obj);
      });

      passport.use(new DiscordStrategy({
        clientID: config.clientID,
        clientSecret: config.clientSecret,
        callbackURL: config.callbackURL,
        scope: ['identify', 'guilds']
      }, function(accessToken, refreshToken, profile, done) {
        process.nextTick(function() {
          return done(null, profile);
        });
      }));
  
      dashboardApp.use(passport.initialize());
      dashboardApp.use(passport.session());
    } catch (error) {
      logger.error('DASHBOARD', `❌ Lỗi khi thiết lập Passport: ${error.message}`);
      logger.warn('DASHBOARD', '⚠️ Đảm bảo rằng CLIENT_SECRET đã được thiết lập trong tệp .env');
    }

    // Global variables for templates
    dashboardApp.locals.bot = client;
    dashboardApp.locals.config = config;
    dashboardApp.locals.themeConfig = {
      theme: "default"
    };

    // Add Luna-specific data
    try {
      const packageJson = require('../package.json');
      dashboardApp.locals.luna = {
        version: packageJson.version,
        name: "Luna AI Dashboard"
      };
    } catch (error) {
      dashboardApp.locals.luna = {
        version: '1.0.0',
        name: "Luna AI Dashboard"
      };
    }

    // Middleware for auth check
    function checkAuth(req, res, next) {
      if (req.isAuthenticated()) return next();
      req.session.backURL = req.url;
      res.redirect('/login');
    }

    // Admin middleware
    function checkAdmin(req, res, next) {
      if (req.isAuthenticated() && config.Admin.includes(req.user.id)) return next();
      req.session.backURL = req.originalUrl;
      res.redirect('/login');
    }

    // Set up routes
    dashboardApp.use('/', routes.main);
    dashboardApp.use('/login', routes.auth);
    dashboardApp.use('/api', routes.api);
    dashboardApp.use('/commands', routes.commands);
    dashboardApp.use('/admin', routes.admin);
    dashboardApp.use('/plugins', routes.plugins);

    // Custom 404 handler
    dashboardApp.use((req, res) => {
      res.status(404).render('error', {
        title: '404 - Không tìm thấy trang',
        error: '404 - Không tìm thấy trang',
        subtitle: 'Trang bạn đang tìm kiếm không tồn tại!'
      });
    });

    // Start the server
    try {
      const server = dashboardApp.listen(config.port, () => {
        logger.info('DASHBOARD', `✅ Dashboard đã khởi động tại cổng ${config.port}`);
      });
    } catch (error) {
      logger.error('DASHBOARD', `❌ Lỗi khi khởi động server: ${error.message}`);
      if (error.code === 'EADDRINUSE') {
        logger.warn('DASHBOARD', `⚠️ Cổng ${config.port} đang được sử dụng, hãy thử một cổng khác trong tệp .env (DASHBOARD_PORT)`);
      }
    }

    return dashboardApp;
  } catch (error) {
    logger.error('DASHBOARD', '❌ Lỗi khi khởi tạo dashboard:', error);
    logger.warn('DASHBOARD', '⚠️ Hãy chạy script scripts/fix-dashboard.js để sửa lỗi');
  }
}

function getDashboard() {
  return dashboardApp;
}

module.exports = { 
  initDashboard,
  getDashboard
}; 