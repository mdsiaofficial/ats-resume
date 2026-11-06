import test from 'node:test';
import assert from 'node:assert/strict';
import { validateResumeData, formatValidationIssues } from '../validate.js';
import { masterData } from '../data.js';

function demoData() {
  return structuredClone(masterData);
}

test('the demo data passes validation', () => {
  assert.deepEqual(validateResumeData(masterData), []);
});

test('reports a missing personalInfo section', () => {
  const data = demoData();
  delete data.personalInfo;

  const issues = validateResumeData(data);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].path, 'personalInfo');
  assert.equal(issues[0].section, 'personalInfo');
});

test('reports missing required personal info fields', () => {
  const data = demoData();
  delete data.personalInfo.email;

  const issues = validateResumeData(data);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].path, 'personalInfo.email');
  assert.equal(issues[0].section, 'personalInfo');
  assert.match(issues[0].message, /Missing required field "email"/);
});

test('reports a section with the wrong container type', () => {
  const data = demoData();
  data.experience = {};

  const issues = validateResumeData(data);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].path, 'experience');
  assert.equal(issues[0].section, 'experience');
  assert.match(issues[0].message, /array of entries/);
});

test('reports a missing required field with section and entry context', () => {
  const data = demoData();
  delete data.experience[0].title;

  const issues = validateResumeData(data);
  const issue = issues.find(item => item.path === 'experience[0].title');

  assert.ok(issue);
  assert.equal(issue.section, 'experience');
  assert.equal(issue.entryIndex, 0);
  assert.match(issue.context, /company: "Nexora Labs"/);
  assert.match(issue.hint, /Add "title"/);
});

test('skips required fields on entries hidden from the PDF', () => {
  const data = demoData();
  data.experience[0].show_resume = false;
  delete data.experience[0].title;

  const issues = validateResumeData(data);
  assert.equal(issues.filter(item => item.path.startsWith('experience[0]')).length, 0);
});

test('reports wrong types for arrays and booleans', () => {
  const data = demoData();
  data.experience[0].bullets = 'not an array';
  data.experience[0].show_resume = 'false';

  const issues = validateResumeData(data);
  assert.ok(issues.some(item => item.path === 'experience[0].bullets'));
  assert.ok(issues.some(item => item.path === 'experience[0].show_resume'));
});

test('reports array items that are not strings', () => {
  const data = demoData();
  data.experience[0].bullets = ['ok', 42];

  const issues = validateResumeData(data);
  assert.ok(issues.some(item => item.path === 'experience[0].bullets[1]'));
});

test('validates custom sections and their items', () => {
  const data = demoData();
  data.customSections = [
    {
      heading: 'Awards',
      items: [{ title: 'Best Paper' }, { date: '2024' }]
    }
  ];

  const issues = validateResumeData(data);
  assert.ok(issues.some(item => item.path === 'customSections[0].items[1].title'));
  assert.ok(issues.every(item => item.section === 'customSections'));
});

test('formats issues with path, section, entry and hint', () => {
  const data = demoData();
  delete data.experience[0].title;

  const report = formatValidationIssues(validateResumeData(data), 'resume.jsonc');

  assert.match(report, /'resume\.jsonc' has 1 problem/);
  assert.match(report, /experience\[0\]\.title/);
  assert.match(report, /Section: experience, entry 1/);
  assert.match(report, /Hint: Add "title"/);
});
