import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer';
import Handlebars from 'handlebars';

function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
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

function transformToResumeContent(data) {
  const result = {};

  if (data.personalInfo) {
    const pi = data.personalInfo;
    if (pi.fullName) result.FULL_NAME = escapeHtml(pi.fullName);
    if (pi.nickname) result.NICKNAME = escapeHtml(pi.nickname);
    if (pi.email) result.EMAIL = escapeHtml(pi.email);
    if (pi.phone) result.PHONE = escapeHtml(pi.phone);
    if (pi.location) result.LOCATION = escapeHtml(pi.location);
    if (pi.linkedin) result.LINKEDIN = escapeHtml(pi.linkedin);
    if (pi.github) result.GITHUB = escapeHtml(pi.github);
    if (pi.website) result.WEBSITE = escapeHtml(pi.website);
  }

  if (data.summary_resume) {
    result.SUMMARY = escapeHtml(data.summary_resume);
  }

  const filteredExperience = data.experience?.filter(item => item.show_resume !== false);
  if (hasItems(filteredExperience)) {
    result.EXPERIENCE = filteredExperience.map(item => ({
      title: escapeHtml(item.title || ''),
      company: escapeHtml(item.company || ''),
      location: escapeHtml(item.location || ''),
      startDate: escapeHtml(item.startDate || ''),
      endDate: escapeHtml(item.endDate || ''),
      current: item.current || false,
      bullets: (item.bullets || []).map(b => escapeHtml(b)),
      technologies: Array.isArray(item.technologies) 
        ? item.technologies.map(t => escapeHtml(t)).join(', ')
        : (item.technologies || '')
    }));
  }

  const filteredEducation = data.education?.filter(item => item.show_resume !== false);
  if (hasItems(filteredEducation)) {
    result.EDUCATION = filteredEducation.map(item => ({
      institution: escapeHtml(item.institution || ''),
      degree: escapeHtml(item.degree || ''),
      field: escapeHtml(item.field || ''),
      startYear: item.startYear,
      endYear: item.endYear,
      gpa: escapeHtml(item.gpa || ''),
      honors: escapeHtml(item.honors || ''),
      coursework: Array.isArray(item.coursework)
        ? item.coursework.map(c => escapeHtml(c)).join(', ')
        : (item.coursework || '')
    }));
  }

  const filteredSkills = data.skills?.filter(item => item.show_resume !== false);
  if (hasItems(filteredSkills)) {
    const grouped = {};
    filteredSkills.forEach(item => {
      const category = escapeHtml(item.category || 'Other');
      const skillName = escapeHtml(item.name || '');
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
      name: escapeHtml(item.name || ''),
      role: escapeHtml(item.role || ''),
      bullets: (item.bullets || []).map(b => escapeHtml(b)),
      technologies: Array.isArray(item.technologies)
        ? item.technologies.map(t => escapeHtml(t)).join(', ')
        : (item.technologies || ''),
      startDate: escapeHtml(item.startDate || ''),
      endDate: escapeHtml(item.endDate || ''),
      link: escapeHtml(item.link || '')
    }));
  }

  const filteredCertifications = data.certifications?.filter(item => item.show_resume !== false);
  if (hasItems(filteredCertifications)) {
    result.CERTIFICATIONS = filteredCertifications.map(item => ({
      name: escapeHtml(item.name || ''),
      issuer: escapeHtml(item.issuer || ''),
      issueDate: escapeHtml(item.issueDate || ''),
      credentialId: escapeHtml(item.credentialId || '')
    }));
  }

  const filteredAchievements = data.achievements?.filter(item => item.show_resume !== false);
  if (hasItems(filteredAchievements)) {
    result.ACHIEVEMENTS = filteredAchievements.map(item => ({
      title: escapeHtml(item.title || ''),
      date: escapeHtml(item.date || ''),
      certificate: escapeHtml(item.certificate || '')
    }));
  }

  const filteredVolunteer = data.volunteerExperience?.filter(item => item.show_resume !== false);
  if (hasItems(filteredVolunteer)) {
    result.VOLUNTEER = filteredVolunteer.map(item => ({
      role: escapeHtml(item.role || ''),
      organization: escapeHtml(item.organization || ''),
      startDate: escapeHtml(item.startDate || ''),
      website: escapeHtml(item.website || '')
    }));
  }

  const filteredLanguages = data.languages?.filter(item => item.show_resume !== false);
  if (hasItems(filteredLanguages)) {
    result.LANGUAGES = filteredLanguages.map(item => ({
      language: escapeHtml(item.language || ''),
      proficiency: escapeHtml(item.proficiency || '')
    }));
  }

  const filteredPublications = data.publications?.filter(item => item.show_resume !== false);
  if (hasItems(filteredPublications)) {
    result.PUBLICATIONS = filteredPublications.map(item => ({
      title: escapeHtml(item.title || ''),
      publisher: escapeHtml(item.publisher || ''),
      date: escapeHtml(item.date || ''),
      url: escapeHtml(item.url || ''),
      description: escapeHtml(item.description || '')
    }));
  }

  const filteredAffiliations = data.professionalAffiliations?.filter(item => item.show_resume !== false);
  if (hasItems(filteredAffiliations)) {
    result.PROFESSIONAL_AFFILIATIONS = filteredAffiliations.map(item => ({
      organization: escapeHtml(item.organization || ''),
      role: escapeHtml(item.role || ''),
      startDate: escapeHtml(item.startDate || ''),
      current: item.current || false,
      website: escapeHtml(item.website || '')
    }));
  }

  const filteredReferences = data.references?.filter(item => item.show_resume !== false);
  if (hasItems(filteredReferences)) {
    result.REFERENCES = filteredReferences.map(item => ({
      name: escapeHtml(item.name || ''),
      relationship: escapeHtml(item.relationship || ''),
      company: escapeHtml(item.company || ''),
      email: escapeHtml(item.email || ''),
      phone: escapeHtml(item.phone || '')
    }));
  }

  const filteredCustomSections = data.customSections?.filter(item => item.show_resume !== false);
  if (hasItems(filteredCustomSections)) {
    const mapped = filteredCustomSections.map(section => ({
      heading: escapeHtml(section.heading || ''),
      items: (section.items || [])
        .filter(item => item.show_resume !== false)
        .map(item => ({
          title: escapeHtml(item.title || ''),
          date: escapeHtml(item.date || ''),
          location: escapeHtml(item.location || ''),
          description: escapeHtml(item.description || '')
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

export async function generatePDF(data, outputPath) {
  const resumeContent = transformToResumeContent(data);
  const templatePath = getTemplatePath();
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

main().catch(console.error);
