/**
 * Builds the demo JSONC template.
 *
 * The template is the demo data rendered as pretty JSON with a header comment
 * and one comment block per top-level section.
 */

const HEADER_COMMENT = [
  'Resume data for ats-resume.',
  '',
  'This file contains every possible resume field - delete the sections you do not need.',
  'Comments are allowed: use // for a line comment, /* ... */ for a block comment,',
  'and trailing commas are permitted.',
  '',
  'Set "show_resume": false on an entry to exclude it from the generated PDF.',
  '',
  'summary_resume is the short summary printed in the PDF, summary_portfolio the',
  'longer summary used by the portfolio project.'
];

/**
 * Comments inserted after the top-level key they describe.
 *
 * The key is matched at the start of a line and at the exact two-space indent
 * that `JSON.stringify(data, null, 2)` gives top-level keys, so a nested key
 * with the same name (e.g. a skill's own "projects" list) is never matched.
 * A key that is not present in the data is simply skipped.
 */
export const SECTION_COMMENTS = [
  {
    key: 'personalInfo',
    comments: [
      'Header information: name, contact details and links.',
      'image: optional profile photo (local path, https:// URL or data: URI).',
      'imageShape: "circle", "square" or "rounded".',
      'headerLinkStyle: "label" shows WEBSITE/GITHUB/LINKEDIN, "url" shows the actual links.'
    ]
  },
  {
    key: 'experience',
    comments: ['Work experience. Set "show_resume": false on an entry to hide it from the PDF.']
  },
  {
    key: 'education',
    comments: ['Education entries. Set "show_resume": false on an entry to hide it from the PDF.']
  },
  {
    key: 'skills',
    comments: ['Skills, grouped by category. Set "show_resume": false on an entry to hide it from the PDF.']
  },
  {
    key: 'projects',
    comments: ['Projects. Set "show_resume": false on an entry to hide it from the PDF.']
  },
  {
    key: 'certifications',
    comments: ['Certifications. Set "show_resume": false on an entry to hide it from the PDF.']
  },
  {
    key: 'achievements',
    comments: ['Achievements and awards. Set "show_resume": false on an entry to hide it from the PDF.']
  },
  {
    key: 'volunteerExperience',
    comments: ['Volunteer experience. Set "show_resume": false on an entry to hide it from the PDF.']
  },
  {
    key: 'languages',
    comments: ['Languages and proficiency. Set "show_resume": false on an entry to hide it from the PDF.']
  },
  {
    key: 'professionalAffiliations',
    comments: ['Professional affiliations. Set "show_resume": false on an entry to hide it from the PDF.']
  },
  {
    key: 'publications',
    comments: ['Publications. Set "show_resume": false on an entry to hide it from the PDF.']
  },
  {
    key: 'references',
    comments: ['References. Set "show_resume": false on an entry to hide it from the PDF.']
  },
  {
    key: 'customSections',
    comments: ['Custom sections. Set "show_resume": false on an entry to hide it from the PDF.']
  },
  {
    key: 'socialLinks',
    comments: ['Social links shown in the header.']
  }
];

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Inserts comment lines after the line containing each top-level key.
 *
 * Comment lines are indented two spaces deeper than their key so they read as
 * belonging to the block that follows them.
 */
export function injectComments(jsonText) {
  const lines = jsonText.split('\n');
  const matches = [];

  // Every anchor is looked up independently, so the result does not depend on
  // the order of SECTION_COMMENTS or on the order of the keys in the data.
  for (const entry of SECTION_COMMENTS) {
    const pattern = new RegExp(`^ {2}"${escapeRegExp(entry.key)}":`);
    const index = lines.findIndex(line => pattern.test(line));
    if (index === -1) continue;
    matches.push({ index, comments: entry.comments });
  }

  matches.sort((a, b) => a.index - b.index);

  const output = [];
  let cursor = 0;

  for (const match of matches) {
    output.push(...lines.slice(cursor, match.index + 1));
    const indent = lines[match.index].match(/^\s*/)[0];
    const commentIndent = indent + '  ';
    for (const comment of match.comments) {
      output.push(`${commentIndent}// ${comment}`);
    }
    cursor = match.index + 1;
  }

  output.push(...lines.slice(cursor));
  return output.join('\n');
}

/**
 * Renders the demo data as a JSONC template.
 *
 * @param {object} data  The resume data.
 * @returns {string} The template text.
 */
export function buildTemplate(data) {
  const json = JSON.stringify(data, null, 2);
  const header = HEADER_COMMENT.map(line => (line ? `// ${line}` : '//')).join('\n');
  return `${header}\n${injectComments(json)}\n`;
}
