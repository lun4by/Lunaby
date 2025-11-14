const { VM } = require("vm2");
const logger = require("../utils/logger.js");
const { exec } = require("child_process");
const fs = require("fs").promises;
const path = require("path");
const crypto = require("crypto");

/**
 * Code Executor Service
 * Safely execute code snippets in sandboxed environments
 */
class CodeExecutorService {
  constructor() {
    this.tempDir = path.join(__dirname, "../temp");
    this.maxExecutionTime = 10000; // 10 seconds
    this.maxOutputSize = 10000; // 10KB
    
    this.initTempDirectory();
  }

  async initTempDirectory() {
    try {
      await fs.mkdir(this.tempDir, { recursive: true });
      logger.info("CODE_EXECUTOR", "Temporary directory initialized");
    } catch (error) {
      logger.error("CODE_EXECUTOR", `Failed to create temp directory: ${error.message}`);
    }
  }

  /**
   * Execute JavaScript code in VM2 sandbox
   */
  async executeJavaScript(code, options = {}) {
    try {
      logger.info("CODE_EXECUTOR", "Executing JavaScript code");
      
      const vm = new VM({
        timeout: options.timeout || this.maxExecutionTime,
        sandbox: {
          console: {
            log: (...args) => {
              return args.map(arg => String(arg)).join(" ");
            },
          },
          Math,
          Date,
          JSON,
        },
        eval: false,
        wasm: false,
      });
      
      // Capture console.log output
      let output = [];
      const wrappedCode = `
        const results = [];
        const originalLog = console.log;
        console.log = (...args) => {
          const msg = args.map(arg => String(arg)).join(' ');
          results.push(msg);
          return msg;
        };
        
        try {
          const result = (function() {
            ${code}
          })();
          
          if (result !== undefined) {
            results.push(String(result));
          }
          
          return results.join('\\n');
        } catch (error) {
          return 'Error: ' + error.message;
        }
      `;
      
      const result = vm.run(wrappedCode);
      
      logger.info("CODE_EXECUTOR", "JavaScript execution completed");
      
      return {
        success: true,
        output: this.truncateOutput(String(result)),
        language: "javascript",
        executionTime: Date.now(),
      };
    } catch (error) {
      logger.error("CODE_EXECUTOR", `JavaScript execution error: ${error.message}`);
      return {
        success: false,
        error: error.message,
        language: "javascript",
      };
    }
  }

  /**
   * Execute Python code (requires Python installed)
   */
  async executePython(code, options = {}) {
    try {
      logger.info("CODE_EXECUTOR", "Executing Python code");
      
      const sessionId = crypto.randomBytes(16).toString("hex");
      const filePath = path.join(this.tempDir, `python_${sessionId}.py`);
      
      // Write code to temporary file
      await fs.writeFile(filePath, code, "utf8");
      
      return new Promise((resolve) => {
        const timeout = setTimeout(() => {
          resolve({
            success: false,
            error: "Execution timeout",
            language: "python",
          });
        }, options.timeout || this.maxExecutionTime);
        
        exec(
          `python "${filePath}"`,
          {
            timeout: options.timeout || this.maxExecutionTime,
            maxBuffer: this.maxOutputSize,
          },
          async (error, stdout, stderr) => {
            clearTimeout(timeout);
            
            // Clean up temporary file
            try {
              await fs.unlink(filePath);
            } catch (cleanupError) {
              logger.error("CODE_EXECUTOR", `Cleanup error: ${cleanupError.message}`);
            }
            
            if (error && !stdout && !stderr) {
              logger.error("CODE_EXECUTOR", `Python execution error: ${error.message}`);
              resolve({
                success: false,
                error: error.message,
                language: "python",
              });
              return;
            }
            
            const output = stdout || stderr || "";
            
            logger.info("CODE_EXECUTOR", "Python execution completed");
            resolve({
              success: !error || stdout.length > 0,
              output: this.truncateOutput(output),
              error: error ? stderr : null,
              language: "python",
            });
          }
        );
      });
    } catch (error) {
      logger.error("CODE_EXECUTOR", `Python execution error: ${error.message}`);
      return {
        success: false,
        error: error.message,
        language: "python",
      };
    }
  }

  /**
   * Execute SQL query (safe simulation - no actual database connection)
   */
  async executeSQL(query, options = {}) {
    try {
      logger.info("CODE_EXECUTOR", "Simulating SQL query execution");
      
      // This is a safe simulation - parsing and explaining SQL
      // For actual SQL execution, you'd need a sandboxed database
      
      const analysis = this.analyzeSQLQuery(query);
      
      return {
        success: true,
        output: `SQL Query Analysis:\n${analysis}\n\nNote: This is a simulation. No actual database was modified.`,
        language: "sql",
        simulation: true,
      };
    } catch (error) {
      logger.error("CODE_EXECUTOR", `SQL analysis error: ${error.message}`);
      return {
        success: false,
        error: error.message,
        language: "sql",
      };
    }
  }

