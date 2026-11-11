/**
 * scripts/lib/allRed.mjs: shared:all's side of the red record in lib/redRecord.mjs. A site's turn takes up the record
 * its last red left, so the site's own pull and bump see none, and at the turn's end it leaves:
 *
 *   after a red that left something to undo   a new record: the step, the sha, the hub commit, the undo, the pin the
 *                                              run published, and every publish line still to paste
 *   after a proof that ran green, or a list    nothing: the next green proof is what clears a red. A pull's proof
 *                                              leaves a bump's red standing, because its version still waits
 *   after anything else                        the old record back, unless the site has moved past that red, and
 *                                              then one line says it is cleared
 *
 * The publish lines a red run printed stay in its record, so a later run, a carry-on above all, prints them again at
 * its end until that site is pushed or moves on.
 *
 * HOW TO CHANGE IT
 *   Which stops leave a record: isRedStop in lib/exitCodes.mjs. What a record holds: recordOf. The line for a
 *   cleared red: clearedLine. When a publish line counts as pasted: stillPending, which takes a commit a remote holds
 *   as pushed.
 */

import { ACTIONS } from './allArgs.mjs';
import { headOf } from './allSite.mjs';
import { hasBuild } from './bumpBuild.mjs';
import { VERIFY_SCRIPT } from './bumpSettings.mjs';
import { isOnRemote } from './checkout.mjs';
import { EXIT, isRedStop } from './exitCodes.mjs';
import { short } from './phrases.mjs';
import {
  KINDS, RECORD_SCRIPTS, STANDINGS, clearedReason, endPhrase, readRecord, removeRecord, runPhrase, standingOf, takeRecord,
  verifyAllLine, writeRecord,
} from './redRecord.mjs';
import { readState } from './state.mjs';

/** True for a run that moves sites, the only kind that leaves a record. */
function rollsOut({ args }) {
  return args.action === ACTIONS.PULL || args.action === ACTIONS.BUMP;
}

/** True for `shared:all -- run shared:verify`: a green turn of it proves a site, and clears a red taken by hand. */
function provesSites({ args }) {
  return args.action === ACTIONS.RUN && args.script === VERIFY_SCRIPT;
}

/**
 * The start of a turn: the sha the site is on, and the record its last red left. A pull or bump turn takes it up
 * (lib/redRecord.mjs): it reads as no record while this run lives, and as the red again if this run is killed before
 * the turn ends. A verify run only reads it.
 */
export function startTurn(run, site) {
  const recorded = headOf(site.root, run.env);
  if (rollsOut(run)) return { recorded, earlier: takeRecord(site.root, run.env) };
  return { recorded, earlier: provesSites(run) ? readRecord(site.root, run.env) : null };
}

/** Puts a record a turn took up back, as when the run stops for something that is not this site's doing. */
export function putBack(run, site, earlier) {
  if (earlier !== null) writeRecord(site.root, earlier, run.env);
}

/** The hub commit the site records now, or null. */
function recordedHub(root, env) {
  return readState(root, { fetch: false, env }).recorded ?? null;
}

/** The record a red turn leaves. The site's own bump may have written one during the turn: its step is the exact one. */
function recordOf(run, site, { recorded, steps, error, publish }) {
  const inner = readRecord(site.root, run.env, { ownOnly: true });
  const plan = run.plans.get(site.name);
  const bumped = plan?.bumps === true;
  return {
    kind: bumped ? KINDS.BUMP : KINDS.PULL,
    script: RECORD_SCRIPTS.ALL,
    site: site.name,
    step: inner?.step ?? error?.step ?? null,
    signal: inner?.signal ?? error?.signal ?? null,
    at: recorded,
    head: headOf(site.root, run.env),
    hub: recordedHub(site.root, run.env),
    moved: plan?.moves ?? false,
    version: bumped ? plan.target : null,
    pin: run.pinPublished ? run.pinMove : null,
    undo: steps,
    publish,
    build: inner?.build ?? error?.build ?? null,
    when: new Date().toISOString(),
  };
}

