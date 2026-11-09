/**
 * scripts/lib/newSiteSettings.mjs: every name, shape and subject of `shared:new`, in one place.
 *
 * HOW TO CHANGE IT
 *   A new word to fill in the template: a row in TOKENS, a value in lib/newSiteFiles.mjs > tokenValues, and
 *   the token in the template's files. What counts as a good folder, repository or Netlify project: NAME_SHAPE,
 *   REPO_SHAPE, PROJECT_SHAPE. The commits a new site starts with: the *_SUBJECT constants. Each reaches public
 *   history on a public site.
 */

import { PREFIX } from './settings.mjs';

export const SCRIPT = 'shared:new';

/** The tokens of the template's files. */
export const TOKENS = Object.freeze({
  title: '__SITE_TITLE__',
  url: '__SITE_URL__',
  repo: '__SITE_REPO__',
});

/** Any token, this script's or a newer template's. One left after the fill stops the run. */
export const ANY_TOKEN = /__SITE_[A-Z_]+__/g;

/** A folder's name becomes the package's name, so it follows npm's rule. */
export const NAME_SHAPE = /^[a-z0-9][a-z0-9._-]*$/;

/**
 * A Netlify project's name: letters, digits and hyphens. The netlify CLI refuses anything else before it makes
 * anything, so a block that asks for such a name would stop after the GitHub repository was made.
 */
export const PROJECT_SHAPE = /^[a-z0-9][a-z0-9-]*$/;

/** owner/name, as GitHub spells them. */
export const REPO_SHAPE = /^[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9._-]+$/;

/** A title goes in a file and on a page, so a line break or a control character stops it. */
export const CONTROL_CHARACTER = /\p{Cc}/u;

/** A site is served from https, at the root of its host. */
export const URL_PROTOCOL = 'https:';
export const ROOT_PATH = '/';

/** A host Netlify gives out. It needs no custom domain and no DNS record. */
export const NETLIFY_HOST_END = '.netlify.app';

/** The tracked files of the template, from a new site's root. */
export const TEMPLATE_PATH = `${PREFIX}/template`;

/** How long the hub may take to answer before anything is made. */
export const HUB_TIMEOUT_MS = 60000;

/** Below the system's temp folder: one folder per run, for the logs. */
export const LOGS_PREFIX = 'docusaurus-shared-new-';

/** The public check, from a new site's root, with the flag that names the word list. */
export const PUBLIC_CHECK_SCRIPT = `${PREFIX}/scripts/check-public.mjs`;
export const WORD_FILE_FLAG = '--word-file';

/** The three commits of a new site, around the subtree add's own two. */
export const START_SUBJECT = 'Start the repository';
export const FILES_SUBJECT = 'Add the site from the shared template';
export const LOCK_SUBJECT = 'Add the package lock';
