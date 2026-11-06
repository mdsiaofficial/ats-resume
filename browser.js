/**
 * Locates an installed Chromium-based browser.
 *
 * ats-resume uses puppeteer-core, which does not download a browser. Chrome,
 * Edge, Chromium, and Brave all expose the same DevTools protocol, so the first
 * one found is used.
 */

import fs from 'fs';
import path from 'path';

const MAC_ROOT_APPS = '/Applications';
const LINUX_ABSOLUTE_PATHS = [
  ['Google Chrome', '/opt/google/chrome/chrome'],
  ['Chromium', '/snap/bin/chromium']
];

function joinPath(platform, ...parts) {
  const join = platform === 'win32' ? path.win32.join : path.posix.join;
  return join(...parts.filter(part => part != null && part !== ''));
}

function pathEntries(env, platform) {
  const raw = platform === 'win32' ? env.PATH || env.Path || '' : env.PATH || '';
  return String(raw)
    .split(platform === 'win32' ? ';' : ':')
    .map(entry => entry.trim().replace(/^"(.*)"$/, '$1'))
    .filter(Boolean);
}

/**
 * Builds the ordered list of browser executables to check.
 *
 * Paths are constructed with `path.win32` or `path.posix` explicitly so the
 * list is correct for the target platform even when this function is tested on
 * a different one.
 *
 * @returns {Array<{name:string, path:string}>}
 */
export function browserCandidates({ platform = process.platform, env = process.env } = {}) {
  const candidates = [];
  const seen = new Set();

  const add = (name, filePath) => {
    if (!filePath) return;
    const key = platform === 'win32' ? filePath.toLowerCase() : filePath;
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push({ name, path: filePath });
  };

  const addFromPath = (name, executables) => {
    for (const dir of pathEntries(env, platform)) {
      for (const executable of executables) {
        add(name, joinPath(platform, dir, executable));
      }
    }
  };

  if (platform === 'win32') {
    const programFiles = env.PROGRAMFILES;
    const programFilesX86 = env['PROGRAMFILES(X86)'];
    const localAppData = env.LOCALAPPDATA;

    if (programFiles) {
      add('Google Chrome', joinPath(platform, programFiles, 'Google', 'Chrome', 'Application', 'chrome.exe'));
      add('Microsoft Edge', joinPath(platform, programFiles, 'Microsoft', 'Edge', 'Application', 'msedge.exe'));
    }
    if (programFilesX86) {
      add('Google Chrome', joinPath(platform, programFilesX86, 'Google', 'Chrome', 'Application', 'chrome.exe'));
      add('Microsoft Edge', joinPath(platform, programFilesX86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'));
    }
    if (localAppData) {
      add('Google Chrome', joinPath(platform, localAppData, 'Google', 'Chrome', 'Application', 'chrome.exe'));
      add('Microsoft Edge', joinPath(platform, localAppData, 'Microsoft', 'Edge', 'Application', 'msedge.exe'));
    }

    addFromPath('Google Chrome', ['chrome.exe']);
    addFromPath('Microsoft Edge', ['msedge.exe']);
    return candidates;
  }

  if (platform === 'darwin') {
    const roots = [MAC_ROOT_APPS];
    if (env.HOME) roots.push(joinPath(platform, env.HOME, 'Applications'));

    for (const root of roots) {
      add('Google Chrome', joinPath(platform, root, 'Google Chrome.app', 'Contents', 'MacOS', 'Google Chrome'));
      add('Microsoft Edge', joinPath(platform, root, 'Microsoft Edge.app', 'Contents', 'MacOS', 'Microsoft Edge'));
      add('Chromium', joinPath(platform, root, 'Chromium.app', 'Contents', 'MacOS', 'Chromium'));
      add('Brave', joinPath(platform, root, 'Brave Browser.app', 'Contents', 'MacOS', 'Brave Browser'));
    }

    addFromPath('Google Chrome', ['google-chrome']);
    addFromPath('Chromium', ['chromium']);
    addFromPath('Microsoft Edge', ['microsoft-edge']);
    addFromPath('Brave', ['brave-browser']);
    return candidates;
  }

  // Linux and other POSIX systems.
  addFromPath('Google Chrome', ['google-chrome', 'google-chrome-stable']);
  addFromPath('Chromium', ['chromium', 'chromium-browser']);
  addFromPath('Microsoft Edge', ['microsoft-edge', 'microsoft-edge-stable']);
  addFromPath('Brave', ['brave-browser']);

  for (const [name, filePath] of LINUX_ABSOLUTE_PATHS) {
    add(name, filePath);
  }
  return candidates;
}

function defaultIsExecutable(filePath) {
  try {
    if (!fs.statSync(filePath).isFile()) return false;
    fs.accessSync(filePath, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Returns the first usable browser, honouring PUPPETEER_EXECUTABLE_PATH first.
 *
 * @returns {{name:string, path:string}|null}
 */
export function findBrowserExecutable({
  platform = process.platform,
  env = process.env,
  isExecutable = defaultIsExecutable
} = {}) {
  const overrideName = env.PUPPETEER_EXECUTABLE_PATH
    ? 'PUPPETEER_EXECUTABLE_PATH'
    : env.CHROME_PATH
      ? 'CHROME_PATH'
      : null;
  const overrideValue = overrideName
    ? String(env[overrideName]).trim().replace(/^"(.*)"$/, '$1')
    : '';

  if (overrideValue) {
    if (isExecutable(overrideValue)) return { name: overrideName, path: overrideValue };

    const error = new Error(
      `${overrideName} points to '${overrideValue}', but that file does not exist or is not executable.`
    );
    error.code = 'ERR_BROWSER_NOT_FOUND';
    throw error;
  }

  for (const candidate of browserCandidates({ platform, env })) {
    if (isExecutable(candidate.path)) return candidate;
  }

  return null;
}
