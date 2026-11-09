/**
 * scripts/lib/allPreflight.mjs: what `shared:all` asks of every site before it touches any. One site that
 * cannot run means nothing runs: a roll-out that stops at its third site for a reason it could have seen
 * has left two sites ahead of the rest for nothing.
 *
 * Every site is asked, so one run names everything in the way, and the refusal prints the ready line that
 * holds those sites back. The questions are the real ones: refusePull is what shared:pull itself refuses
 * on, refuseWrongSite and refuseNoCompare are shared:bump's, and refuseOffManifest is what keeping an old build
 * refuses on. They change nothing but a fetch.
 *
 * A run that moves the pin moves it from the site you ran it from, so that site cannot be held back: a --skip of it
 * would stop at the pin all the same. When it is the one in the way, the refusal names its undo instead, the one a
 * red run there printed, because that is what leaves its package files changed.
 *
 * HOW TO CHANGE IT
 *   A new refusal for a roll-out: a line in refuseRollOut. For `run`: refuseScript.
 */

import fs from 'node:fs';
import path from 'node:path';
import { SCRIPT, SERVER_LINE, rerunLine, scopeWithout } from './allArgs.mjs';
import { undoSteps } from './allReport.mjs';
import { headOf, planSite, siteJob } from './allSite.mjs';
import { readManifest } from './bumpLock.mjs';
import { EXIT, ScriptError } from './exitCodes.mjs';
import { counted, inSite } from './phrases.mjs';
import { hubPin } from './pin.mjs';
import { NOTHING_CHANGED, refusal } from './preflight.mjs';
import { PREFIX } from './settings.mjs';
import { refuseNoCompare, refuseOffManifest } from './siteGate.mjs';
import { refuseWrongSite } from '../bump.mjs';
import { refusePull } from '../pull.mjs';

const OWN_PULL = path.join(PREFIX, 'scripts', 'pull.mjs');

/** What a site's refusal says, without the line every refusal ends with. */
function reasonOf(error) {
  return error.message.split('\n').filter((line) => line !== NOTHING_CHANGED);
}

/** True when this run moves the pin, which it does from the site you ran it from. */
function movesPin({ args, bumping, home, env }) {
  if (!bumping || args.version === undefined || args.noPin) return false;
  return hubPin(home.root, env).version !== args.version;
}

/** The last line when the site the pin moves from is in the way: its undo, when a red run's leftovers are there. */
function homeLine({ home, env }) {
  const start = `The pin moves from ${home.name}, so the run cannot go on without it.`;
  const steps = undoSteps(home.root, headOf(home.root, env), env);
  if (steps.length === 0) return `${start} Fix it and run this again.`;
  return `${start} If a red run left these changes, run the undo it printed, then this again: ${inSite(home, steps)}`;
}

/** The run's refusal: every site in the way, and the line that goes on without them. */
function blockedError(run, blocks) {
  const { args, sites, home } = run;
  const names = blocks.map(({ site }) => site.name);
  const lines = [
    `${SCRIPT} refused: ${counted(blocks.length, 'site')} of ${sites.length} cannot run.`,
    ...blocks.flatMap(({ site, reason }) => [`${site.name}:`, ...reason.map((line) => `  ${line}`)]),
    'Nothing was changed in any site.',
  ];
  if (names.includes(home.name) && movesPin(run)) {
    lines.push(homeLine(run));
  } else if (names.length < sites.length) {
    const scope = scopeWithout(args, sites.map(({ name }) => name), names);
    lines.push(`Fix it and run this again, or go on without it: ${rerunLine(args, scope)}`);
  }
  return new ScriptError(lines.join('\n'), EXIT.REFUSED);
}

/** Asks `check` of every site, and throws the run's refusal when any refuses. */
async function askEverySite(run, check) {
  const blocks = [];
  for (const site of run.sites) {
    try {
      await check(run, site);
    } catch (error) {
      if (!(error instanceof ScriptError)) throw error;
      blocks.push({ site, reason: reasonOf(error) });
    }
  }
  if (blocks.length > 0) throw blockedError(run, blocks);
}

/** The folder of a run stays out of every site, and a folder a run has used stays as it is. */
function refuseKeep(job) {
  const { root, keep, before } = job;
  if (keep === root || keep.startsWith(`${root}${path.sep}`)) {
    throw refusal(SCRIPT, `--keep names ${keep}, which is inside this site.`, { fix: 'name a folder outside every site' });
  }
  if (fs.existsSync(before)) throw refusal(SCRIPT, `${before} exists.`, { fix: 'name a new folder with --keep' });
}

/** Everything that would stop this site's turn. */
async function refuseRollOut(run, site) {
  const { root } = site;
  if (!fs.existsSync(path.join(root, OWN_PULL))) {
    throw refusal(SCRIPT, `there is no ${OWN_PULL}.`, { fix: 'mount the hub, or leave this site out' });
  }
  const state = refusePull({ root, noWordList: run.args.noWordList, env: run.env });
  if (run.bumping) refuseWrongSite(root);
  const plan = planSite(run, site, state);
  if (!plan.gate) return;
  const job = siteJob(run, site);
  refuseKeep(job);
  refuseOffManifest(job);
  await refuseNoCompare(job);
}

/** Asks every site, then notes where each one stands, so the end can say which of them moved. */
export async function preflightRollOut(run) {
  await askEverySite(run, refuseRollOut);
  for (const site of new Set([run.home, ...run.sites])) run.heads.set(site.name, headOf(site.root, run.env));
}

/** A script to run must exist, and must end by itself. */
function refuseScript({ args }, { root }) {
  const { scripts = {} } = readManifest(root);
  const line = scripts[args.script];
  if (line === undefined) throw refusal(SCRIPT, `package.json has no ${args.script} line.`);
  if (SERVER_LINE.test(line)) throw refusal(SCRIPT, `${args.script} serves until stopped, and a run waits for each script to end.`);
}

/** Asks every site about the script. */
export function preflightScript(run) {
  return askEverySite(run, refuseScript);
}
