import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable, Writable } from 'node:stream';
import readline from 'node:readline';
import { AVAILABLE_SECTIONS, filterDataBySections } from '../template-jsonc.js';
import { promptSectionSelection } from '../cli.js';
import { masterData } from '../data.js';

test('filterDataBySections includes personalInfo always', () => {
  const filtered = filterDataBySections(masterData, ['skills']);
  assert.ok(filtered.personalInfo);
  assert.ok(filtered.skills);
  assert.equal(filtered.experience, undefined);
  assert.equal(filtered.education, undefined);
  assert.equal(filtered.certifications, undefined);
});

test('filterDataBySections includes summary_portfolio if summary_resume selected', () => {
  const filtered = filterDataBySections(masterData, ['summary_resume']);
  assert.ok(filtered.personalInfo);
  assert.ok(filtered.summary_resume);
  assert.ok(filtered.summary_portfolio);
  assert.equal(filtered.skills, undefined);
});

test('filterDataBySections returns original data when selectedKeys is null', () => {
  const result = filterDataBySections(masterData, null);
  assert.deepEqual(result, masterData);
});

test('AVAILABLE_SECTIONS covers all optional masterData sections', () => {
  const availableKeys = AVAILABLE_SECTIONS.map(s => s.key);
  assert.ok(availableKeys.includes('summary_resume'));
  assert.ok(availableKeys.includes('experience'));
  assert.ok(availableKeys.includes('education'));
  assert.ok(availableKeys.includes('skills'));
  assert.ok(availableKeys.includes('projects'));
  assert.ok(availableKeys.includes('certifications'));
  assert.ok(availableKeys.includes('achievements'));
  assert.ok(availableKeys.includes('volunteerExperience'));
  assert.ok(availableKeys.includes('languages'));
  assert.ok(availableKeys.includes('professionalAffiliations'));
  assert.ok(availableKeys.includes('publications'));
  assert.ok(availableKeys.includes('references'));
  assert.ok(availableKeys.includes('socialLinks'));
});

function createMockReadline(inputString) {
  const input = new Readable({
    read() {
      this.push(inputString);
      this.push(null);
    }
  });
  const output = new Writable({
    write(chunk, encoding, callback) {
      callback();
    }
  });
  return readline.createInterface({ input, output });
}

test('promptSectionSelection parses numbers separated by comma and space', async () => {
  // index 2 = Work Experience ('experience'), index 4 = Skills ('skills')
  // according to AVAILABLE_SECTIONS:
  // 1: summary_resume, 2: experience, 3: education, 4: skills
  const rl = createMockReadline('2, 4\n');
  const selected = await promptSectionSelection(rl);
  assert.deepEqual(selected, ['experience', 'skills']);
});

test('promptSectionSelection parses "a" or "all" to return all sections', async () => {
  const rl = createMockReadline('a\n');
  const selected = await promptSectionSelection(rl);
  assert.deepEqual(selected, AVAILABLE_SECTIONS.map(s => s.key));
});

test('promptSectionSelection defaults to all sections on empty input', async () => {
  const rl = createMockReadline('\n');
  const selected = await promptSectionSelection(rl);
  assert.deepEqual(selected, AVAILABLE_SECTIONS.map(s => s.key));
});
