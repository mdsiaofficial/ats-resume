import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer';
import Handlebars from 'handlebars';

// Handlebars already HTML-escapes every `{{ }}` interpolation, so pre-escaping
// here would double-encode output (`&` -> `&amp;` -> `&amp;amp;`). Values are
// passed through untouched and normalised for nullish input only.
function toText(str) {
  if (str == null) return '';
  return String(str);
}

// Characters that may appear in an http(s) URL or a base64 data URI. Anything
// else (quotes, angle brackets, backticks) is rejected because the value is
// emitted into an unescaped attribute.
function isSafeUrlChars(value) {
  return /^[A-Za-z0-9\-._~:/?#\[\]@!$&'()*+,;=%]+$/.test(value);
}

// Photo shapes the template knows how to render. Kept as an allow-list so a
// typo or an unexpected value can't leak into the class attribute.
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
 * Resolves personalInfo.image into something a headless page can load.
 * Supports remote URLs, data URIs and local files (inlined as a data URI so
 * puppeteer's setContent has no base URL to resolve relative paths against).
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

function hasItems(arr) {
  return Array.isArray(arr) && arr.length > 0;
}

function registerHandlebarsHelpers() {
  Handlebars.registerHelper('if', function (conditional, options) {
    if (conditional) {
      return options.fn(this);
    }
    return options.inverse(this);
  });

  Handlebars.registerHelper('unless', function (conditional, options) {
    if (!conditional) {
      return options.fn(this);
    }
    return options.inverse(this);
  });

  Handlebars.registerHelper('each', function (context, options) {
    if (!context) return '';
    let result = '';
    for (let i = 0; i < context.length; i++) {
      result += options.fn(context[i], { data: { index: i } });
    }
    return result;
  });

  Handlebars.registerHelper('last', function (array, options) {
    if (!Array.isArray(array) || array.length === 0) {
      return options.inverse(this);
    }
    return options.fn(array[array.length - 1]);
  });

  Handlebars.registerHelper('hasItems', function (array, options) {
    if (hasItems(array)) {
      return options.fn(this);
    }
    return options.inverse(this);
  });
}

function transformToResumeContent(data, options = {}) {
  const result = {};

  if (data.personalInfo) {
    const pi = data.personalInfo;
    if (pi.fullName) result.FULL_NAME = toText(pi.fullName);
    const photo = resolveImageSource(pi.image, options.baseDir);
    if (photo) {
      // Rendered with a triple-stache: HTML-escaping would mangle base64
      // padding and URL query separators in the src attribute.
      result.PROFILE_IMAGE = new Handlebars.SafeString(photo);
      result.PROFILE_IMAGE_SHAPE = normalizeImageShape(pi.imageShape);
    }
    if (pi.nickname) result.NICKNAME = toText(pi.nickname);
    if (pi.email) result.EMAIL = toText(pi.email);
    if (pi.phone) result.PHONE = toText(pi.phone);
    if (pi.location) result.LOCATION = toText(pi.location);
    if (pi.linkedin) result.LINKEDIN = toText(pi.linkedin);
    if (pi.github) result.GITHUB = toText(pi.github);
    if (pi.website) result.WEBSITE = toText(pi.website);
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
        : (item.technologies || '')
    }));
  }

  const filteredEducation = data.education?.filter(item => item.show_resume !== false);
  if (hasItems(filteredEducation)) {
    result.EDUCATION = filteredEducation.map(item => ({
      institution: toText(item.institution || ''),
      degree: toText(item.degree || ''),
      field: toText(item.field || ''),
      startYear: item.startYear,
      endYear: item.endYear,
      gpa: toText(item.gpa || ''),
      honors: toText(item.honors || ''),
      coursework: Array.isArray(item.coursework)
        ? item.coursework.map(c => toText(c)).join(', ')
        : (item.coursework || '')
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
        : (item.technologies || ''),
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

  if (data.socialLinks) {
    result.SOCIAL_LINKS = data.socialLinks;
  }

  return result;
}

function getTemplatePath() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const templateFileName = 'template.html';

  const localPath = path.join(__dirname, templateFileName);
  if (fs.existsSync(localPath)) {
    return localPath;
  }

  try {
    const packageRoot = __dirname;
    const packageTemplatePath = path.join(packageRoot, templateFileName);
    if (fs.existsSync(packageTemplatePath)) {
      return packageTemplatePath;
    }
  } catch (e) {
  }

  const cwdPath = path.join(process.cwd(), templateFileName);
  if (fs.existsSync(cwdPath)) {
    return cwdPath;
  }

  return localPath;
}

export async function generatePDF(data, outputPath, options = {}) {
  const resumeContent = transformToResumeContent(data, options);
  const templatePath = options.templatePath || getTemplatePath();
  const templateHtml = fs.readFileSync(templatePath, 'utf-8');

  registerHandlebarsHelpers();

  const compiledTemplate = Handlebars.compile(templateHtml);
  const html = compiledTemplate(resumeContent);

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });

    // Ensure the profile photo is decoded before printing, and drop it entirely
    // if the source is unreachable so the header falls back to the no-photo layout.
    await page.evaluate(async () => {
      const header = document.querySelector('header.header-with-photo');
      const img = header && header.querySelector('.profile-photo img');
      if (!header || !img) return;
      try {
        if (!img.complete) await img.decode();
        if (!img.naturalWidth) throw new Error('image failed to load');
      } catch {
        header.classList.remove('header-with-photo');
        const photo = header.querySelector('.profile-photo');
        if (photo) photo.remove();
      }
    });

    await page.pdf({
      path: outputPath,
      format: 'A4',
      printBackground: true,
      margin: {
        top: '12mm',
        right: '14mm',
        bottom: '12mm',
        left: '14mm'
      }
    });
  } finally {
    await browser.close();
  }
}

async function main() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const dataPath = path.join(__dirname, 'demo-resume.json');
  const masterData = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
  await generatePDF(masterData, 'resume.pdf');
}

// Only self-run when executed directly, so importing generatePDF from cli.js
// does not trigger an extra PDF build.
const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  main().catch(console.error);
}
