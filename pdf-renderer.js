import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pdfmake from 'pdfmake';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FONT_DIR = path.join(__dirname, 'fonts');

// CSS px to PDF pt. The old template sized everything in px at the browser's
// 96dpi, so 1px = 0.75pt keeps the printed sizes identical.
const px = value => value * 0.75;

const COLORS = {
  ink: '#000000',
  body: '#1f2937',
  muted: '#4b5563',
  ruleLight: '#d6d9de'
};

const FONT_FAMILIES = {
  // pdfmake only knows normal/bold/italic slots, so the intermediate weights
  // get their own family names instead of being approximated with faux bold.
  Poppins: {
    normal: 'Poppins-Regular.ttf',
    bold: 'Poppins-Bold.ttf',
    italics: 'Poppins-Regular.ttf',
    bolditalics: 'Poppins-Bold.ttf'
  },
  PoppinsMedium: {
    normal: 'Poppins-Medium.ttf',
    bold: 'Poppins-Medium.ttf',
    italics: 'Poppins-Medium.ttf',
    bolditalics: 'Poppins-Medium.ttf'
  },
  PoppinsSemiBold: {
    normal: 'Poppins-SemiBold.ttf',
    bold: 'Poppins-SemiBold.ttf',
    italics: 'Poppins-SemiBold.ttf',
    bolditalics: 'Poppins-SemiBold.ttf'
  }
};

const PAGE_MARGIN = {
  left: 14 * 2.834645669,
  right: 14 * 2.834645669,
  top: 12 * 2.834645669,
  bottom: 12 * 2.834645669
};

let pdfMakeConfigured = false;

/**
 * Registers the bundled Poppins weights and locks pdfmake down to local font
 * reads. Remote resources are fetched by loadProfileImage, so pdfmake itself
 * never needs network access.
 */
function configurePdfMake() {
  if (pdfMakeConfigured) return;

  const fonts = {};
  for (const [family, files] of Object.entries(FONT_FAMILIES)) {
    fonts[family] = Object.fromEntries(
      Object.entries(files).map(([type, file]) => [type, path.join(FONT_DIR, file)])
    );
  }

  pdfmake.addFonts(fonts);
  pdfmake.setLocalAccessPolicy(filePath => {
    if (typeof filePath !== 'string') return false;
    const resolved = path.resolve(filePath);
    return resolved === FONT_DIR || resolved.startsWith(FONT_DIR + path.sep);
  });
  pdfmake.setUrlAccessPolicy(() => false);
  pdfMakeConfigured = true;
}

function toText(str) {
  if (str == null) return '';
  return String(str);
}

// Characters that may appear in an http(s) URL or a base64 data URI.
function isSafeUrlChars(value) {
  return /^[A-Za-z0-9\-._~:/?#\[\]@!$&'()*+,;=%]+$/.test(value);
}

// Photo shapes the template knows how to render. Kept as an allow-list so a
// typo or an unexpected value can't leak into the output.
const IMAGE_SHAPES = ['circle', 'square', 'rounded'];
const DEFAULT_IMAGE_SHAPE = 'circle';

/**
 * Maps personalInfo.imageShape onto a known shape. Accepts a few common
 * synonyms; falls back to the default for anything unrecognised.
 */
export function normalizeImageShape(shape) {
  const value = toText(shape).trim().toLowerCase();
  if (IMAGE_SHAPES.includes(value)) return value;

  switch (value) {
    case 'round':
    case 'circular':
    case 'oval':
      return 'circle';
    case 'rect':
    case 'rectangle':
    case 'box':
    case 'plain':
      return 'square';
    case 'rounded-corner':
    case 'roundedcorners':
      return 'rounded';
    default:
      return DEFAULT_IMAGE_SHAPE;
  }
}

const IMAGE_MIME_TYPES = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml'
};

/**
 * Resolves personalInfo.image into a data URI (local files) or a validated
 * URL/data URI (remote sources).
 */
