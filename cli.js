#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { masterData } from './data.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const NOTE = 'Delete this field when editing. JSON doesn\'t keep comments. This file has all possible resume fields - remove sections you don\'t need. Fields with show_resume: false will be excluded from PDF.';

const DEMO_RESUME = {
  "_NOTE": NOTE,
  ...masterData
};

function showUsage() {
  console.log(`Usage: ats-resume [options]

Options:
  --json                 Create demo-resume.json with maximum possible information
  --create [jsonFile]    Generate PDF from JSON file (defaults to demo-resume.json)

Examples:
  ats-resume --json              Create the template JSON file
  ats-resume --create my-resume.json   Generate PDF from custom JSON file`);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    showUsage();
    return;
  }

  if (args[0] === '--json') {
    const outputPath = process.cwd() + '/demo-resume.json';
    writeFileSync(outputPath, JSON.stringify(DEMO_RESUME, null, 2));
    console.log('Created demo-resume.json with maximum possible information. Edit with your details and delete sections you don\'t need.');
    return;
  }

  if (args[0] === '--create') {
    const { generatePDF } = await import('./index.js');

    const jsonFile = args[1] || 'demo-resume.json';
    const filePath = process.cwd() + '/' + jsonFile;

    let data;
    try {
      const content = readFileSync(filePath, 'utf8');
      data = JSON.parse(content);
    } catch (err) {
      if (err.code === 'ENOENT') {
        console.error(`Error: File '${jsonFile}' not found in current directory.`);
      } else if (err instanceof SyntaxError) {
        console.error(`Error: Invalid JSON in '${jsonFile}'.`);
      } else {
        console.error(`Error: Could not read '${jsonFile}'.`);
      }
      process.exit(1);
    }

    if (!data.personalInfo) {
      console.error('Error: Missing personalInfo object in JSON.');
      process.exit(1);
    }

    if (!data.personalInfo.nickname) {
      console.error('Error: Missing personalInfo.nickname in JSON.');
      process.exit(1);
    }

    if (!data.personalInfo.fullName) {
      console.error('Error: Missing personalInfo.fullName in JSON.');
      process.exit(1);
    }

    const outputPath = process.cwd() + '/' + data.personalInfo.nickname + '-resume.pdf';

    try {
      await generatePDF(data, outputPath);
      console.log(`Created ${data.personalInfo.nickname}-resume.pdf successfully!`);
    } catch (err) {
      console.error(`Error: Failed to generate PDF - ${err.message}`);
      process.exit(1);
    }
    return;
  }

  showUsage();
}

main();
