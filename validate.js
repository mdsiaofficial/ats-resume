/**
 * Semantic validation for resume data.
 *
 * This runs after the JSONC file has been parsed. It reports every missing
 * required field and every value with the wrong shape, using a path such as
 * `experience[1].title` so the user can find the problem quickly.
 *
 * Sections are optional (delete the ones you do not need), but once a section
 * exists, its visible entries must contain the fields the PDF template needs.
 * Entries with `"show_resume": false` are skipped because they are not printed.
 */

const PERSONAL_REQUIRED = [
  ['fullName', 'your full name'],
  ['nickname', 'a short name used for the output file'],
  ['email', 'your email address']
];

const PERSONAL_STRINGS = [
  'fullName',
  'nickname',
  'email',
  'phone',
  'location',
  'linkedin',
  'github',
  'website',
  'image',
  'imageShape',
  'headerLinkStyle'
];

const SECTION_RULES = {
  experience: {
    required: [
      ['title', 'job title'],
      ['company', 'company name']
    ],
    strings: ['title', 'company', 'location', 'startDate', 'endDate', 'website', 'image', 'impact'],
    arraysOfStrings: [
      ['bullets', 'bullet points'],
      ['technologies', 'technologies']
    ],
    years: [],
    booleans: ['current', 'show_resume', 'show_portfolio'],
    contextFields: ['title', 'company']
  },
  education: {
    required: [
      ['institution', 'school or university name'],
      ['degree', 'degree or certificate name']
    ],
    strings: ['institution', 'degree', 'field', 'gpa', 'honors'],
    arraysOfStrings: [['coursework', 'coursework']],
    years: ['startYear', 'endYear'],
    booleans: ['show_resume', 'show_portfolio'],
    contextFields: ['degree', 'institution']
  },
  skills: {
    required: [
      ['name', 'skill name'],
      ['category', 'skill category, for example "languages" or "frontend"']
    ],
    strings: ['name', 'category', 'description'],
    arraysOfStrings: [['projects', 'related projects']],
    years: [],
    booleans: ['show_resume', 'show_portfolio'],
    contextFields: ['name', 'category']
  },
  projects: {
    required: [['name', 'project name']],
    strings: ['name', 'role', 'startDate', 'endDate', 'link', 'github', 'image', 'deployment', 'architecture'],
    arraysOfStrings: [
      ['bullets', 'bullet points'],
      ['technologies', 'technologies']
    ],
    years: [],
    booleans: ['featured', 'show_resume', 'show_portfolio'],
    contextFields: ['name']
  },
  certifications: {
    required: [['name', 'certification name']],
    strings: ['name', 'issuer', 'issueDate', 'credentialId', 'logo', 'certificate'],
    arraysOfStrings: [],
    years: [],
    booleans: ['show_resume', 'show_portfolio'],
    contextFields: ['name']
  },
  achievements: {
    required: [['title', 'achievement title']],
    strings: ['title', 'issuer', 'date', 'location', 'description', 'logo', 'certificate'],
    arraysOfStrings: [],
    years: [],
    booleans: ['show_resume', 'show_portfolio'],
    contextFields: ['title']
  },
  volunteerExperience: {
    required: [
      ['organization', 'organization name'],
      ['role', 'your role']
    ],
    strings: ['organization', 'role', 'startDate', 'endDate', 'description', 'website', 'image'],
    arraysOfStrings: [],
    years: [],
    booleans: ['current', 'show_resume', 'show_portfolio'],
    contextFields: ['role', 'organization']
  },
  languages: {
    required: [
      ['language', 'language name'],
      ['proficiency', 'proficiency level, for example "Native"']
    ],
    strings: ['language', 'proficiency'],
    arraysOfStrings: [],
    years: [],
    booleans: ['show_resume', 'show_portfolio'],
    contextFields: ['language']
  },
  professionalAffiliations: {
    required: [['organization', 'organization name']],
    strings: ['organization', 'role', 'startDate', 'website'],
    arraysOfStrings: [],
    years: [],
    booleans: ['current', 'show_resume', 'show_portfolio'],
    contextFields: ['organization', 'role']
  },
  publications: {
    required: [['title', 'publication title']],
    strings: ['title', 'publisher', 'date', 'url', 'description'],
    arraysOfStrings: [],
    years: [],
    booleans: ['show_resume', 'show_portfolio'],
    contextFields: ['title']
  },
  references: {
    required: [['name', 'reference name']],
    strings: ['name', 'relationship', 'company', 'email', 'phone'],
    arraysOfStrings: [],
    years: [],
    booleans: ['show_resume', 'show_portfolio'],
    contextFields: ['name']
  }
};

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function describeType(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function isMissing(value) {
  return value === undefined || value === null || (typeof value === 'string' && value.trim() === '');
}

function abbreviate(value, max = 40) {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

/** Builds a short label such as `title: "Engineer", company: "Nexora Labs"`. */
function describeEntry(entry, fields) {
  const parts = [];
  for (const field of fields || []) {
    const value = entry[field];
    if (typeof value === 'string' && value.trim()) {
      parts.push(`${field}: ${JSON.stringify(abbreviate(value))}`);
    }
  }
  return parts.length ? parts.join(', ') : null;
}

function requireString(entry, field, description, add, hint = null) {
  const value = entry[field];
  if (isMissing(value)) {
    add(field, `Missing required field "${field}" (${description}).`, hint || `Add "${field}": "..." to this entry.`);
    return;
  }
  if (typeof value !== 'string') {
    add(
      field,
      `Expected "${field}" to be a string (${description}), but found ${describeType(value)}.`,
      'Use a double-quoted string value.'
    );
  }
}

function checkString(entry, field, add) {
  if (!(field in entry) || entry[field] == null) return;
  if (typeof entry[field] !== 'string') {
    add(
      field,
      `Expected "${field}" to be a string, but found ${describeType(entry[field])}.`,
      'Use a double-quoted string value.'
    );
  }
}

function checkBoolean(entry, field, add) {
  if (!(field in entry) || entry[field] == null) return;
  if (typeof entry[field] !== 'boolean') {
    add(
      field,
      `Expected "${field}" to be true or false, but found ${describeType(entry[field])}.`,
      `Use ${field}: true or ${field}: false (without quotes).`
    );
  }
}

function checkStringArray(entry, field, description, add) {
  if (!(field in entry) || entry[field] == null) return;
  const value = entry[field];
  if (!Array.isArray(value)) {
    add(
      field,
      `Expected "${field}" to be an array of ${description}, but found ${describeType(value)}.`,
      'Wrap the value in [ ... ] and put each item in double quotes.'
    );
    return;
  }
  value.forEach((item, index) => {
    if (typeof item !== 'string') {
      add(`${field}[${index}]`, `Expected a string, but found ${describeType(item)}.`, 'Use a double-quoted string for each item.');
    }
  });
}

function checkYear(entry, field, add) {
  if (!(field in entry) || entry[field] == null) return;
  const value = entry[field];
  if (typeof value !== 'number' && typeof value !== 'string') {
    add(field, `Expected "${field}" to be a year, but found ${describeType(value)}.`, 'Use a number such as 2022.');
  }
}

function validatePersonalInfo(data, issues) {
  if (!('personalInfo' in data)) {
    issues.push({
      path: 'personalInfo',
      section: 'personalInfo',
      message: 'Missing required section "personalInfo".',
      hint: 'Add "personalInfo": { "fullName": "...", "nickname": "...", "email": "..." }.'
    });
    return;
  }

  const info = data.personalInfo;
  if (!isPlainObject(info)) {
    issues.push({
      path: 'personalInfo',
      section: 'personalInfo',
      message: `Expected "personalInfo" to be an object, but found ${describeType(info)}.`,
      hint: 'Use { ... } around the personal information.'
    });
    return;
  }

  const add = (suffix, message, hint) => {
    issues.push({
      path: `personalInfo.${suffix}`,
      section: 'personalInfo',
      message,
      hint
    });
  };

  for (const [field, description] of PERSONAL_REQUIRED) {
    requireString(info, field, description, add, `Add "${field}": "..." inside "personalInfo".`);
  }

  const requiredNames = new Set(PERSONAL_REQUIRED.map(([field]) => field));
  for (const field of PERSONAL_STRINGS) {
    if (requiredNames.has(field)) continue;
    checkString(info, field, add);
  }

  checkStringArray(info, 'titles', 'job titles', add);

  for (const field of ['show_resume', 'show_portfolio']) {
    checkBoolean(info, field, add);
  }
}

function validateSection(section, value, rules, issues) {
  if (!Array.isArray(value)) {
    issues.push({
      path: section,
      section,
      message: `Expected "${section}" to be an array of entries, but found ${describeType(value)}.`,
      hint: `Wrap the ${section} entries in [ ... ].`
    });
    return;
  }

  value.forEach((entry, index) => {
    const entryPath = `${section}[${index}]`;

    if (!isPlainObject(entry)) {
      issues.push({
        path: entryPath,
        section,
        entryIndex: index,
        message: `Expected an entry object, but found ${describeType(entry)}.`,
        hint: 'Each entry must be an object { ... }.'
      });
      return;
    }

    const meta = {
      section,
      entryIndex: index,
      context: describeEntry(entry, rules.contextFields)
    };

    const add = (suffix, message, hint) => {
      issues.push({
        path: `${entryPath}.${suffix}`,
        ...meta,
        message,
        hint
      });
    };

    // Check the flags even on hidden entries: `"show_resume": "false"` is a
    // common mistake and would make the entry appear in the PDF.
    for (const field of rules.booleans || []) {
      checkBoolean(entry, field, add);
    }

    if (entry.show_resume === false) return;

    for (const [field, description] of rules.required) {
      requireString(entry, field, description, add);
    }

    const requiredNames = new Set(rules.required.map(([field]) => field));
    for (const field of rules.strings || []) {
      if (requiredNames.has(field)) continue;
      checkString(entry, field, add);
    }

    for (const [field, description] of rules.arraysOfStrings || []) {
      checkStringArray(entry, field, description, add);
    }

    for (const field of rules.years || []) {
      checkYear(entry, field, add);
    }
  });
}

function validateCustomSections(value, issues) {
  if (!Array.isArray(value)) {
    issues.push({
      path: 'customSections',
      section: 'customSections',
      message: `Expected "customSections" to be an array, but found ${describeType(value)}.`,
      hint: 'Wrap the custom sections in [ ... ].'
    });
    return;
  }

  value.forEach((section, index) => {
    const sectionPath = `customSections[${index}]`;

    if (!isPlainObject(section)) {
      issues.push({
        path: sectionPath,
        section: 'customSections',
        entryIndex: index,
        message: `Expected a section object, but found ${describeType(section)}.`,
        hint: 'Each custom section must be an object { ... }.'
      });
      return;
    }

    const sectionContext = describeEntry(section, ['heading']);
    const meta = { section: 'customSections', entryIndex: index, context: sectionContext };

    const add = (suffix, message, hint) => {
      issues.push({
        path: `${sectionPath}.${suffix}`,
        ...meta,
        message,
        hint
      });
    };

    checkBoolean(section, 'show_resume', add);
    if (section.show_resume === false) return;

    requireString(section, 'heading', 'section heading', add);

    if (!('items' in section) || section.items == null) return;

    if (!Array.isArray(section.items)) {
      add('items', `Expected "items" to be an array, but found ${describeType(section.items)}.`, 'Wrap the items in [ ... ].');
      return;
    }

    section.items.forEach((item, itemIndex) => {
      const itemPath = `items[${itemIndex}]`;

      if (!isPlainObject(item)) {
        issues.push({
          path: `${sectionPath}.${itemPath}`,
          section: 'customSections',
          entryIndex: index,
          context: sectionContext,
          message: `Expected an item object, but found ${describeType(item)}.`,
          hint: 'Each item must be an object { ... }.'
        });
        return;
      }

      const itemContext = describeEntry(item, ['title']);
      const combinedContext = [sectionContext, itemContext].filter(Boolean).join(', ') || null;
      const itemAdd = (suffix, message, hint) => {
        issues.push({
          path: `${sectionPath}.${itemPath}.${suffix}`,
          section: 'customSections',
          entryIndex: index,
          context: combinedContext,
          message,
          hint
        });
      };

      requireString(item, 'title', 'item title', itemAdd);
      for (const field of ['date', 'location', 'description']) {
        checkString(item, field, itemAdd);
      }
    });
  });
}

/**
 * Validates parsed resume data.
 *
 * @param {object} data The parsed JSONC object.
 * @returns {Array<{path:string,message:string,hint?:string,section?:string,entryIndex?:number,context?:string}>}
 */
export function validateResumeData(data) {
  const issues = [];

  if (!isPlainObject(data)) {
    issues.push({
      path: '(root)',
      message: `The resume file must contain a single JSON object, but found ${describeType(data)}.`,
      hint: 'Wrap all resume fields in { ... }.'
    });
    return issues;
  }

  validatePersonalInfo(data, issues);

  for (const field of ['summary_resume', 'summary_portfolio']) {
    if (!(field in data) || data[field] == null) continue;
    if (typeof data[field] !== 'string') {
      issues.push({
        path: field,
        message: `Expected "${field}" to be a string, but found ${describeType(data[field])}.`,
        hint: 'Use a double-quoted string value.'
      });
    }
  }

  if ('socialLinks' in data && data.socialLinks != null) {
    if (!isPlainObject(data.socialLinks)) {
      issues.push({
        path: 'socialLinks',
        message: `Expected "socialLinks" to be an object, but found ${describeType(data.socialLinks)}.`,
        hint: 'Use { "linkedin": "...", "github": "..." }.'
      });
    } else {
      for (const [key, value] of Object.entries(data.socialLinks)) {
        if (typeof value !== 'string') {
          issues.push({
            path: `socialLinks.${key}`,
            message: `Expected "socialLinks.${key}" to be a string, but found ${describeType(value)}.`,
            hint: 'Use a double-quoted URL or handle.'
          });
        }
      }
    }
  }

  for (const [section, rules] of Object.entries(SECTION_RULES)) {
    if (!(section in data)) continue;
    validateSection(section, data[section], rules, issues);
  }

  if ('customSections' in data) {
    validateCustomSections(data.customSections, issues);
  }

  return issues;
}

/**
 * Formats validation issues into a readable console report.
 *
 * @param {Array} issues  The list returned by validateResumeData.
 * @param {string} filename The data file name shown in the heading.
 * @returns {string}
 */
export function formatValidationIssues(issues, filename = 'resume data') {
  const maxShown = 25;
  const shown = issues.slice(0, maxShown);
  const lines = [];

  lines.push(`'${filename}' has ${issues.length} problem${issues.length === 1 ? '' : 's'} that must be fixed:`);
  lines.push('');

  shown.forEach((issue, index) => {
    lines.push(`  ${index + 1}. ${issue.path}`);
    lines.push(`     ${issue.message}`);

    if (issue.section) {
      let where = `     Section: ${issue.section}`;
      if (issue.entryIndex !== undefined) {
        where += `, entry ${issue.entryIndex + 1}`;
        if (issue.context) where += ` (${issue.context})`;
      }
      where += '.';
      lines.push(where);
    }

    if (issue.hint) lines.push(`     Hint: ${issue.hint}`);
    lines.push('');
  });

  if (issues.length > maxShown) {
    const remaining = issues.length - maxShown;
    lines.push(`  ...and ${remaining} more problem${remaining === 1 ? '' : 's'}.`);
    lines.push('');
  }

  lines.push('Fix the problem(s) above and run the command again.');
  return lines.join('\n');
}
