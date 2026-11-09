/**
 * scripts/lib/allStatus.mjs: `shared:all -- status`. One row per site, from the same checks as
 * `shared:status`, then every failed line with its fix, then the next command. It changes what status
 * changes: a fetch and git's index.
 *
 * The state comes from lib/state.mjs, which reads `git-subtree-split` with no path limit. A log limited to
 * shared/ misses the squash commit, and "behind" came back empty when a first version did that.
 *
 * npm is asked about the newest Docusaurus once, from the site you ran it from: the answer is the same in
 * every site, and each question takes a moment. One odd sibling must not stop the rest, so a site that
 * cannot be read gets a row of its own that says so.
 *
 * A red that still stands at a site (lib/redRecord.mjs) prints its `red` line under that site, and then the Next lines
 * are that red's alone: its undo while the site holds it, then the way on, never a plain pull that brings it back.
 * A red pull waits for a fix forward from a site in sync with the hub; a red bump for its own fix, or the pin put back.
 *
 * HOW TO CHANGE IT
 *   A new column: a width in COLUMNS and a value in rowCells. The words for a state: hubText. A red's Next line:
 *   redNext.
 */

import { ACTIONS, actionLine } from './allArgs.mjs';
import { dirtyPaths } from './checkout.mjs';
import { CHECKS, LEVELS, formatResult, makeContext, newestCheck, runChecks } from './checks.mjs';
import { EXIT } from './exitCodes.mjs';
import { counted, inSite, short } from './phrases.mjs';
import { lockedVersions } from './pin.mjs';
import {
  KINDS, PUSH_FIX_LINE, RECORD_SCRIPTS, STANDINGS, bumpAgainLine, pinBackOf, pullBringsItBack, undoLine,
} from './redRecord.mjs';
import { STATES } from './state.mjs';
import { PULLABLE } from '../pull.mjs';
import { summary } from '../status.mjs';

/** The checks of one site. The question to npm is asked once per run, so it stands apart. */
const SITE_CHECKS = CHECKS.filter((check) => check !== newestCheck);

const PIN_LABEL = 'pin';
const RED_LABEL = 'red';
const NO_VERSION = '-';

/** The columns: a title and a width each. The last one takes what it needs. */
const COLUMNS = Object.freeze([['site', 18], ['hub', 30], ['changed', 9], ['docusaurus', 12], ['checks', 0]]);

/** What the row says about the hub. */
function hubText(state) {
  const sha = state.upstream ? short(state.upstream) : '';
  const reach = state.fetched === false ? ', hub out of reach' : '';
  const words = {
    [STATES.IN_SYNC]: `in sync at ${sha}`,
    [STATES.BEHIND]: `behind by ${counted(state.behind ?? 0, 'commit')}`,
    [STATES.AHEAD]: `ahead by ${counted(state.ahead ?? 0, 'commit')}`,
    [STATES.DIVERGED]: `diverged, ${state.ahead} ahead, ${state.behind} behind`,
    [STATES.UNREADABLE]: `unreadable: ${state.reason}`,
  };
  return `${words[state.state] ?? state.state}${reach}`;
}

/** Every Docusaurus version the site's lock holds. */
function versionsText(root) {
  const versions = lockedVersions(root);
  return versions === null ? NO_VERSION : [...versions.keys()].join(', ') || NO_VERSION;
}

/** One site read: { site, cells, results, state, red }. `red` is its red record and where it stands, or null. */
function readSite(site, { env, offline }) {
  const context = makeContext({ root: site.root, env, offline });
  const results = runChecks(context, SITE_CHECKS);
  const state = context.state();
  const changed = String(dirtyPaths(site.root, env).length);
  const cells = [site.name, hubText(state), changed, versionsText(site.root), summary(results)];
  return { site, results, state, red: context.red(), cells };
}

/** The row of a site that could not be read. Its one failed line is what was wrong. */
function unreadSite(site, error) {
  const [text] = error.message.split('\n');
  const results = [{ level: LEVELS.FAIL, label: 'site', text }];
  const cells = [site.name, 'could not be read', NO_VERSION, NO_VERSION, summary(results)];
  return { site, results, state: { state: STATES.UNREADABLE }, red: null, cells };
}

/** Reads one site, whatever it holds. */
function rowOf(site, options) {
  try {
    return readSite(site, options);
  } catch (error) {
    return unreadSite(site, error);
  }
}

