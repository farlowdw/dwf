/**
 * scripts/lib/settings.mjs: the names every shared script agrees on, in one place.
 *
 * HOW TO CHANGE IT
 *   Change a value here and every script follows. REMOTE_URL is the hub. Test fixtures point the
 *   scripts at a local bare repository through the variable named by REMOTE_URL_ENV, so they never
 *   need the real hub. The same goes for the word list and WORD_LIST_ENV, and for the npm that
 *   shared:status asks about new versions and NPM_COMMAND_ENV. The four files of a site that scripts
 *   read and write, the other names two scripts share and MS_PER_SECOND are here, so that no script
 *   spells them for itself. scripts/__tests__/onePlace.test.mjs goes red at a second copy.
 */

import os from 'node:os';
import path from 'node:path';

/** The folder the hub is mounted at in every site. */
export const PREFIX = 'shared';

/** The folder of a new site's files, inside the mount. Its package.json and .nvmrc are the pin. */
export const TEMPLATE_FOLDER = 'template';

/** The name of the git remote that points at the hub, in every site. */
export const REMOTE = 'shared';

/** The hub's one branch. */
export const BRANCH = 'main';

/** The branch a site pulls and pushes on. */
export const SITE_BRANCH = 'master';

/** Where the hub lives. Use remoteUrl() to read it: that one honours a fixture's override. */
export const REMOTE_URL = 'git@github.com:farlowdw/docusaurus-shared.git';

/** Set this variable to point the scripts at another hub. Fixtures use it. */
export const REMOTE_URL_ENV = 'DOCUSAURUS_SHARED_REMOTE_URL';

/** The ref a fetch of the hub updates in a site. */
export const UPSTREAM_REF = `refs/remotes/${REMOTE}/${BRANCH}`;

/** A site's own files that the scripts read, and some write. */
export const MANIFEST_FILE = 'package.json';
export const LOCK_FILE = 'package-lock.json';
export const NVMRC_FILE = '.nvmrc';
export const NETLIFY_FILE = 'netlify.toml';

/** The page every Docusaurus build holds at its root. */
export const BUILD_ENTRY = 'index.html';

/**
 * What Docusaurus keeps between runs: its generated files and the bundler's cache. A cold build clears them, and so
 * does a pull that changes a file the config reads at start-up, because that cache does not see such a file.
 */
export const BUILD_CACHE_FOLDERS = Object.freeze(['.docusaurus', 'node_modules/.cache']);

/** The folder of the scripts, inside the mount. */
export const SCRIPTS_FOLDER = 'scripts';

/** Files a Mac writes by itself, which git ignores and which matter to nobody. */
export const SYSTEM_FILES = new Set(['.DS_Store']);

/** node sets this inside a test. A `node --test` that inherits it runs no file and exits 0. */
export const NESTED_RUN_VARIABLE = 'NODE_TEST_CONTEXT';

/** Seconds, the unit people read and type, against milliseconds, the unit node's timers take. */
export const MS_PER_SECOND = 1000;

/** The private word list, below the home folder. It lives outside every repo on purpose. */
export const WORD_LIST_FROM_HOME = '.config/docusaurus-shared/private-words.txt';

/** Set this variable to read another word list. Fixtures use it. */
export const WORD_LIST_ENV = 'DOCUSAURUS_SHARED_WORD_LIST';

/** The command that asks npm for the newest Docusaurus. */
export const NPM_COMMAND = 'npm';

/** Set this variable to run another command in its place. Fixtures use it, so tests need no network. */
export const NPM_COMMAND_ENV = 'DOCUSAURUS_SHARED_NPM';

/** The hub's address, or a fixture's stand-in. */
export function remoteUrl(env = process.env) {
  return env[REMOTE_URL_ENV] || REMOTE_URL;
}

/** The path of the private word list on this machine. */
export function wordListPath(env = process.env) {
  return env[WORD_LIST_ENV] || path.join(os.homedir(), WORD_LIST_FROM_HOME);
}

/** The npm command to run, or a fixture's stand-in. */
export function npmCommand(env = process.env) {
  return env[NPM_COMMAND_ENV] || NPM_COMMAND;
}
