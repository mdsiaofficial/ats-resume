#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import readline from 'readline';
import { masterData } from './data.js';
import { parseJsonc } from './jsonc.js';
import { buildTemplate, AVAILABLE_SECTIONS, filterDataBySections } from './template-jsonc.js';
import { validateResumeData, formatValidationIssues } from './validate.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DEMO_FILE = 'resume.jsonc';

function showUsage() {
  console.log(`Usage: ats-resume [options]

Options:
  --json                 Create ${DEMO_FILE} interactively (select sections)
  --json --all           Create ${DEMO_FILE} with all possible sections
  --create [jsonFile]    Generate PDF from JSON/JSONC file (defaults to ${DEMO_FILE})

Examples:
  ats-resume --json              Create the template JSONC file interactively
  ats-resume --json --all        Create the template JSONC file with all sections
  ats-resume --create my-resume.jsonc   Generate PDF from custom JSON/JSONC file

Notes:
  The data file may be .json or .jsonc. JSONC files may contain // and /* */ comments
  and trailing commas.`);
}

/**
 * Interactively prompts the user to select which sections to include.
 * Returns an array of selected section keys.
 *
 * @param {readline.Interface} [customRl]
 * @returns {Promise<string[]>}
 */
export async function promptSectionSelection(customRl = null) {
  const rl = customRl || readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const shouldClose = !customRl;

  try {
    console.log('\nSelect sections to include in your resume JSONC file:');
    console.log('(Note: Personal Info is always included as it is required)\n');

    AVAILABLE_SECTIONS.forEach((sec, idx) => {
      console.log(`  [${idx + 1}] ${sec.label}`);
    });
    console.log(`  [a] All sections`);
    console.log('');

    const answer = await new Promise((resolve) => {
      rl.question('Enter section numbers separated by commas or spaces (or "a" for all) [default: all]: ', (ans) => {
        resolve(ans.trim());
      });
    });

    if (!answer || answer.toLowerCase() === 'a' || answer.toLowerCase() === 'all') {
      return AVAILABLE_SECTIONS.map(s => s.key);
    }

    // Parse selections (can be separated by commas, spaces, or tabs)
    const tokens = answer.split(/[\s,]+/).filter(Boolean);
    const selectedIndices = new Set();

    for (const token of tokens) {
      if (token.toLowerCase() === 'a' || token.toLowerCase() === 'all') {
        return AVAILABLE_SECTIONS.map(s => s.key);
      }
      const num = parseInt(token, 10);
      if (!isNaN(num) && num >= 1 && num <= AVAILABLE_SECTIONS.length) {
        selectedIndices.add(num - 1);
      } else {
        console.warn(`Warning: Ignoring unrecognized choice "${token}".`);
      }
    }

    if (selectedIndices.size === 0) {
      console.log('No valid sections selected; defaulting to all sections.');
      return AVAILABLE_SECTIONS.map(s => s.key);
    }

    return Array.from(selectedIndices).map(idx => AVAILABLE_SECTIONS[idx].key);
  } finally {
    if (shouldClose) {
      rl.close();
    }
  }
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    showUsage();
    return;
  }

  if (args[0] === '--json') {
    let selectedKeys = null;

    if (args.length > 1) {
      if (args[1] === '--all') {
        selectedKeys = null; // keep all sections
      } else {
        showUsage();
        console.error(`Error: Unknown option '${args[1]}'.`);
        process.exitCode = 1;
        return;
      }
    } else {
      // If running in an interactive terminal, prompt the user.
      // If stdin is not a TTY (e.g. piped or automated script), default to all sections.
      if (process.stdin.isTTY) {
        selectedKeys = await promptSectionSelection();
      }
    }

    const filteredData = filterDataBySections(masterData, selectedKeys);
    const outputPath = resolve(process.cwd(), DEMO_FILE);
    writeFileSync(outputPath, buildTemplate(filteredData));
    console.log(`\nCreated ${DEMO_FILE} successfully! Comments are supported - edit with your details.`);
    return;
  }

  if (args[0] === '--create') {
    if (args.length > 1 && args[1].startsWith('-')) {
      showUsage();
      console.error(`Error: Unknown option '${args[1]}'.`);
      process.exitCode = 1;
      return;
    }

    const { generatePDF } = await import('./index.js');

    let jsonFile = args[1] || DEMO_FILE;

    // resolve() (not join) so an absolute path argument is used as given.
    const filePath = resolve(process.cwd(), jsonFile);

    let data;
    try {
      const content = readFileSync(filePath, 'utf8');
      data = parseJsonc(content, jsonFile);
    } catch (err) {
      if (err.code === 'ENOENT') {
        console.error(`Error: File '${jsonFile}' not found.`);
      } else if (err.code === 'ERR_JSONC_PARSE' || err instanceof SyntaxError) {
        console.error(`Error: ${err.message}`);
        console.error('The file may contain comments - JSONC is supported (// and /* */ comments, trailing commas).');
      } else {
        console.error(`Error: Could not read '${jsonFile}': ${err.message}`);
      }
      process.exitCode = 1;
      return;
    }

    const issues = validateResumeData(data);
    if (issues.length > 0) {
      console.error(`Error: ${formatValidationIssues(issues, jsonFile)}`);
      process.exitCode = 1;
      return;
    }

    const outputPath = resolve(process.cwd(), `${data.personalInfo.nickname}-resume.pdf`);

    try {
      await generatePDF(data, outputPath, { baseDir: dirname(filePath) });
      console.log(`Created ${data.personalInfo.nickname}-resume.pdf successfully!`);
    } catch (err) {
      console.error(`Error: Failed to generate PDF - ${err.message}`);
      process.exitCode = 1;
    }
    return;
  }

  showUsage();
  console.error(`Error: Unknown option '${args[0]}'.`);
  process.exitCode = 1;
}

main().catch(err => {
  console.error(`Error: ${err && err.message ? err.message : err}`);
  process.exitCode = 1;
});
