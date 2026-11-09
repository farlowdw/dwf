/**
 * scripts/lib/allReport.mjs: how a `shared:all` run ends. A stop says where the site was, the exact undo, which
 * sites were left alone and the ready line for the rest. Every end says what to paste to publish what was
 * tested, and which sites this run left out. Nothing here pushes or deploys.
 *
 * The undo is read from the disk, not from the exit code that got here, so it says what is really there: an
 * open merge, the two package files, a commit to go back from. A reset goes with `--keep`, which refuses
 * rather than lose a change. The index is refreshed first, as in every printed reset, because a stale one
 * stops a reset with nothing to reset.
 *
 * The install in an undo comes from lib/bumpUndo.mjs, because a commit that holds a by-hand override stops a
 * plain `npm ci`.
 *
 * Each publish line is one chain of `&&`, because fish runs on after a failed line. A tested site gets the line
 * that sends the build the suites and the compare read. A site whose pull touched only the template was
 * not built, so it gets `git push` and nothing that could send an older build. The lines a red run printed stay in
 * that site's red record (lib/allRed.mjs), and every later run prints them again until each is pasted, so a
 * carry-on run that leaves the site they came from out still names them.
 *
 * A green end can still leave a site that shared:status fails: a step below requirements.cjs, or a rehearsal off
 * the pin, is meant to. One line says which, and the way back. The exit code stays 0.
 *
 * HOW TO CHANGE IT
 *   The wording is here, apart from the pin-back line, which shared:status names too: pinBackLine in lib/pin.mjs.
 *   What a publish line holds: lib/deployLine.mjs. What a stop leaves: undoSteps, which a refusal reads as well.
 *   Which kept lines still stand: stillPending in lib/allRed.mjs.
 */

import { ACTIONS, actionLine, rerunLine } from './allArgs.mjs';
import { stillPending } from './allRed.mjs';
import { headOf } from './allSite.mjs';
import { sitesReadingFail } from './allStatus.mjs';
import { CHANGED_FILES } from './bumpSettings.mjs';
import { CHECKOUT_LINE, installSteps } from './bumpUndo.mjs';
import { dirtyPaths } from './checkout.mjs';
import { deployLine } from './deployLine.mjs';
import { EXIT } from './exitCodes.mjs';
import { git, gitValue } from './git.mjs';
import { inSite, short } from './phrases.mjs';
import { pinBackLine } from './pin.mjs';

const REFRESH_LINE = 'git update-index -q --refresh';
const ABORT_LINE = 'git merge --abort';
const PUSH_LINE = 'git push';

/** The word a failed status line's fix holds when a bump is what clears it. */
const BUMP_FIX = 'shared:bump';

/** True while a merge is open here. */
function mergeIsOpen(root, env) {
  return gitValue(['rev-parse', '--verify', '--quiet', 'MERGE_HEAD'], { cwd: root, env, read: true }) !== null;
}

/** True when the package files differ between two commits. */
function packagesMoved(root, from, to, env) {
  const args = ['diff', '--quiet', from, to, '--', ...CHANGED_FILES];
  return !git(args, { cwd: root, env, read: true }).ok;
}

/** The lines that take a site back to `recorded`, in order. Empty when it never left. */
export function undoSteps(root, recorded, env) {
  const open = mergeIsOpen(root, env);
  const changed = dirtyPaths(root, env).filter((file) => CHANGED_FILES.includes(file));
  const head = headOf(root, env);
  const moved = head !== recorded;
  const needsInstall = changed.length > 0 || (moved && packagesMoved(root, recorded, head, env));
  return [
    ...(open ? [ABORT_LINE] : []),
    ...(changed.length > 0 ? [CHECKOUT_LINE] : []),
    ...(moved ? [REFRESH_LINE, `git reset --keep ${short(recorded)}`] : []),
    ...(needsInstall ? installSteps(root, recorded, env) : []),
  ];
}

/** True when this site holds commits it did not hold when the run began. */
function hasMoved({ heads, env }, { name, root }) {
  return heads.has(name) && heads.get(name) !== headOf(root, env);
}

