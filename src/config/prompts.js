const fs = require('node:fs');
const path = require('node:path');

function loadPrompts() {
  const promptsPath = path.join(__dirname, '..', 'assets', 'json', 'prompts.json');

  try {
    const fileContent = fs.readFileSync(promptsPath, 'utf8');
    return JSON.parse(fileContent);
  } catch (error) {
    throw new Error(`Failed to load prompts from ${promptsPath}: ${error.message}`);
  }
}

module.exports = loadPrompts();