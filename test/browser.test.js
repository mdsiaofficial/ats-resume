import test from 'node:test';
import assert from 'node:assert/strict';
import { browserCandidates, findBrowserExecutable } from '../browser.js';

test('windows candidates include Chrome and Edge install locations', () => {
  const candidates = browserCandidates({
    platform: 'win32',
    env: {
      PROGRAMFILES: 'C:\\Program Files',
      'PROGRAMFILES(X86)': 'C:\\Program Files (x86)',
      LOCALAPPDATA: 'C:\\Users\\test\\AppData\\Local',
      PATH: ''
    }
  }).map(candidate => candidate.path);

  assert.ok(candidates.includes('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'));
  assert.ok(candidates.includes('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'));
  assert.ok(candidates.includes('C:\\Users\\test\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe'));
});

test('macOS candidates include application bundles', () => {
  const candidates = browserCandidates({
    platform: 'darwin',
    env: { HOME: '/Users/test', PATH: '' }
  }).map(candidate => candidate.path);

  assert.ok(candidates.includes('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'));
  assert.ok(candidates.includes('/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'));
  assert.ok(candidates.includes('/Users/test/Applications/Chromium.app/Contents/MacOS/Chromium'));
});

test('linux candidates search PATH for Chromium browsers', () => {
  const candidates = browserCandidates({
    platform: 'linux',
    env: { PATH: '/usr/local/bin:/usr/bin' }
  }).map(candidate => candidate.path);

  assert.ok(candidates.includes('/usr/bin/google-chrome'));
  assert.ok(candidates.includes('/usr/bin/chromium'));
  assert.ok(candidates.includes('/usr/bin/microsoft-edge'));
  assert.ok(candidates.includes('/usr/bin/brave-browser'));
});

test('PUPPETEER_EXECUTABLE_PATH takes priority', () => {
  const found = findBrowserExecutable({
    platform: 'linux',
    env: { PUPPETEER_EXECUTABLE_PATH: '/custom/chrome', PATH: '/usr/bin' },
    isExecutable: file => file === '/custom/chrome'
  });

  assert.deepEqual(found, { name: 'PUPPETEER_EXECUTABLE_PATH', path: '/custom/chrome' });
});

test('CHROME_PATH is used when PUPPETEER_EXECUTABLE_PATH is not set', () => {
  const found = findBrowserExecutable({
    platform: 'linux',
    env: { CHROME_PATH: '/custom/edge' },
    isExecutable: file => file === '/custom/edge'
  });

  assert.deepEqual(found, { name: 'CHROME_PATH', path: '/custom/edge' });
});

test('an invalid PUPPETEER_EXECUTABLE_PATH is reported', () => {
  assert.throws(
    () =>
      findBrowserExecutable({
        platform: 'linux',
        env: { PUPPETEER_EXECUTABLE_PATH: '/missing/chrome' },
        isExecutable: () => false
      }),
    err => {
      assert.equal(err.code, 'ERR_BROWSER_NOT_FOUND');
      assert.match(err.message, /PUPPETEER_EXECUTABLE_PATH/);
      return true;
    }
  );
});

test('the first installed browser is returned', () => {
  const found = findBrowserExecutable({
    platform: 'linux',
    env: { PATH: '/usr/bin' },
    isExecutable: file => file === '/usr/bin/chromium'
  });

  assert.equal(found.name, 'Chromium');
  assert.equal(found.path, '/usr/bin/chromium');
});

test('returns null when no browser is installed', () => {
  const found = findBrowserExecutable({
    platform: 'linux',
    env: { PATH: '/nowhere' },
    isExecutable: () => false
  });

  assert.equal(found, null);
});
