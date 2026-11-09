/**
 * scripts/lib/joinSettings.mjs: every name, line and subject of `shared:join`, in one place.
 *
 * HOW TO CHANGE IT
 *   A new command for every site: SITE_LINES here, and its line in the README's package.json block. A test
 *   holds the two equal. The deploy line a site ends up with: DEPLOY_LINE. What a joined site's .gitignore
 *   must hold: the lists in lib/joinHousekeeping.mjs. Tests point the script at a stand-in for the Netlify
 *   CLI through NETLIFY_COMMAND_ENV, so they need no network. package.json, .nvmrc and netlify.toml are
 *   named in settings.mjs, since other scripts read them too.
 */

export const SCRIPT = 'shared:join';

export const IGNORE_FILE = '.gitignore';
export const ENV_FILE = '.env';

/** The .gitignore a site starts with, in template/. A real .gitignore there would act inside shared/. */
export const IGNORE_TEMPLATE_FILE = 'gitignore.template';

/** Where the Netlify CLI records which project a folder is linked to. It holds no secret. */
export const NETLIFY_STATE_FILE = '.netlify/state.json';

export const CORE_PACKAGE = '@docusaurus/core';
export const MUI_PACKAGE = '@mui/material';

/** It crashes an Rspack build, and a site that joins reads no value through it. */
export const DOTENV_PACKAGE = 'docusaurus2-dotenv';

/** Below this major a site is refused: shared/ was never built for it. */
export const FIRST_JOINABLE_MAJOR = 3;

/** What the older sites hold. It publishes outside Netlify, so a join replaces it. */
export const OLD_DEPLOY_LINE = 'docusaurus deploy';

export const DEPLOY_LINE = 'netlify deploy --prod --context production';

/** A deploy line holding this already goes through Netlify, so it stays as it is. */
export const DEPLOY_SIGN = 'netlify deploy';

/** The lines every joined site holds, the same ones the README prints. */
export const SITE_LINES = Object.freeze({
  'shared:status': 'node shared/scripts/status.mjs',
  'shared:pull': 'node shared/scripts/pull.mjs',
  'shared:push': 'node shared/scripts/push.mjs',
  'test:shared': 'node shared/scripts/test.mjs',
  'shared:new': 'node shared/scripts/new-site.mjs',
  'shared:join': 'node shared/scripts/join.mjs',
  'shared:leave': 'node shared/scripts/leave.mjs',
  'shared:bump': 'node shared/scripts/bump.mjs',
  'shared:all': 'node shared/scripts/all.mjs',
  'shared:compare': 'node shared/scripts/compare.mjs',
});

/** The check that stops an old MUI name. A site's verify line runs it first. */
export const MUI_GUARD_LINE = 'node shared/scripts/check-mui-api.mjs';

/** A site's own line, which a join writes once and never compares. */
export const VERIFY_LINE_NAME = 'shared:verify';
export const VERIFY_LINE = `${MUI_GUARD_LINE} && npm run test:shared`;

/** Every site has the first page. The second counts only when its file is there. */
export const HOME_PAGE = '/';
export const DOCS_PAGE = '/docs/intro';
export const DOCS_PAGE_FILES = Object.freeze(['docs/intro.md', 'docs/intro.mdx']);

/** The patch that moves a site's own components to MUI 9, from this script's folder. */
export const MUI_PATCH = 'patches/mui-9-components.patch';

/** A component that holds MUI X code, so no patch in shared/ can carry it. */
export const GRID_COMPONENT = 'src/components/CustomToolbar';

/** Two older components that import the same grid. The patch moves them, and they go if no page shows them. */
export const GRID_ILLUSTRATIONS = 'src/components/_IllustrationsOnly';

/** The last step of a public site's build. */
export const PUBLIC_CHECK_LINE = 'node shared/scripts/check-public.mjs';

/** The folder a site keeps a build in, beside the site, from before its join. */
export const KEPT_BUILD = '../keep-build';

/** The build command of the template's netlify.toml, and the same with the public check. */
export const PLAIN_BUILD_LINE = 'command = "npm run build"';
export const PUBLIC_BUILD_LINE = `command = "npm run build && ${PUBLIC_CHECK_LINE}"`;

/** The two commits a join makes in a site. Each one reaches public history on a public site. */
export const HOUSEKEEPING_SUBJECT = 'Track the ignore file and deploy through Netlify';
export const SITE_LINES_SUBJECT = 'Add the shared commands and stubs';

/** Set this variable to run another command in place of the Netlify CLI. Fixtures use it. */
export const NETLIFY_COMMAND_ENV = 'DOCUSAURUS_SHARED_NETLIFY';
export const NETLIFY_COMMAND = 'netlify';

/** The CLI's answer can wait this long. A slow answer reads as "could not read". */
export const NETLIFY_TIMEOUT_MS = 20000;

/** The Netlify command to run, or a fixture's stand-in. */
export function netlifyCommand(env = process.env) {
  return env[NETLIFY_COMMAND_ENV] || NETLIFY_COMMAND;
}