/** The line that says a site's red is behind it, and that a deploy needs a build first when there is none. */
function clearedLine(site, record, state, env) {
  const noBuild = hasBuild(site.root) ? '' : ' It has no build/: build it before any deploy.';
  const reason = clearedReason(site.root, record, state, env);
  return `${site.name}: ${runPhrase(record)} ${endPhrase(record)} in an earlier run, and that red is cleared: ${reason}.${noBuild}`;
}

/** True when this turn's proof stands for an earlier red: any proof for a pull's red, only a bump's for a bump's. */
function proofCovers(run, site, earlier) {
  if (!run.tested.has(site.name)) return false;
  return earlier.kind === KINDS.PULL || run.plans.get(site.name)?.bumps === true;
}

/**
 * The end of a turn: what it leaves on disk for the next run, and the lines to print. `code` is the turn's exit code,
 * `steps` the undo its stop prints and `publish` the publish lines to keep.
 */
export function endTurn(run, site, { recorded, earlier, code, error, steps, publish }) {
  if (provesSites(run)) return endVerifyTurn(run, site, earlier, code);
  if (!rollsOut(run)) return [];
  if (isRedStop(code) && steps.length > 0) {
    writeRecord(site.root, recordOf(run, site, { recorded, steps, error, publish }), run.env);
    return [];
  }
  if (earlier === null) return [];
  const proved = code === EXIT.OK || code === EXIT.TO_READ;
  if (proved && proofCovers(run, site, earlier)) {
    removeRecord(site.root, run.env);
    return [];
  }
  const state = readState(site.root, { fetch: false, env: run.env });
  if (standingOf(site.root, earlier, { state, env: run.env }) === STANDINGS.SETTLED) {
    removeRecord(site.root, run.env);
    return [clearedLine(site, earlier, state, run.env)];
  }
  putBack(run, site, earlier);
  if (standingOf(site.root, earlier, { state, env: run.env }) === STANDINGS.TAKEN) run.unproven.add(site.name);
  return [];
}

/** The end of a `run shared:verify` turn: a green one clears a red the site took again by hand, and says so. */
function endVerifyTurn(run, site, earlier, code) {
  if (earlier === null || code !== EXIT.OK) return [];
  const state = readState(site.root, { fetch: false, env: run.env });
  if (standingOf(site.root, earlier, { state, env: run.env }) !== STANDINGS.TAKEN) return [];
  removeRecord(site.root, run.env);
  return [`${site.name}: ${runPhrase(earlier)} ${endPhrase(earlier)} in an earlier run, and that red is cleared: it took hub ${short(earlier.hub)} again by hand, and shared:verify passed here.`];
}

/** The line for each site this run left with a red it took again by hand, and the proof that clears it. */
export function unprovenLines(run) {
  return [...run.unproven].map((name) => `${name}: a red there was taken again by hand and is not proven since: ${verifyAllLine(name)}`);
}

/** The publish lines every site's record keeps, read once as a run starts: [{ site, head, line }]. */
export function collectPending({ all, env }) {
  return all.flatMap(({ root }) => readRecord(root, env)?.publish ?? []);
}

/**
 * The kept publish lines that still stand: their site is not among `own`, still sits on the commit that was
 * tested, and has not pushed it. One line per site.
 */
export function stillPending({ all, pending, env }, own) {
  const named = new Set(own.map(({ site }) => site));
  const kept = [];
  for (const entry of pending) {
    const site = all.find(({ name }) => name === entry.site);
    if (site === undefined || named.has(entry.site)) continue;
    if (headOf(site.root, env) !== entry.head || isOnRemote(site.root, entry.head, env)) continue;
    named.add(entry.site);
    kept.push(entry);
  }
  return kept;
}