/** One table line. */
function tableLine(cells) {
  const padded = cells.map((cell, index) => cell.padEnd(Math.max(COLUMNS[index][1], cell.length + 1)));
  return padded.join('').trimEnd();
}

/** The failed lines of each site, with their fixes, and its red line whatever its level. */
function failedLines(rows) {
  return rows.flatMap(({ site, results }) => {
    const failed = results.filter(({ level, label }) => level === LEVELS.FAIL || label === RED_LABEL);
    return failed.length === 0 ? [] : [`${site.name}:`, ...failed.flatMap(formatResult).map((line) => `  ${line}`)];
  });
}

/** True when a site's red decides what comes next: it holds it, or a pull would bring it back. */
function redBlocks({ red, state }) {
  return red !== null && (red.standing === STANDINGS.HOLDS || pullBringsItBack(red, state));
}

/** A site in sync with the hub that holds no red, to publish a fix or move the pin from. Null when there is none. */
function syncedSite(rows) {
  const free = ({ state, red }) => state.state === STATES.IN_SYNC && (red === null || red.standing !== STANDINGS.HOLDS);
  return rows.find(free)?.site ?? null;
}

/** A line to run in a site in sync with the hub, or the words that say where when none is. */
function inSyncedSite(rows, line) {
  const site = syncedSite(rows);
  return site === null ? `${line}, in a site in sync with the hub` : inSite(site, [line]);
}

/** The bump that moves a site on once its red is fixed: shared:all's over this run's sites, or the site's own. */
function bumpAgain(site, record, args) {
  if (record.script === RECORD_SCRIPTS.BUMP) return inSite(site, [bumpAgainLine(record)]);
  return actionLine(ACTIONS.BUMP, args);
}

/** The Next line of one site's red: its undo while the site holds it, then the way on. */
function redNext(row, rows, args) {
  const { site, red } = row;
  const { record } = red;
  if (red.standing === STANDINGS.HOLDS) return undoLine(record);
  if (record.kind === KINDS.PULL) return `fix it forward: ${inSyncedSite(rows, PUSH_FIX_LINE)}, then ${actionLine(ACTIONS.PULL, args)}`;
  const again = `fix the red in ${site.name} and commit it there, then ${bumpAgain(site, record, args)}`;
  const back = pinBackOf(site.root, record);
  return back === null ? again : `put the pin back: ${inSyncedSite(rows, back)}; or ${again}`;
}

/** The commands the rows point at. A red that decides what comes next is all they say. */
function nextLines(rows, args) {
  const reds = rows.filter(redBlocks);
  if (reds.length > 0) return reds.map((row) => `Next: ${redNext(row, rows, args)}`);
  const behind = rows.some(({ state }) => PULLABLE.has(state.state));
  const offPin = rows.some(({ results }) => results.some(({ level, label }) => level === LEVELS.FAIL && label === PIN_LABEL));
  return [
    ...(behind ? [`Next: ${actionLine(ACTIONS.PULL, args)}`] : []),
    ...(offPin ? [`Next: ${actionLine(ACTIONS.BUMP, args)}`] : []),
  ];
}

/** The one question to npm, as a line. */
function newestLines({ home, env, args }) {
  const context = makeContext({ root: home.root, env, offline: args.offline === true });
  return runChecks(context, [newestCheck]).flatMap(formatResult);
}

/** The sites that read FAIL with nothing fetched: [{ name, failed }], `failed` being their failed lines. */
export function sitesReadingFail(sites, env) {
  const rows = sites.map((site) => rowOf(site, { env, offline: true }));
  const read = rows.map(({ site, results }) => ({ name: site.name, failed: results.filter(({ level }) => level === LEVELS.FAIL) }));
  return read.filter(({ failed }) => failed.length > 0);
}

/** Prints the table and returns the exit code: 3 when a line of any site failed. */
export function statusOfSites(run) {
  const { sites, args, env, print } = run;
  const options = { env, offline: args.offline === true };
  const rows = sites.map((site) => rowOf(site, options));
  const title = tableLine(COLUMNS.map(([name]) => name));
  [title, ...rows.map(({ cells }) => tableLine(cells))].forEach((line) => print(line));
  [...failedLines(rows), ...newestLines(run), ...nextLines(rows, args)].forEach((line) => print(line));
  return rows.some(({ results }) => results.some(({ level }) => level === LEVELS.FAIL)) ? EXIT.CHECKS : EXIT.OK;
}
