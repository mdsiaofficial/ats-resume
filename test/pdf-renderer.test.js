import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  buildDocDefinition,
  generatePDF,
  loadProfileImage,
  normalizeImageShape,
  resolveImageSource
} from '../pdf-renderer.js';
import { masterData } from '../data.js';

// 1x1 transparent PNG used for local image tests.
const TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
const TINY_PNG_BYTES = Buffer.from(TINY_PNG_BASE64, 'base64');
const TINY_PNG_DATA_URI = `data:image/png;base64,${TINY_PNG_BASE64}`;

function demoData() {
  return structuredClone(masterData);
}

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ats-resume-test-'));
}

function collectText(node, output = []) {
  if (node == null) return output;
  if (Array.isArray(node)) {
    node.forEach(item => collectText(item, output));
    return output;
  }
  if (typeof node !== 'object') return output;

  if (typeof node.text === 'string') output.push(node.text);
  for (const value of Object.values(node)) {
    if (value && typeof value === 'object') collectText(value, output);
  }
  return output;
}

async function captureWarnings(callback) {
  const warnings = [];
  const original = console.warn;
  console.warn = (...args) => warnings.push(args.join(' '));
  try {
    await callback();
  } finally {
    console.warn = original;
  }
  return warnings;
}

test('normalizeImageShape accepts known shapes and common synonyms', () => {
  assert.equal(normalizeImageShape('circle'), 'circle');
  assert.equal(normalizeImageShape('SQUARE'), 'square');
  assert.equal(normalizeImageShape('rounded'), 'rounded');
  assert.equal(normalizeImageShape('round'), 'circle');
  assert.equal(normalizeImageShape('circular'), 'circle');
  assert.equal(normalizeImageShape('rect'), 'square');
  assert.equal(normalizeImageShape('rounded-corner'), 'rounded');
});

test('normalizeImageShape falls back to circle for unknown values', () => {
  assert.equal(normalizeImageShape(''), 'circle');
  assert.equal(normalizeImageShape('hexagon'), 'circle');
  assert.equal(normalizeImageShape(undefined), 'circle');
});

