/**
 * scripts/lib/joinByHand.mjs: the list `shared:join` prints at its end. A join does the mechanical part. It
 * never touches a site's config, CSS or MUI, so those steps are a person's, in this order. Each row prints
 * only when the facts say it is still open, so a second run prints a shorter list.
 *
 * The MUI rows come before the bump. shared:bump runs shared:verify, a join's verify line opens with the old-MUI
 * check, and a site still on old names would go red there. A site's MUI X packages come before the MUI install,
 * because their ranges for MUI stop it at ERESOLVE. A real older site set this order, and the README follows it.
 * The packages a site lacks outright come before the bump too: the bump builds the site first, and the stubs the
 * join wrote import them. A plain Docusaurus site with no MUI set that row.
 *
 * A site that comes back after shared:leave gets no compare row: its shared/ stayed, and the join changes only
 * package.json and the remote.
 *
 * HOW TO CHANGE IT
 *   A new step: a row in STEPS, in the order a person should take it. `open` reads the facts of
 *   lib/joinFacts.mjs and `text` gives the sentence. The wiring's lines are in the README: name the section.
 */

import { MUI_SCOPE } from './bumpSettings.mjs';
import { DOTENV_PACKAGE, GRID_COMPONENT, KEPT_BUILD, MUI_GUARD_LINE, PUBLIC_CHECK_LINE } from './joinSettings.mjs';
import { COPY } from './joinStubs.mjs';
import { applyLine } from './joinPatch.mjs';
import { ON_PUSH } from './joinNetlify.mjs';
import { installLine } from './requirements.mjs';
import { NETLIFY_FILE, PREFIX } from './settings.mjs';

const CONFIG_SIGN = `${PREFIX}/wiring/index.cjs`;
const STYLES_SIGN = `${PREFIX}/css/custom.scss`;

const README = `${PREFIX}/README.md`;
const JOIN_SECTION = 'Join an existing site';
const JOIN_AGAIN = 'npm run shared:join -- .';

/** The copies that still differ from shared/. */
function differing({ copies }) {
  return copies.components.filter(({ state }) => state === COPY.DIFFERS);
}

/** Their names, for a sentence. */
function differingNames(facts) {
  return differing(facts).map(({ row }) => row.name).join(', ');
}

/** True when the MUI step is still to come. */
function muiOpen({ mui }) {
  return Boolean(mui?.outside);
}

/** The packages to install by hand: those the site lacks, less MUI's own while the MUI step installs them. */
function toInstall(facts) {
  const lacking = facts.lacking ?? [];
  return muiOpen(facts) ? lacking.filter(({ name }) => !name.startsWith(MUI_SCOPE)) : lacking;
}

/** The steps, in the order a person takes them. */
const STEPS = Object.freeze([
  {
    open: ({ netlify }) => netlify.onDisk && !netlify.tracked,
    text: () => `${NETLIFY_FILE} sits out of git and stays ignored. Read it for secrets, then track it: git add -f ${NETLIFY_FILE}`,
  },
  {
    open: ({ hasDotenv }) => hasDotenv,
    text: () => `Take ${DOTENV_PACKAGE} out: npm uninstall ${DOTENV_PACKAGE}, then delete its block from plugins in `
      + 'docusaurus.config.js.',
  },
  {
    open: (facts) => muiOpen(facts) && facts.patch.fitting.length > 0,
    text: ({ patch }) => `Patch the site's own components: ${applyLine(patch.leftOut)}`,
  },
  {
    open: (facts) => muiOpen(facts) && facts.patch.changed.length > 0,
    text: ({ patch }) => `The patch leaves out what this site has changed, so move it to MUI 9 by hand: `
      + `${patch.changed.join(', ')}. ${MUI_GUARD_LINE} lists the old props.`,
  },
  {
    open: (facts) => muiOpen(facts) && facts.hasGridComponent,
    text: () => `${GRID_COMPONENT} and the grid illustrations hold MUI X code, so the patch cannot finish them. `
      + 'Delete them if no page imports them, or copy them from a site that has made this step.',
  },
  {
    open: (facts) => muiOpen(facts) && facts.muiX.length > 0,
    text: ({ muiX }) => `These MUI X packages stop the MUI install until they go. If no page shows a grid: npm uninstall ${muiX.join(' ')}`,
  },
  {
    open: muiOpen,
    text: ({ mui }) => `Move MUI to ${mui.range}: ${installLine(mui.installRows)}`,
  },
  {
    open: (facts) => toInstall(facts).length > 0,
    text: (facts) => `Install what the shared pieces need and this site lacks, and commit it: ${installLine(toInstall(facts))}`,
  },
  {
    open: ({ docusaurus, pin }) => docusaurus.version !== pin.version,
    text: ({ pin }) => 'Add the site\'s awkward pages to comparePages, so that the bump\'s compare reads them, and '
      + `commit, because a bump needs a clean tree. Move to Docusaurus ${pin.version}: npm run shared:bump`,
  },
  {
    open: (facts) => muiOpen(facts) && differing(facts).length > 0,
    text: () => `After the MUI step, in the site: ${JOIN_AGAIN}  A copy that now matches becomes a stub. `
      + `Any other keeps its code until you write its stub, as ${README} shows.`,
  },
  {
    open: (facts) => !muiOpen(facts) && differing(facts).length > 0,
    text: (facts) => `These copies still differ from ${PREFIX}/, so they keep their code: ${differingNames(facts)}. Write `
      + `each stub by hand: "${JOIN_SECTION}" in ${README} shows them.`,
  },
  {
    open: ({ copies }) => copies.theme.some(({ exists, target }) => exists && target === null),
    text: () => `src/theme/Admonition is the site's own. Move any type of its own into a Types.js as ${README} `
      + `shows. If every type is shared's, delete the folder and run ${JOIN_AGAIN}, which writes the stub.`,
  },
  {
    open: ({ configText }) => !configText.includes(CONFIG_SIGN),
    text: () => `Wire docusaurus.config.js: the block under "Mount it on a site" in ${README}.`,
  },
  {
    open: ({ configText }) => !configText.includes(STYLES_SIGN),
    text: () => 'Move the site\'s own styles to src/css/site.scss, and load shared/css/custom.scss first. Then '
      + 'npm run shared:verify names every old file shared/ now holds, such as static/fonts: delete those.',
  },
  {
    open: ({ publicSite, runsPublicCheck }) => publicSite && !runsPublicCheck,
    text: () => `Add && ${PUBLIC_CHECK_LINE} to the end of the build command in ${NETLIFY_FILE}.`,
  },
  {
    open: ({ publicSite, excluded }) => publicSite && !excluded,
    text: () => 'Keep each tool\'s private folder out of this public repository: run the join again with '
      + '--exclude <path>. It goes to .git/info/exclude, never to .gitignore.',
  },
  {
    open: ({ onPush }) => onPush === ON_PUSH.BUILDS,
    text: () => 'Netlify builds every push: stop builds in the project if deploys come from this Mac.',
  },
  {
    open: ({ hasLeft }) => !hasLeft,
    text: () => 'With the site\'s awkward pages in comparePages, compare against the build you kept: '
      + `npm run shared:compare -- --before ${KEPT_BUILD}`,
  },
]);

/** The open steps as numbered lines. */
export function byHandLines(facts) {
  const steps = STEPS.filter(({ open }) => open(facts));
  return steps.map(({ text }, index) => `  ${index + 1}. ${text(facts)}`);
}
