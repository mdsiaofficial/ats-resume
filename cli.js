#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { masterData } from './data.js';
import { parseJsonc } from './jsonc.js';
import { buildTemplate } from './template-jsonc.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DEMO_FILE = 'demo-resume.jsonc';
const LEGACY_DEMO_FILE = 'demo-resume.json';

function showUsage() {
  console.log(`Usage: ats-resume [options]

Options:
  --json                 Create ${DEMO_FILE} with maximum possible information
  --create [jsonFile]    Generate PDF from JSON/JSONC file (defaults to ${DEMO_FILE})

Examples:
  ats-resume --json              Create the template JSONC file
  ats-resume --create my-resume.jsonc   Generate PDF from custom JSON/JSONC file

Notes:
  The data file may be .json or .jsonc. JSONC files may contain // and /* */ comments
  and trailing commas.`);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    showUsage();
    return;
  }

  if (args[0] === '--json') {
    if (args.length > 1 && args[1].startsWith('-')) {
      showUsage();
      console.error(`Error: Unknown option '${args[1]}'.`);
      process.exitCode = 1;
      return;
    }

    const outputPath = resolve(process.cwd(), DEMO_FILE);
    writeFileSync(outputPath, buildTemplate(masterData));
    console.log(`Created ${DEMO_FILE} with maximum possible information. Comments are supported - edit with your details and delete sections you don't need.`);
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

    if (!args[1] && !existsSync(resolve(process.cwd(), jsonFile)) && existsSync(resolve(process.cwd(), LEGACY_DEMO_FILE))) {
      console.log(`Note: using ${LEGACY_DEMO_FILE} (no ${DEMO_FILE} file found)`);
      jsonFile = LEGACY_DEMO_FILE;
    }

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

    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      console.error('Error: The resume data file must contain a JSON object with a personalInfo object.');
      process.exitCode = 1;
      return;
    }

    if (!data.personalInfo) {
      console.error('Error: Missing personalInfo object in the resume data file.');
      process.exitCode = 1;
      return;
    }

    if (!data.personalInfo.nickname) {
      console.error('Error: Missing personalInfo.nickname in the resume data file.');
      process.exitCode = 1;
      return;
    }

    if (!data.personalInfo.fullName) {
      console.error('Error: Missing personalInfo.fullName in the resume data file.');
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