  /**
   * Analyze SQL query structure
   */
  analyzeSQLQuery(query) {
    const upperQuery = query.toUpperCase().trim();
    
    let analysis = "";
    
    if (upperQuery.startsWith("SELECT")) {
      analysis = "Query Type: SELECT (Read operation)";
    } else if (upperQuery.startsWith("INSERT")) {
      analysis = "Query Type: INSERT (Write operation)";
    } else if (upperQuery.startsWith("UPDATE")) {
      analysis = "Query Type: UPDATE (Modify operation)";
    } else if (upperQuery.startsWith("DELETE")) {
      analysis = "Query Type: DELETE (Remove operation)";
    } else if (upperQuery.startsWith("CREATE")) {
      analysis = "Query Type: CREATE (Schema definition)";
    } else if (upperQuery.startsWith("DROP")) {
      analysis = "Query Type: DROP (Schema deletion)";
    } else {
      analysis = "Query Type: Other SQL statement";
    }
    
    // Count clauses
    const clauses = [];
    if (upperQuery.includes("WHERE")) clauses.push("WHERE");
    if (upperQuery.includes("JOIN")) clauses.push("JOIN");
    if (upperQuery.includes("GROUP BY")) clauses.push("GROUP BY");
    if (upperQuery.includes("ORDER BY")) clauses.push("ORDER BY");
    if (upperQuery.includes("HAVING")) clauses.push("HAVING");
    if (upperQuery.includes("LIMIT")) clauses.push("LIMIT");
    
    if (clauses.length > 0) {
      analysis += `\nClauses used: ${clauses.join(", ")}`;
    }
    
    return analysis;
  }

  /**
   * Execute code based on language detection
   */
  async execute(code, language = null) {
    try {
      // Auto-detect language if not specified
      if (!language) {
        language = this.detectLanguage(code);
      }
      
      language = language.toLowerCase();
      
      switch (language) {
        case "javascript":
        case "js":
        case "node":
          return await this.executeJavaScript(code);
        
        case "python":
        case "py":
          return await this.executePython(code);
        
        case "sql":
          return await this.executeSQL(code);
        
        default:
          return {
            success: false,
            error: `Unsupported language: ${language}. Supported: JavaScript, Python, SQL`,
            language,
          };
      }
    } catch (error) {
      logger.error("CODE_EXECUTOR", `Execution error: ${error.message}`);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Detect programming language from code
   */
  detectLanguage(code) {
    const cleanCode = code.trim();
    
    // Python indicators
    if (
      cleanCode.includes("def ") ||
      cleanCode.includes("import ") ||
      cleanCode.includes("print(") ||
      /^(if|for|while|class)\s+.*:/m.test(cleanCode)
    ) {
      return "python";
    }
    
    // SQL indicators
    if (
      /^(SELECT|INSERT|UPDATE|DELETE|CREATE|DROP|ALTER)\s+/i.test(cleanCode)
    ) {
      return "sql";
    }
    
    // JavaScript indicators (default)
    return "javascript";
  }

  /**
   * Truncate output if too long
   */
  truncateOutput(output) {
    if (output.length > this.maxOutputSize) {
      return output.substring(0, this.maxOutputSize) + "\n... (output truncated)";
    }
    return output;
  }

  /**
   * Check if code contains dangerous operations
   */
  async validateCode(code, language) {
    const dangerousPatterns = {
      javascript: [
        /require\s*\(/i,
        /import\s+.*from/i,
        /process\./i,
        /child_process/i,
        /fs\./i,
        /eval\s*\(/i,
        /Function\s*\(/i,
      ],
      python: [
        /__import__/i,
        /exec\s*\(/i,
        /eval\s*\(/i,
        /open\s*\(/i,
        /os\./i,
        /subprocess/i,
        /system\s*\(/i,
      ],
      sql: [
        /DROP\s+DATABASE/i,
        /DROP\s+TABLE/i,
        /TRUNCATE/i,
        /;\s*DROP/i, // SQL injection attempt
      ],
    };
    
    const patterns = dangerousPatterns[language] || [];
    
    for (const pattern of patterns) {
      if (pattern.test(code)) {
        return {
          safe: false,
          reason: `Potentially dangerous operation detected: ${pattern.source}`,
        };
      }
    }
    
    return { safe: true };
  }

  /**
   * Get supported languages
   */
  getSupportedLanguages() {
    return ["javascript", "python", "sql"];
  }
}

module.exports = new CodeExecutorService();