export function resolveImageSource(image, baseDir = process.cwd()) {
  const value = toText(image).trim();
  if (!value) return null;

  if (/^https?:\/\//i.test(value) || /^data:image\//i.test(value)) {
    return isSafeUrlChars(value) ? value : null;
  }

  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) {
    return null;
  }

  const filePath = path.isAbsolute(value) ? value : path.resolve(baseDir, value);
  const ext = path.extname(filePath).toLowerCase();
  const mime = IMAGE_MIME_TYPES[ext];
  if (!mime) {
    console.warn(`Warning: Unsupported profile image type '${ext || value}'. Skipping image.`);
    return null;
  }

  try {
    const buffer = fs.readFileSync(filePath);
    return `data:${mime};base64,${buffer.toString('base64')}`;
  } catch (err) {
    console.warn(`Warning: Could not read profile image '${value}' (${err.message}). Skipping image.`);
    return null;
  }
}

function mimeToKind(mime) {
  if (!mime) return null;
  const value = String(mime).toLowerCase();
  if (value.includes('svg')) return 'svg';
  if (value.includes('jpeg') || value.includes('jpg')) return 'jpeg';
  if (value.includes('png')) return 'png';
  if (value.includes('gif')) return 'gif';
  if (value.includes('webp')) return 'webp';
  return null;
}

function dataUriMime(value) {
  const match = /^data:([^;,]+)[;,]/.exec(value);
  return match ? match[1] : null;
}

