const { registerFont } = require('canvas');
const path = require('path');
const fs = require('fs');
const os = require('os');
const logger = require('../../utils/logger.js');

class FontManager {
  constructor() {
    this.initialized = false;
    this.registeredFonts = new Set();
    this.fallbackFonts = this.getFallbackFonts();
  }

  
  getFallbackFonts() {
    const platform = os.platform();
    
    switch (platform) {
      case 'win32':
        return ['Arial', 'Segoe UI', 'Tahoma', 'Verdana', 'sans-serif'];
      case 'darwin':
        return ['Helvetica Neue', 'Arial', 'San Francisco', 'sans-serif'];
      case 'linux':
        return ['DejaVu Sans', 'Liberation Sans', 'Arial', 'sans-serif'];
      default:
        return ['Arial', 'sans-serif'];
    }
  }

  
  fontExists(fontPath) {
    try {
      return fs.existsSync(fontPath) && fs.statSync(fontPath).isFile();
    } catch {
      return false;
    }
  }

  
  registerSingleFont(fontPath, options) {
    const fontKey = `${fontPath}-${JSON.stringify(options)}`;
    
    if (this.registeredFonts.has(fontKey)) {
      return true;
    }

    if (!this.fontExists(fontPath)) {
      return false;
    }

    try {
      registerFont(fontPath, options);
      this.registeredFonts.add(fontKey);
      return true;
    } catch (error) {
      logger.warn('FONTS', `Không thể đăng ký font ${path.basename(fontPath)}: ${error.message}`);
      return false;
    }
  }

  
  async initialize(assetsPath) {
    if (this.initialized) return;

    try {
      if (os.platform() === 'win32') {
        process.env.FONTCONFIG_PATH = process.env.FONTCONFIG_PATH || '';
        process.env.FC_DEBUG = '0'; // Tắt debug fontconfig
      }

      const fontsPath = path.join(assetsPath, 'fonts');
      
      if (!fs.existsSync(fontsPath)) {
        logger.warn('FONTS', `Thư mục fonts không tồn tại: ${fontsPath}`);
        this.initialized = true;
        return;
      }

      // Cấu hình font weights
      const fontWeights = {
        'Thin': { numeric: 100, css: '100' },
        'ExtraLight': { numeric: 200, css: '200' },
        'Light': { numeric: 300, css: '300' },
        'Regular': { numeric: 400, css: 'normal' },
        'Medium': { numeric: 500, css: '500' },
        'SemiBold': { numeric: 600, css: '600' },
        'Bold': { numeric: 700, css: 'bold' },
        'ExtraBold': { numeric: 800, css: '800' },
        'Black': { numeric: 900, css: '900' }
      };

      const fontVariants = this.generateFontVariants();
      
      let successCount = 0;
      let totalCount = 0;

      for (const variant of fontVariants) {
        const fontPath = path.join(fontsPath, variant.file);
        const weight = fontWeights[variant.weight];
        
        if (!weight) continue;

        totalCount++;

        // Thử đăng ký với các cấu hình khác nhau
        const registrationConfigs = [
          {
            family: 'Montserrat',
            weight: weight.css,
            style: variant.style
          },
          {
            family: 'Montserrat',
            weight: weight.numeric.toString(),
            style: variant.style
          },
          {
            family: `Montserrat-${variant.weight}`,
            weight: weight.css,
            style: variant.style
          }
        ];

        let registered = false;
        for (const config of registrationConfigs) {
          if (this.registerSingleFont(fontPath, config)) {
            registered = true;
            break;
          }
        }

        if (registered) {
          successCount++;
        }
      }

      logger.info('FONTS', `Đăng ký thành công ${successCount}/${totalCount} fonts`);
      
      this.registerSystemFallbacks();
      
      this.initialized = true;
    } catch (error) {
      logger.error('FONTS', 'Lỗi khi khởi tạo FontManager:', error);
      logger.warn('FONTS', 'Sẽ sử dụng fonts hệ thống mặc định');
      this.initialized = true;
    }
  }

  
  generateFontVariants() {
    const weights = ['Thin', 'ExtraLight', 'Light', 'Regular', 'Medium', 'SemiBold', 'Bold', 'ExtraBold', 'Black'];
    const styles = [
      { suffix: '', style: 'normal' },
      { suffix: 'Italic', style: 'italic' }
    ];

    const variants = [];
    
    for (const weight of weights) {
      for (const styleInfo of styles) {
        // Montserrat regular
        variants.push({
          file: `Montserrat-${weight}${styleInfo.suffix}.otf`,
          weight: weight,
          style: styleInfo.style,
          family: 'Montserrat'
        });

        // MontserratAlternates
        variants.push({
          file: `MontserratAlternates-${weight}${styleInfo.suffix}.otf`,
          weight: weight,
          style: styleInfo.style,
          family: 'MontserratAlternates'
        });
      }
    }

    return variants;
  }

  registerSystemFallbacks() {
    logger.info('FONTS', 'Fonts dự phòng hệ thống:', this.fallbackFonts.join(', '));
  }

  
  getFontString(weight = 'Regular', size = 16, style = 'normal') {
    const weightMap = {
      'Thin': '100',
      'ExtraLight': '200', 
      'Light': '300',
      'Regular': 'normal',
      'Medium': '500',
      'SemiBold': '600',
      'Bold': 'bold',
      'ExtraBold': '800',
      'Black': '900'
    };

    const cssWeight = weightMap[weight] || 'normal';
    const fontFamily = this.initialized ? 
      `Montserrat, ${this.fallbackFonts.join(', ')}` : 
      this.fallbackFonts.join(', ');

    return `${style !== 'normal' ? style + ' ' : ''}${cssWeight} ${size}px ${fontFamily}`;
  }

  
  isInitialized() {
    return this.initialized;
  }

  
  getStats() {
    return {
      initialized: this.initialized,
      registeredFonts: this.registeredFonts.size,
      fallbackFonts: this.fallbackFonts,
      platform: os.platform()
    };
  }
}

// Export instance duy nhất của FontManager
module.exports = new FontManager();