test('resolveImageSource turns local images into data URIs', () => {
  const dir = tempDir();
  try {
    const file = path.join(dir, 'photo.png');
    fs.writeFileSync(file, TINY_PNG_BYTES);

    assert.equal(resolveImageSource('photo.png', dir), TINY_PNG_DATA_URI);
    assert.equal(resolveImageSource(file, dir), TINY_PNG_DATA_URI);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('resolveImageSource passes through safe remote and data URLs', () => {
  assert.equal(resolveImageSource('https://example.com/photo.png'), 'https://example.com/photo.png');
  assert.equal(resolveImageSource(TINY_PNG_DATA_URI), TINY_PNG_DATA_URI);
  assert.equal(resolveImageSource('ftp://example.com/photo.png'), null);
});

test('resolveImageSource warns and skips unknown local extensions', async () => {
  const dir = tempDir();
  try {
    const file = path.join(dir, 'photo.bmp');
    fs.writeFileSync(file, 'not an image');

    let result;
    const warnings = await captureWarnings(async () => {
      result = resolveImageSource('photo.bmp', dir);
    });

    assert.equal(result, null);
    assert.match(warnings[0], /Unsupported profile image type '\.bmp'/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('loadProfileImage returns a raster payload for PNG', async () => {
  const dir = tempDir();
  try {
    fs.writeFileSync(path.join(dir, 'photo.png'), TINY_PNG_BYTES);
    const photo = await loadProfileImage('photo.png', dir);
    assert.deepEqual(photo, { image: TINY_PNG_DATA_URI });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('loadProfileImage decodes local SVG images', async () => {
  const dir = tempDir();
  try {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>';
    fs.writeFileSync(path.join(dir, 'photo.svg'), svg);

    const photo = await loadProfileImage('photo.svg', dir);
    assert.deepEqual(photo, { svg });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('loadProfileImage warns and skips GIF and WebP images', async () => {
  const dir = tempDir();
  try {
    fs.writeFileSync(path.join(dir, 'photo.gif'), 'GIF89a');

    let photo;
    const warnings = await captureWarnings(async () => {
      photo = await loadProfileImage('photo.gif', dir);
    });

    assert.equal(photo, null);
    assert.match(warnings[0], /Unsupported profile image type 'gif'/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('loadProfileImage fetches remote images and trusts the content type', async () => {
  const originalFetch = global.fetch;
  try {
    global.fetch = async () => new Response(TINY_PNG_BYTES, {
      status: 200,
      headers: { 'content-type': 'image/png' }
    });

    const raster = await loadProfileImage('https://example.com/photo');
    assert.match(raster.image, /^data:image\/png;base64,/);

    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>';
    global.fetch = async () => new Response(svg, {
      status: 200,
      headers: { 'content-type': 'image/svg+xml' }
    });

    const vector = await loadProfileImage('https://example.com/photo.svg');
    assert.deepEqual(vector, { svg });
  } finally {
    global.fetch = originalFetch;
  }
});

test('loadProfileImage warns and skips unreachable remote images', async () => {
  const originalFetch = global.fetch;
  try {
    global.fetch = async () => new Response('missing', { status: 404 });

    let photo;
    const warnings = await captureWarnings(async () => {
      photo = await loadProfileImage('https://example.com/missing.png');
    });

    assert.equal(photo, null);
    assert.match(warnings[0], /Could not load profile image/);
    assert.match(warnings[0], /HTTP 404/);
  } finally {
    global.fetch = originalFetch;
  }
});

test('buildDocDefinition renders sections in the original order', async () => {
  const data = demoData();
  data.personalInfo.image = '';

  const doc = await buildDocDefinition(data);
  const texts = collectText(doc);
  const headings = [
    'SUMMARY',
    'EXPERIENCE',
    'TECHNICAL SKILLS',
    'EDUCATION',
    'PROJECTS',
    'CERTIFICATIONS',
    'ACHIEVEMENTS',
    'VOLUNTEER EXPERIENCE',
    'LANGUAGES'
  ];

  const positions = headings.map(heading => texts.indexOf(heading));
  assert.ok(positions.every(position => position >= 0), `missing heading in: ${texts.join(' | ')}`);
  assert.deepEqual(positions, [...positions].sort((a, b) => a - b));
});

test('buildDocDefinition hides entries with show_resume false', async () => {
  const data = demoData();
  data.personalInfo.image = '';

  const doc = await buildDocDefinition(data);
  const text = collectText(doc).join('');

  assert.match(text, /Software Engineer — Nexora Labs/);
  assert.doesNotMatch(text, /Junior Software Engineer/);
  assert.match(text, /Internship Trainee/);
});

test('buildDocDefinition follows headerLinkStyle', async () => {
  const data = demoData();
  data.personalInfo.image = '';

  data.personalInfo.headerLinkStyle = 'url';
  let text = collectText(await buildDocDefinition(data)).join('');
  assert.match(text, /fatemajannat\.dev/);
  assert.match(text, /github\.com\/fatemajannat/);
  assert.doesNotMatch(text, /WEBSITE/);

  data.personalInfo.headerLinkStyle = 'label';
  text = collectText(await buildDocDefinition(data)).join('');
  assert.match(text, /WEBSITE/);
  assert.match(text, /GITHUB/);
  assert.match(text, /LINKEDIN/);
});

test('buildDocDefinition clips the profile photo with the requested shape', async () => {
  const data = demoData();
  data.personalInfo.image = TINY_PNG_DATA_URI;

  data.personalInfo.imageShape = 'circle';
  let doc = JSON.stringify(await buildDocDefinition(data));
  assert.match(doc, /atsPhotoClip/);
  assert.match(doc, /<circle cx=/);

  data.personalInfo.imageShape = 'square';
  doc = JSON.stringify(await buildDocDefinition(data));
  assert.match(doc, /width=\\"72\\" height=\\"87\\"/);

  data.personalInfo.imageShape = 'rounded';
  doc = JSON.stringify(await buildDocDefinition(data));
  assert.match(doc, /rx=\\"6\\"/);
});

test('buildDocDefinition renders custom sections after the built-in ones', async () => {
  const data = demoData();
  data.personalInfo.image = '';
  data.customSections = [{
    show_resume: true,
    heading: 'Notable Work',
    items: [{
      show_resume: true,
      title: 'Open Source Maintainer',
      date: '2025',
      location: 'Remote',
      description: 'Maintained a small CLI project.'
    }]
  }];

  const texts = collectText(await buildDocDefinition(data));
  const languages = texts.indexOf('LANGUAGES');
  const custom = texts.indexOf('NOTABLE WORK');

  assert.ok(custom > languages);
  assert.ok(texts.includes('Open Source Maintainer'));
  assert.ok(texts.includes('Remote'));
});

test('generatePDF writes a valid PDF without a browser', async () => {
  const dir = tempDir();
  try {
    const data = demoData();
    data.personalInfo.image = '';
    const output = path.join(dir, 'resume.pdf');

    await generatePDF(data, output);

    const buffer = fs.readFileSync(output);
    assert.equal(buffer.subarray(0, 5).toString(), '%PDF-');
    assert.ok(buffer.length > 5000);
    assert.ok(buffer.includes(Buffer.from('%%EOF')));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