function sourceKind(value) {
  if (/^data:/i.test(value)) return mimeToKind(dataUriMime(value));

  const withoutQuery = value.split(/[?#]/)[0];
  const ext = path.extname(withoutQuery).toLowerCase();
  if (ext === '.png') return 'png';
  if (ext === '.jpg' || ext === '.jpeg') return 'jpeg';
  if (ext === '.svg') return 'svg';
  if (ext === '.gif') return 'gif';
  if (ext === '.webp') return 'webp';
  return null;
}

function decodeDataUri(value) {
  const comma = value.indexOf(',');
  if (comma < 0) return null;
  const header = value.slice(0, comma);
  const payload = value.slice(comma + 1);
  try {
    return /;base64/i.test(header)
      ? Buffer.from(payload, 'base64').toString('utf8')
      : decodeURIComponent(payload);
  } catch {
    return null;
  }
}

function warnUnsupportedImage(source, kind) {
  const label = kind || path.extname(source.split(/[?#]/)[0]) || source;
  console.warn(
    `Warning: Unsupported profile image type '${label}' (PDF supports PNG, JPEG, and SVG). Skipping image.`
  );
}

/**
 * Loads personalInfo.image into a pdfmake image or SVG node payload.
 * Unsupported formats and unreachable sources are skipped with a warning so
 * the resume still renders without a photo.
 *
 * @returns {Promise<{image:string}|{svg:string}|null>}
 */
export async function loadProfileImage(image, baseDir = process.cwd()) {
  const source = resolveImageSource(image, baseDir);
  if (!source) return null;

  let kind = sourceKind(source);

  if (/^https?:\/\//i.test(source)) {
    try {
      const response = await fetch(source, {
        redirect: 'follow',
        signal: typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(15000) : undefined
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const buffer = Buffer.from(await response.arrayBuffer());
      kind = mimeToKind(response.headers.get('content-type')) || kind;

      if (kind === 'svg') return { svg: buffer.toString('utf8') };
      if (kind === 'png' || kind === 'jpeg') {
        return { image: `data:image/${kind === 'jpeg' ? 'jpeg' : 'png'};base64,${buffer.toString('base64')}` };
      }

      warnUnsupportedImage(source, kind);
      return null;
    } catch (err) {
      console.warn(`Warning: Could not load profile image '${source}' (${err.message}). Skipping image.`);
      return null;
    }
  }

  if (kind === 'svg') {
    const svg = decodeDataUri(source);
    if (!svg) {
      console.warn(`Warning: Could not decode profile image '${source.slice(0, 32)}...'. Skipping image.`);
      return null;
    }
    return { svg };
  }

  if (kind === 'png' || kind === 'jpeg') {
    return { image: source };
  }

  warnUnsupportedImage(source, kind);
  return null;
}

function hasItems(arr) {
  return Array.isArray(arr) && arr.length > 0;
}

function transformToResumeContent(data) {
  const result = {};

  if (data.personalInfo) {
    const pi = data.personalInfo;
    if (pi.fullName) result.FULL_NAME = toText(pi.fullName);
    if (pi.nickname) result.NICKNAME = toText(pi.nickname);
    if (pi.email) result.EMAIL = toText(pi.email);
    if (pi.phone) result.PHONE = toText(pi.phone);
    if (pi.location) result.LOCATION = toText(pi.location);
    if (pi.linkedin) result.LINKEDIN = toText(pi.linkedin);
    if (pi.github) result.GITHUB = toText(pi.github);
    if (pi.website) result.WEBSITE = toText(pi.website);

    // headerLinkStyle: "label" shows names (WEBSITE, GITHUB, LINKEDIN),
    //                  "url" shows the actual URL text (e.g. ashiq.pro.bd)
    const linkStyle = toText(pi.headerLinkStyle || 'label').trim().toLowerCase();
    const showUrl = linkStyle === 'url';
    result.WEBSITE_TEXT = showUrl && pi.website ? toText(pi.website) : 'WEBSITE';
    result.GITHUB_TEXT = showUrl && pi.github ? toText(pi.github) : 'GITHUB';
    result.LINKEDIN_TEXT = showUrl && pi.linkedin ? toText(pi.linkedin) : 'LINKEDIN';
  }

  if (data.summary_resume) {
    result.SUMMARY = toText(data.summary_resume);
  }

  const filteredExperience = data.experience?.filter(item => item.show_resume !== false);
  if (hasItems(filteredExperience)) {
    result.EXPERIENCE = filteredExperience.map(item => ({
      title: toText(item.title || ''),
      company: toText(item.company || ''),
      location: toText(item.location || ''),
      startDate: toText(item.startDate || ''),
      endDate: toText(item.endDate || ''),
      current: item.current || false,
      bullets: (item.bullets || []).map(b => toText(b)),
      technologies: Array.isArray(item.technologies)
        ? item.technologies.map(t => toText(t)).join(', ')
        : toText(item.technologies || '')
    }));
  }

  const filteredEducation = data.education?.filter(item => item.show_resume !== false);
  if (hasItems(filteredEducation)) {
    result.EDUCATION = filteredEducation.map(item => ({
      institution: toText(item.institution || ''),
      degree: toText(item.degree || ''),
      field: toText(item.field || ''),
      startYear: toText(item.startYear || ''),
      endYear: toText(item.endYear || ''),
      gpa: toText(item.gpa || ''),
      honors: toText(item.honors || ''),
      coursework: Array.isArray(item.coursework)
        ? item.coursework.map(c => toText(c)).join(', ')
        : toText(item.coursework || '')
    }));
  }

  const filteredSkills = data.skills?.filter(item => item.show_resume !== false);
  if (hasItems(filteredSkills)) {
    const grouped = {};
    filteredSkills.forEach(item => {
      const category = toText(item.category || 'Other');
      const skillName = toText(item.name || '');
      if (!grouped[category]) {
        grouped[category] = [];
      }
      if (skillName) {
        grouped[category].push(skillName);
      }
    });
    result.SKILLS = Object.entries(grouped).map(([category, skillsArr]) => ({
      category,
      skills: skillsArr.join(', ')
    }));
  }

  const filteredProjects = data.projects?.filter(item => item.show_resume !== false);
  if (hasItems(filteredProjects)) {
    result.PROJECTS = filteredProjects.map(item => ({
      name: toText(item.name || ''),
      role: toText(item.role || ''),
      bullets: (item.bullets || []).map(b => toText(b)),
      technologies: Array.isArray(item.technologies)
        ? item.technologies.map(t => toText(t)).join(', ')
        : toText(item.technologies || ''),
      startDate: toText(item.startDate || ''),
      endDate: toText(item.endDate || ''),
      link: toText(item.link || '')
    }));
  }

  const filteredCertifications = data.certifications?.filter(item => item.show_resume !== false);
  if (hasItems(filteredCertifications)) {
    result.CERTIFICATIONS = filteredCertifications.map(item => ({
      name: toText(item.name || ''),
      issuer: toText(item.issuer || ''),
      issueDate: toText(item.issueDate || ''),
      credentialId: toText(item.credentialId || '')
    }));
  }

  const filteredAchievements = data.achievements?.filter(item => item.show_resume !== false);
  if (hasItems(filteredAchievements)) {
    result.ACHIEVEMENTS = filteredAchievements.map(item => ({
      title: toText(item.title || ''),
      date: toText(item.date || ''),
      certificate: toText(item.certificate || '')
    }));
  }

  const filteredVolunteer = data.volunteerExperience?.filter(item => item.show_resume !== false);
  if (hasItems(filteredVolunteer)) {
    result.VOLUNTEER = filteredVolunteer.map(item => ({
      role: toText(item.role || ''),
      organization: toText(item.organization || ''),
      startDate: toText(item.startDate || ''),
      website: toText(item.website || '')
    }));
  }

  const filteredLanguages = data.languages?.filter(item => item.show_resume !== false);
  if (hasItems(filteredLanguages)) {
    result.LANGUAGES = filteredLanguages.map(item => ({
      language: toText(item.language || ''),
      proficiency: toText(item.proficiency || '')
    }));
  }

  const filteredPublications = data.publications?.filter(item => item.show_resume !== false);
  if (hasItems(filteredPublications)) {
    result.PUBLICATIONS = filteredPublications.map(item => ({
      title: toText(item.title || ''),
      publisher: toText(item.publisher || ''),
      date: toText(item.date || ''),
      url: toText(item.url || ''),
      description: toText(item.description || '')
    }));
  }

  const filteredAffiliations = data.professionalAffiliations?.filter(item => item.show_resume !== false);
  if (hasItems(filteredAffiliations)) {
    result.PROFESSIONAL_AFFILIATIONS = filteredAffiliations.map(item => ({
      organization: toText(item.organization || ''),
      role: toText(item.role || ''),
      startDate: toText(item.startDate || ''),
      current: item.current || false,
      website: toText(item.website || '')
    }));
  }

  const filteredReferences = data.references?.filter(item => item.show_resume !== false);
  if (hasItems(filteredReferences)) {
    result.REFERENCES = filteredReferences.map(item => ({
      name: toText(item.name || ''),
      relationship: toText(item.relationship || ''),
      company: toText(item.company || ''),
      email: toText(item.email || ''),
      phone: toText(item.phone || '')
    }));
  }

  const filteredCustomSections = data.customSections?.filter(item => item.show_resume !== false);
  if (hasItems(filteredCustomSections)) {
    const mapped = filteredCustomSections.map(section => ({
      heading: toText(section.heading || ''),
      items: (section.items || [])
        .filter(item => item.show_resume !== false)
        .map(item => ({
          title: toText(item.title || ''),
          date: toText(item.date || ''),
          location: toText(item.location || ''),
          description: toText(item.description || '')
        }))
    })).filter(section => hasItems(section.items));
    if (hasItems(mapped)) {
      result.CUSTOM_SECTIONS = mapped;
    }
  }
  return result;
}

function sectionHeading(title) {
  return {
    table: {
      widths: ['*'],
      body: [[{
        text: toText(title).toUpperCase(),
        fontSize: px(12),
        bold: true,
        characterSpacing: px(0.7),
        color: COLORS.ink
      }]]
    },
    layout: {
      hLineWidth: (i, node) => (i === node.table.body.length ? px(1) : 0),
      vLineWidth: () => 0,
      hLineColor: () => COLORS.ruleLight,
      paddingLeft: () => 0,
      paddingRight: () => 0,
      paddingTop: () => 0,
      paddingBottom: () => px(3)
    },
    margin: [0, 0, px(6), 0]
  };
}

function sectionBlock(title, body) {
  const items = Array.isArray(body) ? body : [body];
  return {
    stack: [sectionHeading(title), ...items.filter(Boolean)],
    margin: [0, 0, px(12), 0]
  };
}

function entryRow(left, right) {
  const hasRight = Array.isArray(right) ? right.length > 0 : Boolean(right);
  const style = {
    font: 'PoppinsMedium',
    fontSize: px(12),
    color: COLORS.ink
  };

  if (!hasRight) {
    return { text: left, ...style };
  }

  return {
    columns: [
      { width: '*', text: left, ...style },
      {
        width: 'auto',
        text: right,
        alignment: 'right',
        noWrap: true,
        ...style,
        color: COLORS.muted
      }
    ],
    columnGap: px(12)
  };
}

function entrySub(parts) {
  const values = (Array.isArray(parts) ? parts : [parts]).filter(Boolean);
  if (values.length === 0) return null;

  const text = [];
  values.forEach((part, index) => {
    if (index > 0) text.push({ text: ' · ' });
    text.push(typeof part === 'string' ? { text: part } : part);
  });

  return {
    text,
    fontSize: px(10),
    color: COLORS.muted,
    lineHeight: 1,
    margin: [0, px(1), 0, 0]
  };
}

function bulletList(bullets) {
  if (!hasItems(bullets)) return null;
  return {
    ul: bullets.map(bullet => ({
      text: bullet,
      fontSize: px(12.5),
      color: COLORS.body,
      lineHeight: 1.35
    })),
    markerColor: COLORS.muted,
    margin: [px(4), px(4), 0, 0]
  };
}

function techLine(technologies) {
  if (!technologies) return null;
  return {
    text: [
      { text: 'Technologies: ', font: 'PoppinsSemiBold', color: COLORS.ink },
      { text: technologies }
    ],
    fontSize: px(11.5),
    color: COLORS.muted,
    margin: [0, px(3), 0, 0]
  };
}

const NO_BORDERS_LAYOUT = {
  hLineWidth: () => 0,
  vLineWidth: () => 0,
  paddingTop: () => 0,
  paddingBottom: () => px(2),
  paddingLeft: () => 0,
  paddingRight: () => 0
};

function twoColumnTable(cells, gap) {
  const body = [];
  for (let i = 0; i < cells.length; i += 2) {
    body.push([cells[i], cells[i + 1] || { text: '' }]);
  }

  return {
    table: { widths: ['*', '*'], body },
    layout: {
      ...NO_BORDERS_LAYOUT,
      paddingRight: i => (i === 0 ? gap : 0)
    }
  };
}

function experienceEntry(item) {
  const left = item.company
    ? [{ text: item.title }, { text: ` — ${item.company}` }]
    : item.title;

  let date = item.startDate;
  if (item.endDate) date += ` – ${item.endDate}`;
  if (item.current) date += ' – Present';

  const stack = [entryRow(left, date)];
  const sub = entrySub([item.location]);
  if (sub) stack.push(sub);
  const bullets = bulletList(item.bullets);
  if (bullets) stack.push(bullets);
  const tech = techLine(item.technologies);
  if (tech) stack.push(tech);

  return { stack, margin: [0, 0, 0, px(2)] };
}

function educationEntry(item) {
  const left = item.field
    ? [{ text: item.degree }, { text: ` in ${item.field}` }]
    : item.degree;
  const years = [item.startYear, item.endYear].filter(Boolean).join(' – ');

  const stack = [entryRow(left, years)];
  const sub = entrySub([item.institution, item.gpa, item.honors]);
  if (sub) stack.push(sub);
  if (item.coursework) {
    stack.push({
      text: `Relevant coursework: ${item.coursework}`,
      fontSize: px(11.5),
      color: COLORS.muted,
      italics: true,
      margin: [0, px(2), 0, 0]
    });
  }

  return { stack, margin: [0, 0, 0, px(2)] };
}

function projectEntry(item) {
  const left = item.role
    ? [{ text: item.name }, { text: ` — ${item.role}` }]
    : item.name;

  const right = [];
  if (item.startDate) right.push({ text: item.startDate });
  if (item.link) {
    if (right.length > 0) right.push({ text: '  ' });
    right.push({ text: 'Live', link: item.link, decoration: 'underline', fontSize: px(11.5), color: COLORS.ink });
  }

  const stack = [entryRow(left, right)];
  const bullets = bulletList(item.bullets);
  if (bullets) stack.push(bullets);
  const tech = techLine(item.technologies);
  if (tech) stack.push(tech);

  return { stack, margin: [0, 0, 0, px(2)] };
}

function certificationEntry(item) {
  const parts = [{ text: item.name }];
  if (item.issuer) {
    parts.push({ text: ' — ' });
    parts.push({ text: item.issuer, fontSize: px(10), color: COLORS.muted });
  }
  if (item.issueDate) {
    parts.push({ text: ` (${item.issueDate})`, fontSize: px(12), font: 'PoppinsMedium', color: COLORS.muted });
  }
  if (item.credentialId) {
    parts.push({ text: ' · ID: ' });
    parts.push({ text: item.credentialId });
  }

  return { text: parts, fontSize: px(12.5), color: COLORS.body, lineHeight: 1.4 };
}

function achievementEntry(item) {
  const title = { text: item.title, font: 'PoppinsMedium', color: COLORS.ink };
  if (item.certificate) title.link = item.certificate;

  const parts = [title];
  if (item.date) {
    parts.push({ text: ` (${item.date})`, fontSize: px(12), font: 'PoppinsMedium', color: COLORS.muted });
  }

  return { text: parts, fontSize: px(12.5), color: COLORS.body, lineHeight: 1.35 };
}

function volunteerEntry(item) {
  const left = item.website
    ? { text: item.role, link: item.website }
    : item.role;

  const stack = [entryRow(left, item.startDate)];
  const sub = entrySub([item.organization]);
  if (sub) stack.push(sub);

  return { stack, margin: [0, 0, 0, px(2)] };
}

function affiliationEntry(item) {
  const left = item.website
    ? { text: item.organization, link: item.website }
    : item.organization;
  const date = item.startDate ? `${item.startDate}${item.current ? ' – Present' : ''}` : '';

  const stack = [entryRow(left, date)];
  const sub = entrySub([item.role]);
  if (sub) stack.push(sub);

  return { stack, margin: [0, 0, 0, px(2)] };
}

function publicationEntry(item) {
  const left = item.url
    ? { text: item.title, link: item.url }
    : item.title;

  const stack = [entryRow(left, item.date)];
  const sub = entrySub([item.publisher]);
  if (sub) stack.push(sub);
  if (item.description) {
    stack.push({
      text: item.description,
      fontSize: px(12),
      lineHeight: 1.4,
      margin: [0, px(2), 0, 0]
    });
  }

  return { stack, margin: [0, 0, 0, px(2)] };
}

function referenceEntry(item) {
  const stack = [{
    text: item.name,
    font: 'PoppinsMedium',
    fontSize: px(12),
    color: COLORS.ink
  }];

  const relationship = entrySub([item.relationship]);
  if (relationship) stack.push(relationship);
  const company = entrySub([item.company]);
  if (company) stack.push(company);
  if (item.email) {
    const email = entrySub([{ text: item.email, link: `mailto:${item.email}` }]);
    if (email) stack.push(email);
  }
  if (item.phone) {
    const phone = entrySub([{ text: item.phone, link: `tel:${item.phone}` }]);
    if (phone) stack.push(phone);
  }

  return { stack, margin: [0, 0, 0, px(2)] };
}

function customSectionEntry(item) {
  const title = [{ text: item.title, font: 'PoppinsMedium', fontSize: px(12), color: COLORS.ink }];
  if (item.date) {
    title.push({ text: ` ${item.date}`, fontSize: px(11.5), color: COLORS.muted });
  }

  const stack = [{ text: title }];
  const sub = entrySub([item.location]);
  if (sub) stack.push(sub);
  if (item.description) {
    stack.push({
      text: item.description,
      fontSize: px(12.5),
      lineHeight: 1.4,
      margin: [0, px(4), 0, 0]
    });
  }

  return { stack, margin: [0, 0, 0, px(2)] };
}

function contactLink(text, link) {
  return { text, link, color: COLORS.body };
}

function contactItems(content) {
  const items = [];
  if (content.PHONE) items.push(contactLink(content.PHONE, `tel:${content.PHONE}`));
  if (content.EMAIL) items.push(contactLink(content.EMAIL, `mailto:${content.EMAIL}`));
  if (content.LOCATION) items.push({ text: content.LOCATION });
  if (content.WEBSITE) items.push(contactLink(content.WEBSITE_TEXT, `https://${content.WEBSITE}`));
  if (content.GITHUB) items.push(contactLink(content.GITHUB_TEXT, `https://${content.GITHUB}`));
  if (content.LINKEDIN) items.push(contactLink(content.LINKEDIN_TEXT, `https://${content.LINKEDIN}`));
  return items;
}

function contactBlock(items, hasPhoto) {
  if (items.length === 0) return { text: '' };

  if (!hasPhoto) {
    const text = [];
    items.forEach((item, index) => {
      if (index > 0) text.push({ text: '   ' });
      text.push(item);
    });
    return { text, fontSize: px(12.5), lineHeight: 1.35 };
  }

  // With a photo the header has less horizontal room, so contacts sit in a
  // two-column grid (row-major, like the template's CSS grid).
  const rows = [];
  for (let i = 0; i < items.length; i += 2) {
    rows.push([items[i], items[i + 1] || { text: '' }]);
  }

  return {
    table: { widths: ['*', '*'], body: rows },
    layout: {
      ...NO_BORDERS_LAYOUT,
      paddingRight: i => (i === 0 ? px(20) : 0),
      paddingBottom: i => (i < rows.length - 1 ? px(6) : 0)
    },
    fontSize: px(12.5),
    lineHeight: 1.35
  };
}

function photoClip(shape, width, height) {
  const stroke = px(1);
  const half = stroke / 2;

  if (shape === 'circle') {
    const radius = width / 2;
    return {
      clip: `<circle cx="${width / 2}" cy="${height / 2}" r="${radius}"/>`,
      frame: `<circle cx="${width / 2}" cy="${height / 2}" r="${radius - half}" fill="none" stroke="${COLORS.ruleLight}" stroke-width="${stroke}"/>`
    };
  }

  const radius = shape === 'rounded' ? px(8) : 0;
  return {
    clip: `<rect x="0" y="0" width="${width}" height="${height}" rx="${radius}" ry="${radius}"/>`,
    frame: `<rect x="${half}" y="${half}" width="${width - stroke}" height="${height - stroke}" rx="${Math.max(radius - half, 0)}" ry="${Math.max(radius - half, 0)}" fill="none" stroke="${COLORS.ruleLight}" stroke-width="${stroke}"/>`
  };
}

/**
 * Splits a user-supplied SVG into its inner markup and viewBox so it can be
 * nested inside the clipping wrapper below.
 */
function svgParts(svg) {
  const match = /<svg\b([^>]*)>([\s\S]*)<\/svg>\s*$/i.exec(svg);
  if (!match) return null;

  const attrs = match[1];
  const readAttr = name => {
    const attr = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i').exec(attrs);
    return attr ? (attr[2] ?? attr[3]) : null;
  };

  let viewBox = readAttr('viewBox');
  if (!viewBox) {
    const width = parseFloat(readAttr('width'));
    const height = parseFloat(readAttr('height'));
    if (Number.isFinite(width) && Number.isFinite(height)) {
      viewBox = `0 0 ${width} ${height}`;
    }
  }

  return viewBox ? { inner: match[2], viewBox } : null;
}

function profilePhotoNode(photo, shape) {
  const circular = shape === 'circle';
  const width = circular ? px(104) : px(96);
  const height = circular ? px(104) : px(116);
  const { clip, frame } = photoClip(shape, width, height);

  const open = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`
    + `<defs><clipPath id="atsPhotoClip">${clip}</clipPath></defs>`;

  let body;
  if (photo.svg) {
    const parts = svgParts(photo.svg);
    if (!parts) {
      return { svg: photo.svg, fit: [width, height] };
    }
    body = `<g clip-path="url(#atsPhotoClip)">`
      + `<svg x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="xMidYMid slice" viewBox="${parts.viewBox}">`
      + `${parts.inner}</svg></g>`;
  } else {
    body = `<image x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="xMidYMid slice" clip-path="url(#atsPhotoClip)" href="${photo.image}"/>`;
  }

  return { svg: `${open}${body}${frame}</svg>`, fit: [width, height] };
}

function buildHeader(content, photo) {
  const main = [{
    text: content.FULL_NAME || '',
    fontSize: px(28),
    bold: true,
    characterSpacing: px(0.5),
    color: COLORS.ink,
    margin: [0, 0, px(8), 0]
  }];

  const contacts = contactItems(content);
  if (contacts.length > 0) {
    main.push(contactBlock(contacts, Boolean(photo)));
  }

  if (!photo) {
    return { stack: main, margin: [0, 0, px(14), 0] };
  }

  const circular = normalizeImageShape(content.IMAGE_SHAPE) === 'circle';
  const photoWidth = circular ? px(104) : px(96);

  return {
    columns: [
      { width: '*', stack: main },
      { width: photoWidth, stack: [profilePhotoNode(photo, content.IMAGE_SHAPE)] }
    ],
    columnGap: px(24),
    margin: [0, 0, px(14), 0]
  };
}

/**
 * Builds the pdfmake document definition for a validated resume object.
 * Exported so tests can inspect the layout without writing a PDF.
 */
export async function buildDocDefinition(data, options = {}) {
  const content = transformToResumeContent(data);
  content.IMAGE_SHAPE = normalizeImageShape(data.personalInfo?.imageShape);

  const photo = await loadProfileImage(data.personalInfo?.image, options.baseDir);
  const docContent = [buildHeader(content, photo)];

  if (content.SUMMARY) {
    docContent.push(sectionBlock('Summary', {
      text: content.SUMMARY,
      fontSize: px(12.5),
      lineHeight: 1.4,
      color: COLORS.body
    }));
  }

  if (content.EXPERIENCE) {
    docContent.push(sectionBlock('Experience', content.EXPERIENCE.map(experienceEntry)));
  }

  if (content.SKILLS) {
    const cells = content.SKILLS.map(item => ({
      text: [
        { text: `${item.category}:`, font: 'PoppinsSemiBold', color: COLORS.ink },
        { text: ` ${item.skills}` }
      ],
      fontSize: px(12),
      lineHeight: 1.45
    }));
    docContent.push(sectionBlock('Technical Skills', twoColumnTable(cells, px(24))));
  }

  if (content.EDUCATION) {
    docContent.push(sectionBlock('Education', twoColumnTable(content.EDUCATION.map(educationEntry), px(32))));
  }

  if (content.PROJECTS) {
    docContent.push(sectionBlock('Projects', content.PROJECTS.map(projectEntry)));
  }

  if (content.CERTIFICATIONS) {
    docContent.push(sectionBlock('Certifications', twoColumnTable(content.CERTIFICATIONS.map(certificationEntry), px(32))));
  }

  if (content.ACHIEVEMENTS) {
    docContent.push(sectionBlock('Achievements', twoColumnTable(content.ACHIEVEMENTS.map(achievementEntry), px(32))));
  }

  if (content.VOLUNTEER) {
    docContent.push(sectionBlock('Volunteer Experience', twoColumnTable(content.VOLUNTEER.map(volunteerEntry), px(32))));
  }

  if (content.PROFESSIONAL_AFFILIATIONS) {
    docContent.push(sectionBlock('Professional Affiliations', twoColumnTable(content.PROFESSIONAL_AFFILIATIONS.map(affiliationEntry), px(32))));
  }

  if (content.PUBLICATIONS) {
    docContent.push(sectionBlock('Publications', content.PUBLICATIONS.map(publicationEntry)));
  }

  if (content.LANGUAGES) {
    const text = [];
    content.LANGUAGES.forEach((item, index) => {
      if (index > 0) text.push({ text: ', ' });
      text.push({ text: item.language, font: 'PoppinsSemiBold', color: COLORS.ink });
      if (item.proficiency) text.push({ text: ` (${item.proficiency})` });
    });
    docContent.push(sectionBlock('Languages', {
      text,
      fontSize: px(12.5),
      lineHeight: 1.8
    }));
  }

  if (content.REFERENCES) {
    docContent.push(sectionBlock('References', twoColumnTable(content.REFERENCES.map(referenceEntry), px(32))));
  }

  if (content.CUSTOM_SECTIONS) {
    for (const section of content.CUSTOM_SECTIONS) {
      docContent.push(sectionBlock(section.heading, section.items.map(customSectionEntry)));
    }
  }

  return {
    pageSize: 'A4',
    pageMargins: [PAGE_MARGIN.left, PAGE_MARGIN.top, PAGE_MARGIN.right, PAGE_MARGIN.bottom],
    defaultStyle: {
      font: 'Poppins',
      fontSize: px(12.5),
      color: COLORS.body,
      lineHeight: 1.35
    },
    info: {
      title: content.FULL_NAME ? `${content.FULL_NAME} - Resume` : 'Resume',
      author: content.FULL_NAME || '',
      subject: 'Resume',
      creator: 'ats-resume'
    },
    content: docContent
  };
}

/**
 * Generates a PDF resume from validated data using pdfmake. No browser or
 * headless Chrome is involved.
 */
export async function generatePDF(data, outputPath, options = {}) {
  configurePdfMake();
  const docDefinition = await buildDocDefinition(data, options);
  const pdf = pdfmake.createPdf(docDefinition);
  await pdf.write(outputPath);
}
