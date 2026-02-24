/**
 * Discord Formatter - Post-processes AI output to remove Discord-incompatible formatting
 * Handles: em dashes, tables, horizontal rules, LaTeX math, citation markers
 */

/**
 * Convert a markdown table into a bullet list
 * @param {string} tableText - The raw markdown table text
 * @returns {string} - Formatted as a bullet list
 */
function convertTableToBulletList(tableText) {
    const lines = tableText.trim().split('\n');

    // Extract header row
    const headerLine = lines[0];
    const headers = headerLine
        .split('|')
        .map(h => h.trim())
        .filter(h => h.length > 0);

    // Find data rows (skip separator line)
    const dataRows = lines
        .slice(1)
        .filter(line => !line.match(/^\s*\|[\s\-:|]+\|\s*$/));

    if (dataRows.length === 0) return '';

    const result = [];
    for (const row of dataRows) {
        const cells = row
            .split('|')
            .map(c => c.trim())
            .filter(c => c.length > 0);

        if (cells.length === 0) continue;

        // Build a bullet item from header:value pairs
        const parts = [];
        for (let i = 0; i < cells.length && i < headers.length; i++) {
            parts.push(`**${headers[i]}**: ${cells[i]}`);
        }
        result.push(`- ${parts.join(' | ')}`);
    }

    return result.join('\n');
}

/**
 * Convert LaTeX-like math notation to plain text with Unicode symbols
 * @param {string} text
 * @returns {string}
 */
function convertLatexToPlainText(text) {
    let result = text;

    // Remove display math delimiters \[...\] and $$...$$
    result = result.replace(/\\\[([\s\S]*?)\\\]/g, (_, content) => convertLatexContent(content));
    result = result.replace(/\$\$([\s\S]*?)\$\$/g, (_, content) => convertLatexContent(content));

    // Remove inline math delimiters $...$
    result = result.replace(/\$([^$]+?)\$/g, (_, content) => convertLatexContent(content));

    // Clean up any remaining LaTeX commands outside of math delimiters
    result = convertLatexContent(result);

    return result;
}

/**
 * Convert LaTeX content (inside math delimiters) to plain text
 * @param {string} content
 * @returns {string}
 */
function convertLatexContent(content) {
    let result = content;

    // \frac{a}{b} → a/b
    result = result.replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, '$1/$2');

    // \text{...} → ...
    result = result.replace(/\\text\{([^}]*)\}/g, '$1');

    // \textbf{...} → ...
    result = result.replace(/\\textbf\{([^}]*)\}/g, '**$1**');

    // \mathrm{...} → ...
    result = result.replace(/\\mathrm\{([^}]*)\}/g, '$1');

    // Superscript: ^{n} → superscript Unicode or ^n
    result = result.replace(/\^\{([^}]*)\}/g, (_, exp) => {
        const superscriptMap = {
            '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
            '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
            '+': '⁺', '-': '⁻', 'n': 'ⁿ'
        };
        // Try to convert each character
        const converted = exp.split('').map(c => superscriptMap[c] || c).join('');
        // If all chars were converted, use Unicode; otherwise fallback to ^(exp)
        const allConverted = exp.split('').every(c => c in superscriptMap || c === ' ');
        return allConverted ? converted : `^(${exp})`;
    });

    // Simple superscript: ^n (single char)
    result = result.replace(/\^(\d)/g, (_, d) => {
        const map = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };
        return map[d] || `^${d}`;
    });

    // Subscript: _{n} → subscript Unicode or _n
    result = result.replace(/_\{([^}]*)\}/g, (_, sub) => {
        const subscriptMap = {
            '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄',
            '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉',
            '+': '₊', '-': '₋'
        };
        const converted = sub.split('').map(c => subscriptMap[c] || c).join('');
        const allConverted = sub.split('').every(c => c in subscriptMap || c === ' ');
        return allConverted ? converted : `_${sub}`;
    });

    // Common LaTeX symbols
    result = result.replace(/\\times/g, '×');
    result = result.replace(/\\div/g, '÷');
    result = result.replace(/\\pm/g, '±');
    result = result.replace(/\\rightarrow/g, '→');
    result = result.replace(/\\leftarrow/g, '←');
    result = result.replace(/\\Rightarrow/g, '⇒');
    result = result.replace(/\\Leftarrow/g, '⇐');
    result = result.replace(/\\approx/g, '≈');
    result = result.replace(/\\neq/g, '≠');
    result = result.replace(/\\leq/g, '≤');
    result = result.replace(/\\geq/g, '≥');
    result = result.replace(/\\infty/g, '∞');
    result = result.replace(/\\alpha/g, 'α');
    result = result.replace(/\\beta/g, 'β');
    result = result.replace(/\\gamma/g, 'γ');
    result = result.replace(/\\delta/g, 'δ');
    result = result.replace(/\\pi/g, 'π');
    result = result.replace(/\\theta/g, 'θ');
    result = result.replace(/\\sigma/g, 'σ');
    result = result.replace(/\\mu/g, 'μ');
    result = result.replace(/\\lambda/g, 'λ');
    result = result.replace(/\\sqrt\{([^}]*)\}/g, '√($1)');
    result = result.replace(/\\cdot/g, '·');
    result = result.replace(/\\qquad/g, '  ');
    result = result.replace(/\\quad/g, ' ');
    result = result.replace(/\\,/g, ' ');
    result = result.replace(/\\;/g, ' ');
    result = result.replace(/\\ /g, ' ');

    // Remove remaining \command patterns that weren't caught
    result = result.replace(/\\([a-zA-Z]+)/g, (_, cmd) => {
        // Keep some that might be intentional
        const keepCommands = ['n', 't', 'r'];
        return keepCommands.includes(cmd) ? `\\${cmd}` : cmd;
    });

    // Clean up extra braces
    result = result.replace(/\{([^{}]*)\}/g, '$1');

    return result;
}

/**
 * Main formatter function - sanitizes AI output for Discord
 * @param {string} text - Raw AI response text
 * @returns {string} - Discord-compatible formatted text
 */
function formatForDiscord(text) {
    if (!text || typeof text !== 'string') return text;

    let result = text;

    // 1. Convert LaTeX math (do this FIRST before other replacements)
    result = convertLatexToPlainText(result);

    // 2. Replace em dashes and en dashes with regular hyphens
    result = result.replace(/\u2014/g, '-');  // em dash —
    result = result.replace(/\u2013/g, '-');  // en dash –

    // 3. Convert markdown tables to bullet lists
    // Match table blocks: lines starting with | and containing |
    const tableRegex = /(?:^|\n)((?:\|[^\n]+\|\s*\n){2,})/g;
    result = result.replace(tableRegex, (match, table) => {
        const converted = convertTableToBulletList(table);
        return (match.startsWith('\n') ? '\n' : '') + converted;
    });

    // 4. Remove horizontal rules (--- or *** or ___ on their own line)
    result = result.replace(/^\s*[-*_]{3,}\s*$/gm, '');

    // 5. Remove citation markers [1], [2], etc.
    result = result.replace(/\[(\d+)\]/g, '');

    // 6. Clean up excessive blank lines (more than 2 consecutive)
    result = result.replace(/\n{4,}/g, '\n\n\n');

    // 7. Trim trailing whitespace from lines
    result = result.replace(/[ \t]+$/gm, '');

    return result.trim();
}

module.exports = { formatForDiscord, convertTableToBulletList, convertLatexToPlainText };
