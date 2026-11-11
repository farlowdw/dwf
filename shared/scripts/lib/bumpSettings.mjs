/**
 * scripts/lib/bumpSettings.mjs: every number, name and command of `shared:bump`, in one place.
 *
 * HOW TO CHANGE IT
 *   A suite that needs longer: VERIFY_TIMEOUT_SECONDS, or `-- --verify-timeout <seconds>` for one run.
 *   Another folder a cold build must clear: COLD_FOLDERS. The way a build is made: BUILD_ENV, which
 *   binds both sides of the compare. The commit's wording: commitSubject. Tests point the script at a
 *   stand-in compare through COMPARE_SCRIPT_ENV. The site's file names are in settings.mjs, and the
 *   signals a run stops on in exitCodes.mjs, because other scripts read them too.
 */

import { BUILD_CACHE_FOLDERS, LOCK_FILE, MANIFEST_FILE } from './settings.mjs';

/** The two files a bump changes and commits. Nothing else may change. */
export const CHANGED_FILES = Object.freeze([MANIFEST_FILE, LOCK_FILE]);

/** npm's own record of what node_modules holds. A bump changes the folder under it, so it goes too. */
export const HIDDEN_LOCK = 'node_modules/.package-lock.json';

export const BUILD_FOLDER = 'build';

/** What a cold build starts without. Docusaurus's own `clear` removes the same three. */
export const COLD_FOLDERS = Object.freeze([BUILD_FOLDER, ...BUILD_CACHE_FOLDERS]);

/**
 * The shape of a build, on both sides of the compare. Docusaurus reads this before a site's config
 * loads, so a value in a site's .env comes too late: it has to be set here, in the process.
 */
export const BUILD_ENV = Object.freeze({ SKIP_HTML_MINIFICATION: 'true' });

/** The first line of a page built that way. A minified page starts `<!doctype html><html`. */
export const BUILD_SHAPE_START = /^<!DOCTYPE html>\r?\n/;

/** Explicit, so that a setting in an .npmrc or the environment cannot turn a failed install green. */
export const INSTALL_ARGS = Object.freeze(['install', '--no-audit', '--no-fund', '--no-force', '--no-legacy-peer-deps']);
export const BUILD_ARGS = Object.freeze(['run', 'build']);

/** A site's own line. A site without it gets test:shared. */
export const VERIFY_SCRIPT = 'shared:verify';
export const FALLBACK_VERIFY_LABEL = 'test:shared';
export const FALLBACK_VERIFY_FILE = 'test.mjs';

export const COMPARE_FILE = 'compare.mjs';

/** Set this variable to run another compare. Fixtures use it, so most tests need no browser. */
export const COMPARE_SCRIPT_ENV = 'DOCUSAURUS_SHARED_COMPARE';

/**
 * A hung suite reads red at this mark. A site's whole shared:verify runs every suite of the site in a row (one
 * site has ten), at 2 to 6 minutes on a quiet Mac and more under load: 180 s went red by the clock.
 */
export const VERIFY_TIMEOUT_SECONDS = 900;

/** Far above a slow day, so that a stuck install or build ends instead of waiting for a person. */
export const INSTALL_TIMEOUT_SECONDS = 900;
export const BUILD_TIMEOUT_SECONDS = 1800;

/** How long a step has after SIGTERM before SIGKILL. */
export const KILL_GRACE_MS = 3000;

export const MUI_SCOPE = '@mui/';

/** Any move of these in the lock is red: a site holds them where they are for reasons of its own. */
export const MUI_X_PREFIX = '@mui/x-';

/** Below the system's temp folder unless `--keep` names another: the old build, the logs, the compare. */
export const KEEP_ROOT = 'docusaurus-shared-bump';
export const BEFORE_FOLDER = 'before';
export const COMPARE_FOLDER = 'compare';
export const LOGS_FOLDER = 'logs';

/** How many lines of a log a red step prints. */
export const LOG_TAIL_LINES = 25;

/** The subject of the commit on green. It reaches public history on a public site. */
export function commitSubject(version) {
  return `Bump Docusaurus to ${version}`;
}
