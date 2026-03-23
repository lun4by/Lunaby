const IMAGE_COMMAND_REGEX = /^(?:vẽ|tạo hình|tạo ảnh|phác họa|thiết kế|generate|draw|create image|tạo|cho tôi coi|cho mình xem|vẽ hình|hình|tạo ảnh ai)(?:\s+(?:cho\s+(?:tôi|mình|em|anh|chị|tớ|tao|bạn)\s+)?(?:một\s+)?(?:cái\s+)?(?:bức\s+)?(?:hình\s+(?:ảnh\s+)?|ảnh\s+(?:về\s+)?|tranh\s+(?:về\s+)?)?)?\s+(.+)$/i;

const MEMORY_COMMAND_REGEX = /^(nhớ lại|trí nhớ|lịch sử|conversation history|memory|như nãy|vừa gửi|vừa đề cập)\s*(.*)$/i;

const CODE_COMMAND_REGEX = /\b(code|code completion|function|method|write|implement|create|viết code|viết hàm|tạo hàm|code snippet|đoạn code|class|const|let|var|function|def|return|async|await|javascript|python|java|php|c\+\+|ruby|go|rust)\b/gi;

const MEMORY_ANALYSIS_SUMMARY_KEYWORDS = ["ngắn gọn", "tóm tắt"];
const MEMORY_ANALYSIS_DETAILED_KEYWORDS = ["đầy đủ", "chi tiết"];

const LANGUAGE_DETECTION_PATTERNS = {
  python: /import\s+[\w.]+|def\s+\w+\s*\(|print\s*\(/i,
  javascript: /const|let|var|function|=>|\bif\s*\(|console\.log/i,
  java: /public\s+class|void\s+main|System\.out|import\s+java/i,
  html: /<html|<div|<body|<head|<!DOCTYPE/i,
  css: /body\s*{|margin:|padding:|color:|@media/i,
  php: /<\?php|\$\w+\s*=/i,
  typescript: /interface\s+\w+|type\s+\w+\s*=|:\s*string|:\s*number/i,
  go: /package\s+\w+|func\s+\w+|fmt\.Print/i,
  rust: /fn\s+\w+|let\s+mut|println!/i,
  cpp: /#include\s*<|std::|cout\s*<<|namespace/i,
  ruby: /def\s+\w+|puts\s+|require\s+/i,
  sql: /SELECT\s+.+FROM|INSERT\s+INTO|UPDATE\s+.+SET|DELETE\s+FROM/i
};

module.exports = {
  IMAGE_COMMAND_REGEX,
  MEMORY_COMMAND_REGEX,
  CODE_COMMAND_REGEX,
  MEMORY_ANALYSIS_SUMMARY_KEYWORDS,
  MEMORY_ANALYSIS_DETAILED_KEYWORDS,
  LANGUAGE_DETECTION_PATTERNS
};