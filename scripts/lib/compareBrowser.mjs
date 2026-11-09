/**
 * scripts/lib/compareBrowser.mjs: finds the browser and puppeteer-core, and starts and stops one
 * Chrome. puppeteer-core sits in a cache folder outside every repository: installing it into a site
 * would change that site's lock, and shared/ installs nothing. Its version is the one row
 * requirements.cjs holds for it.
 *
 * The browser talks over a pipe, so it opens no port and exits with this process, even a killed one.
 *
 * Chrome's crash reporter starts in a process group of its own and keeps Chrome's stderr open, for
 * seconds or minutes after Chrome itself has gone. Node waits for a child's output to close before it
 * exits, so a stopped browser's output is let go here: otherwise a compare sits on after its verdict,
 * for as long as the reporter lives, and a caller with a time limit stops it there.
 *
 * HOW TO CHANGE IT
 *   A new puppeteer-core version: RANGES in requirements.cjs, then run the line this file prints.
 *   Flags and paths: compareSettings.mjs.
 */

import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { EXIT, ScriptError } from './exitCodes.mjs';
import {
  BROWSER_START_TIMEOUT_MS, BROWSER_STOP_TIMEOUT_MS, CHROME_ARGS, CHROME_ENV, chromePath, comparePackagesFolder,
} from './compareSettings.mjs';

const require = createRequire(import.meta.url);
const { RANGES } = require('../../requirements.cjs');

const PUPPETEER_PACKAGE = 'puppeteer-core';

/** The one version the cache must hold. */
export const PUPPETEER_VERSION = RANGES[PUPPETEER_PACKAGE];

/** The exact line that fills the cache. */
export function cacheInstallLine(env = process.env) {
  const prefix = comparePackagesFolder(env);
  return `npm install --prefix "${prefix}" --save-exact --ignore-scripts ${PUPPETEER_PACKAGE}@${PUPPETEER_VERSION}`;
}

/** The version the cache holds, or null. */
function cachedVersion(prefix) {
  const manifest = path.join(prefix, 'node_modules', PUPPETEER_PACKAGE, 'package.json');
  try {
    return JSON.parse(fs.readFileSync(manifest, 'utf8')).version;
  } catch {
    return null;
  }
}

/** puppeteer-core from the cache, or a refusal that prints the line to run. */
export async function loadPuppeteer(env = process.env) {
  const prefix = comparePackagesFolder(env);
  const found = cachedVersion(prefix);
  if (found !== PUPPETEER_VERSION) {
    const held = found === null ? 'nothing' : found;
    const message = `shared:compare needs ${PUPPETEER_PACKAGE} ${PUPPETEER_VERSION} in ${prefix}, which holds ${held}. ` +
      `Nothing was compared. Run:\n  ${cacheInstallLine(env)}`;
    throw new ScriptError(message, EXIT.REFUSED);
  }
  const entry = createRequire(path.join(prefix, 'package.json')).resolve(PUPPETEER_PACKAGE);
  const loaded = await import(pathToFileURL(entry).href);
  return loaded.default;
}

/** The browser's path, or a refusal that says how to name one. */
export function requireChrome(env = process.env) {
  const found = chromePath(env);
  if (found) return found;
  throw new ScriptError(`No Chrome found. Nothing was compared. Set ${CHROME_ENV} to its path.`, EXIT.REFUSED);
}

/** Starts one Chrome. This script handles signals itself, so it can stop things in order. */
export function startBrowser(puppeteer, executablePath) {
  return puppeteer.launch({
    executablePath,
    headless: true,
    pipe: true,
    args: [...CHROME_ARGS],
    timeout: BROWSER_START_TIMEOUT_MS,
    protocolTimeout: BROWSER_START_TIMEOUT_MS * 3,
    handleSIGINT: false,
    handleSIGTERM: false,
    handleSIGHUP: false,
  });
}

/** Lets go of a stopped browser's stdin, stdout, stderr and pipes, which a helper of its own may still hold. */
function releaseOutput(child) {
  for (const stream of child?.stdio ?? []) stream?.destroy();
}

/** Closes a browser, and kills it if closing hangs. Never throws. */
export async function stopBrowser(browser) {
  const child = browser.process();
  const closed = browser.close().catch(() => {});
  let timer;
  const timedOut = new Promise((resolve) => { timer = setTimeout(() => resolve('timeout'), BROWSER_STOP_TIMEOUT_MS); });
  const outcome = await Promise.race([closed, timedOut]);
  clearTimeout(timer);
  if (outcome === 'timeout') child?.kill('SIGKILL');
  releaseOutput(child);
}
