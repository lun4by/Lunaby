module.exports = {
  // Chuyển số thành dạng thứ tự (1st, 2nd, 3rd, etc.)
  ordinalize: function(number) {
    const j = number % 10;
    const k = number % 100;
    
    if (j === 1 && k !== 11) {
      return number + "st";
    }
    if (j === 2 && k !== 12) {
      return number + "nd";
    }
    if (j === 3 && k !== 13) {
      return number + "rd";
    }
    
    return number + "th";
  },

  
  normalizeText: function(text) {
    if (!text) return text;

    // Loại bỏ ký tự điều khiển và format
    text = text.normalize('NFKD');
    
    // Map font đặc biệt sang ASCII
    const specialFontMap = {
      '𝒜': 'A', '𝒝': 'B', '𝒞': 'C', '𝒟': 'D', '𝒠': 'E',
      '𝒡': 'F', '𝒢': 'G', '𝒣': 'H', '𝒤': 'I', '𝒥': 'J',
      '𝒦': 'K', '𝒧': 'L', '𝒨': 'M', '𝒩': 'N', '𝒪': 'O',
      '𝒫': 'P', '𝒬': 'Q', '𝒭': 'R', '𝒮': 'S', '𝒯': 'T',
      '𝒰': 'U', '𝒱': 'V', '𝒲': 'W', '𝒳': 'X', '𝒴': 'Y',
      '𝒵': 'Z', '𝒶': 'a', '𝒷': 'b', '𝒸': 'c', '𝒹': 'd',
      '𝒺': 'e', '𝒻': 'f', '𝒼': 'g', '𝒽': 'h', '𝒾': 'i',
      '𝒿': 'j', '𝓀': 'k', '𝓁': 'l', '𝓂': 'm', '𝓃': 'n',
      '𝓄': 'o', '𝓅': 'p', '𝓆': 'q', '𝓇': 'r', '𝓈': 's',
      '𝓉': 't', '𝓊': 'u', '𝓋': 'v', '𝓌': 'w', '𝓍': 'x',
      '𝓎': 'y', '𝓏': 'z',
      // Font bold
      '𝗔': 'A', '𝗕': 'B', '𝗖': 'C', '𝗗': 'D', '𝗘': 'E',
      '𝗙': 'F', '𝗚': 'G', '𝗛': 'H', '𝗜': 'I', '𝗝': 'J',
      '𝗞': 'K', '𝗟': 'L', '𝗠': 'M', '𝗡': 'N', '𝗢': 'O',
      '𝗣': 'P', '𝗤': 'Q', '𝗥': 'R', '𝗦': 'S', '𝗧': 'T',
      '𝗨': 'U', '𝗩': 'V', '𝗪': 'W', '𝗫': 'X', '𝗬': 'Y',
      '𝗭': 'Z', '𝗮': 'a', '𝗯': 'b', '𝗰': 'c', '𝗱': 'd',
      '𝗲': 'e', '𝗳': 'f', '𝗴': 'g', '𝗵': 'h', '𝗶': 'i',
      '𝗷': 'j', '𝗸': 'k', '𝗹': 'l', '𝗺': 'm', '𝗻': 'n',
      '𝗼': 'o', '𝗽': 'p', '𝗾': 'q', '𝗿': 'r', '𝘀': 's',
      '𝘁': 't', '𝘂': 'u', '𝘃': 'v', '𝘄': 'w', '𝘅': 'x',
      '𝘆': 'y', '𝘇': 'z',
      // Font italic
      '𝘈': 'A', '𝘉': 'B', '𝘊': 'C', '𝘋': 'D', '𝘌': 'E',
      '𝘍': 'F', '𝘎': 'G', '𝘏': 'H', '𝘐': 'I', '𝘑': 'J',
      '𝘒': 'K', '𝘓': 'L', '𝘔': 'M', '𝘕': 'N', '𝘖': 'O',
      '𝘗': 'P', '𝘘': 'Q', '𝘙': 'R', '𝘚': 'S', '𝘛': 'T',
      '𝘜': 'U', '𝘝': 'V', '𝘞': 'W', '𝘟': 'X', '𝘠': 'Y',
      '𝘡': 'Z', '𝘢': 'a', '𝘣': 'b', '𝘤': 'c', '𝘥': 'd',
      '𝘦': 'e', '𝘧': 'f', '𝘨': 'g', '𝘩': 'h', '𝘪': 'i',
      '𝘫': 'j', '𝘬': 'k', '𝘭': 'l', '𝘮': 'm', '𝘯': 'n',
      '𝘰': 'o', '𝘱': 'p', '𝘲': 'q', '𝘳': 'r', '𝘴': 's',
      '𝘵': 't', '𝘶': 'u', '𝘷': 'v', '𝘸': 'w', '𝘹': 'x',
      '𝘺': 'y', '𝘻': 'z',
      // Font bold italic
      '𝙀': 'E', '𝙁': 'F', '𝙂': 'G', '𝙃': 'H', '𝙄': 'I',
      '𝙅': 'J', '𝙆': 'K', '𝙇': 'L', '𝙈': 'M', '𝙉': 'N',
      '𝙊': 'O', '𝙋': 'P', '𝙌': 'Q', '𝙍': 'R', '𝙎': 'S',
      '𝙏': 'T', '𝙐': 'U', '𝙑': 'V', '𝙒': 'W', '𝙓': 'X',
      '𝙔': 'Y', '𝙕': 'Z', '𝙖': 'a', '𝙗': 'b', '𝙘': 'c',
      '𝙙': 'd', '𝙚': 'e', '𝙛': 'f', '𝙜': 'g', '𝙝': 'h',
      '𝙞': 'i', '𝙟': 'j', '𝙠': 'k', '𝙡': 'l', '𝙢': 'm',
      '𝙣': 'n', '𝙤': 'o', '𝙥': 'p', '𝙦': 'q', '𝙧': 'r',
      '𝙨': 's', '𝙩': 't', '𝙪': 'u', '𝙫': 'v', '𝙬': 'w',
      '𝙭': 'x', '𝙮': 'y', '𝙯': 'z'
    };

    // Thay thế từng ký tự nếu có trong map
    return text.split('').map(char => specialFontMap[char] || char).join('');
  },

  
  formatUptime: function(uptime, includePrefix = false) {
    const days = Math.floor(uptime / 86400);
    const hours = Math.floor((uptime % 86400) / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const seconds = Math.floor(uptime % 60);
    
    let uptimeString = '';
    
    if (days > 0) {
      uptimeString += `${days}d `;
    }
    
    if (hours > 0 || days > 0) {
      uptimeString += `${hours}h `;
    }
    
    if (minutes > 0 || hours > 0 || days > 0) {
      uptimeString += `${minutes}m `;
    }
    
    uptimeString += `${seconds}s`;
    
    return includePrefix ? `Uptime: ${uptimeString}` : uptimeString;
  }
};