/**
 * The publish lines of this run, as { site, head, line }: the finished sites, and the site that moved the pin from
 * outside the run.
 */
function ownEntries(run) {
  const { finished, tested, home, sites, env } = run;
  const covered = sites.includes(home) ? finished : [...new Set([home, ...finished])];
  return covered.filter((site) => hasMoved(run, site)).map((site) => {
    const line = tested.has(site.name) ? deployLine(site.root) : PUSH_LINE;
    return { site: site.name, head: headOf(site.root, env), line };
  });
}

/** Every publish line to print and keep: this run's, then those an earlier red run printed that still stand. */
export function publishEntries(run) {
  const own = ownEntries(run);
  return [...own, ...stillPending(run, own)];
}

/** The publish lines, as printed. */
function publishLines(run) {
  const lines = publishEntries(run).map(({ site, line }) => `  ${inSite({ name: site }, [line])}`);
  return lines.length === 0 ? [] : ['To publish what was tested, one line per site:', ...lines];
}

/** What a run leaves for the reader, red or green. */
function closingLines(run) {
  const held = run.held.length === 0 ? [] : [`Left out of this run: ${run.held.join(', ')}.`];
  return [...publishLines(run), ...held];
}

/** The command after a green run that left a site failing. A pin this run moved needs naming to go back. */
function wayBack({ args, pinMove }, failing) {
  const fixes = failing.flatMap(({ failed }) => failed.map(({ fix }) => fix ?? ''));
  if (!fixes.some((fix) => fix.includes(BUMP_FIX))) return `Read why: ${actionLine(ACTIONS.STATUS, args)}`;
  return `The way back: ${actionLine(pinMove === null ? ACTIONS.BUMP : `${ACTIONS.BUMP} ${pinMove.from}`, args)}`;
}

/** One line for the sites this run left green and shared:status fails. A `run` changes no site, so it asks nothing. */
function statusLines(run) {
  const { args, finished, env } = run;
  if (args.action === ACTIONS.RUN) return [];
  const failing = sitesReadingFail(finished, env);
  if (failing.length === 0) return [];
  const named = failing.map(({ name, failed }) => `${name} (${failed.map(({ label }) => label).join(', ')})`);
  return [`shared:status reads FAIL on ${named.join(', ')}. ${wayBack(run, failing)}`];
}

/** The end of a green run. */
export function endLines(run) {
  const names = run.sites.map(({ name }) => name).join(', ');
  return [`Green: ${names}. Nothing was pushed or deployed.`, ...statusLines(run), ...closingLines(run)];
}

/** The lines that say where a stopped site stands. */
function standingLines(site, recorded, steps, code) {
  const undo = steps.length === 0 ? `Nothing to undo in ${site.name}.` : `Undo: ${inSite(site, steps)}`;
  if (code === EXIT.TO_READ) return [`${site.name} has a list to read, above. It was at ${short(recorded)}.`, undo];
  return [`Stopped at ${site.name}, which was at ${short(recorded)}.`, undo];
}

/** After a stop, a pin this run published is on the hub for every site: the line that puts it back. */
function pinBackLines({ pinMove, pinPublished }) {
  if (!pinPublished || pinMove === null) return [];
  return [`The hub holds the pin at ${pinMove.to} now, and every site that pulls takes it. If it should not stay: ${pinBackLine(pinMove.from)}`];
}

/** The end of a run that stopped at `site`. `steps` are what undoSteps read there. */
export function stopLines(run, site, recorded, code, steps) {
  const names = run.sites.map(({ name }) => name);
  const rest = names.slice(names.indexOf(site.name) + 1);
  const label = code === EXIT.TO_READ ? 'When the list reads fine' : `To carry on without ${site.name}`;
  return [
    ...standingLines(site, recorded, steps, code),
    `Not touched: ${rest.join(', ') || 'none'}.`,
    ...(rest.length === 0 ? [] : [`${label}: ${rerunLine(run.args, { only: rest })}`]),
    ...pinBackLines(run),
    ...closingLines(run),
  ];
}
