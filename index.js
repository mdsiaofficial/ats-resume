import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseJsonc } from './jsonc.js';
import { validateResumeData, formatValidationIssues } from './validate.js';
import { generatePDF } from './pdf-renderer.js';

export { generatePDF, resolveImageSource, normalizeImageShape, buildDocDefinition, loadProfileImage } from './pdf-renderer.js';

async function main() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);

  // Prefer the JSONC demo file (it may contain comments) and fall back to the
  // plain JSON one so existing checkouts keep working.
  const candidates = ['resume.jsonc', 'resume.json'];
  const dataPath = candidates
    .map(name => path.join(__dirname, name))
    .find(file => fs.existsSync(file));

  if (!dataPath) {
    console.log(`No demo data file found in ${__dirname} (expected ${candidates.join(' or ')}).`);
    return;
  }

  const masterData = parseJsonc(fs.readFileSync(dataPath, 'utf-8'), path.basename(dataPath));
  const issues = validateResumeData(masterData);
  if (issues.length > 0) {
    console.error(`Error: ${formatValidationIssues(issues, path.basename(dataPath))}`);
    process.exitCode = 1;
    return;
  }
  // Resolve relative image paths against the data file, not the current
  // working directory, so the photo is found from any directory.
  await generatePDF(masterData, 'resume.pdf', { baseDir: __dirname });
}

// Only self-run when executed directly, so importing generatePDF from cli.js
// does not trigger an extra PDF build.
const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  main().catch(err => {
    console.error(err && err.message ? err.message : err);
    process.exitCode = 1;
  });
}
