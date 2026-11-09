#!/usr/bin/env node
/**
 * scripts/leave.mjs: `npm run shared:leave`. It takes this site out of the hub and leaves the other sites
 * quiet. Run it in the site that leaves:
 *
 *     npm run shared:leave -- --check     says what a leave would do, and changes nothing
 *     npm run shared:leave                does it, then prints the way back
 *     npm run shared:leave -- --help      the options
 *
 * A leave takes the site's shared npm lines out of package.json in one commit, its own shared:verify and
 * test:shared among them (lib/siteLines.mjs says which), then removes the `shared` remote. shared/ stays as
 * ordinary tracked files, so the site builds and deploys as before and stops taking changes: its stubs and its
 * config still read it. Nothing is pushed.
 *
 * Both go because the other sites find this one from its .git/config and its package.json. A mount with no
 * remote and its shared lines looks like a fresh clone, so every shared:all and shared:push warns about it. A
 * mount with neither is a site that left, and they pass it by without a word (lib/siblings.mjs).
 *
 * The way back is one line, printed at the end: `node shared/scripts/join.mjs && npm run shared:pull`. The join
 * adds the remote and puts the lines back in one commit, shared:verify as it was before the leave. The pull
 * brings what the hub took in meanwhile.
 *
 * `--check` prints one line per fact, as `shared:join --check` does: ok, info (the leave does this), warn (a
 * person does this) and FAIL (this stops a leave). A leave refuses on exactly the FAIL lines: another branch, a
 * worktree, an open merge, a changed tracked file. Each step looks first, so a run that stopped can simply run
 * again, and a site whose remote went by hand finishes its leave here.
 *
 * It exits 0 when done or ready, 3 when `--check` found a FAIL line, 4 when it refused and changed nothing, 5
 * when git failed. See lib/exitCodes.mjs.
 *
 * HOW TO CHANGE IT
 *   Which lines are shared's, the command's name and the commit's subject: lib/siteLines.mjs. A new line of
 *   `--check`: a function here, added to LINES in printing order; a new blocker is a `fail`. A new option:
 *   FLAGS and USAGE. The words of the way back: WAY_BACK.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { currentBranch, findRoot, isMainCheckout, openStep, switchFix } from './lib/checkout.mjs';
import { LEVELS, fail, formatResult, info, ok, warn } from './lib/checks.mjs';
import { EXIT, ScriptError, runScript } from './lib/exitCodes.mjs';
import { git, gitOrThrow, gitValue } from './lib/git.mjs';
import { changedFiles } from './lib/joinFacts.mjs';
import { refuseNpmKeptOptions } from './lib/npmArgs.mjs';
import { capped, counted, short } from './lib/phrases.mjs';
import { refusal } from './lib/preflight.mjs';
import { MANIFEST_FILE, PREFIX, REMOTE, SITE_BRANCH } from './lib/settings.mjs';
import { LEAVE_SCRIPT, LEAVE_SUBJECT, editManifest, isSharedLine, readScripts, sharedLineNames } from './lib/siteLines.mjs';
import { STATES, readState } from './lib/state.mjs';

const CHECK_FLAG = '--check';
const HELP_FLAG = '--help';
const FLAGS = [CHECK_FLAG, HELP_FLAG];
const USAGE = [
  `Usage: npm run ${LEAVE_SCRIPT} [-- ${CHECK_FLAG}]`,
  `  ${CHECK_FLAG}   say what a leave would do, and change nothing`,
  `  ${HELP_FLAG}    this list`,
].join('\n');

/** The one line that brings the site back, run in it. */
const WAY_BACK = 'node shared/scripts/join.mjs && npm run shared:pull';

/** The second paragraph of the leave's commit message. */
const LEAVE_BODY = `The shared npm lines go and the shared remote with them. To come back, in the site: ${WAY_BACK}`;

/** An npm line that runs another line: `npm run <name>`. */
const NPM_RUN = /\bnpm run ([\w:.-]+)/g;

/** The states in which shared/ holds commits the hub lacks. */
const UNPUBLISHED = new Set([STATES.AHEAD, STATES.DIVERGED]);

/** The options as { check, help }, or a usage error for anything else. */
export function parseArgs(argv) {
  const unknown = argv.filter((option) => !FLAGS.includes(option));
  if (unknown.length > 0) throw new ScriptError(`Unknown option ${unknown[0]}.\n${USAGE}`, EXIT.USAGE);
  return { check: argv.includes(CHECK_FLAG), help: argv.includes(HELP_FLAG) };
}

/** The commits shared/ holds that the hub lacks, as last fetched, or none when that cannot be read. */
function unpublished(root, address, env) {
  if (address === null) return [];
  const state = readState(root, { fetch: false, env });
  return UNPUBLISHED.has(state.state) ? state.outgoing ?? [] : [];
}

/** Everything a leave needs to know about the site. Reads, and only reads. */
export function readLeaveFacts(root, env = process.env) {
  const address = gitValue(['remote', 'get-url', REMOTE], { cwd: root, env, read: true });
  const scripts = readScripts(root);
  return {
    root,
    branch: currentBranch(root, env),
    mainCheckout: isMainCheckout(root, env),
    open: openStep(root, env),
    changed: changedFiles({ cwd: root, env, read: true }),
    mounted: fs.existsSync(path.join(root, PREFIX)),
    address,
    scripts,
    lines: scripts === null ? [] : sharedLineNames(scripts),
    outgoing: unpublished(root, address, env),
    switchFix: () => switchFix(root, SITE_BRANCH, env),
  };
}

/** A leave commits, so it runs where pull and push do. */
function placeLines({ branch, mainCheckout, open, switchFix: fixFor }) {
  const lines = [];
  if (open !== null) lines.push(fail('open', `a ${open.kind} is still open`, open.fix));
  if (branch !== SITE_BRANCH) {
    lines.push(fail('branch', `on ${branch ?? 'a detached HEAD'}: a leave commits on ${SITE_BRANCH}`, fixFor()));
  }
  if (!mainCheckout) lines.push(fail('checkout', 'a worktree', 'run this in the main checkout'));
  return lines.length > 0 ? lines : ok('branch', `on ${SITE_BRANCH}, in the main checkout`);
}

/** The leave's commit must hold its own change alone. */
function changesLine({ changed }) {
  if (changed.length === 0) return ok('changes', 'no uncommitted tracked changes');
  const text = `${counted(changed.length, 'changed tracked file')}: the tree must be clean`;
  return fail('changes', text, 'commit or stash them, then run this again', capped(changed));
}

/** shared/ itself stays. */
function mountLine({ mounted }) {
  if (!mounted) return ok('mount', `no ${PREFIX}/ folder here`);
  return info('mount', `${PREFIX}/ stays as ordinary files: the site builds and deploys as before`);
}

/** The `shared` remote goes. */
function remoteLine({ address }) {
  if (address === null) return ok('remote', `no ${REMOTE} remote`);
  return info('remote', `the leave removes the ${REMOTE} remote, ${address}`);
}

/** The shared npm lines go, in one commit. */
function scriptsLine({ scripts, lines }) {
  if (scripts === null) return fail('scripts', `no readable ${MANIFEST_FILE}`, 'run this in a site');
  if (lines.length === 0) return ok('scripts', 'no shared npm line');
  return info('scripts', `${counted(lines.length, 'shared npm line')}: the leave takes them out in one commit`, undefined, lines);
}

/** Lines of the site's own that run a shared line would break once it goes. */
function callersLine({ scripts }) {
  if (scripts === null) return [];
  const callers = Object.entries(scripts).filter(([name]) => !isSharedLine(name)).flatMap(([name, line]) => {
    const called = [...line.matchAll(NPM_RUN)].map((match) => match[1]).filter(isSharedLine);
    return called.length > 0 ? [`${name}: npm run ${called.join(', npm run ')}`] : [];
  });
  if (callers.length === 0) return [];
  return warn('callers', `${counted(callers.length, 'npm line')} of the site's own run a line that goes`, 'edit them after the leave', callers);
}

/** Work in shared/ that never reached the hub stays in this site alone. */
function unpublishedLine({ outgoing }) {
  if (outgoing.length === 0) return [];
  const text = `${PREFIX}/ holds ${counted(outgoing.length, 'commit')} the hub lacks: after the leave they stay here alone`;
  const details = capped(outgoing.map((commit) => `${short(commit.sha)} ${commit.subject}`));
  return warn('unpublished', text, 'npm run shared:push first, if every site should have them', details);
}

/** The lines of `--check`, in printing order. */
const LINES = Object.freeze([placeLines, changesLine, mountLine, remoteLine, scriptsLine, callersLine, unpublishedLine]);

/** Every line for these facts. */
export function leaveResults(facts) {
  return LINES.flatMap((line) => line(facts));
}

/** True when the site has left already: nothing to take out. */
function hasLeft({ address, lines }) {
  return address === null && lines.length === 0;
}

/** The last line of a check. */
export function checkSummary(results, facts) {
  const count = (level) => results.filter((result) => result.level === level).length;
  const tally = `${count(LEVELS.OK)} ok, ${count(LEVELS.INFO)} for the leave, ${count(LEVELS.WARN)} by hand`;
  const blocked = count(LEVELS.FAIL);
  if (blocked > 0) return `${tally}, ${blocked} blocking. ${LEAVE_SCRIPT} refuses until they are fixed`;
  if (hasLeft(facts)) return `${tally}. This site has left the hub: nothing to do`;
  return `${tally}. ${LEAVE_SCRIPT} can run here`;
}

/** Prints what a leave would do. Writes nothing. */
export function runCheck({ root, env, print }) {
  const facts = readLeaveFacts(root, env);
  const results = leaveResults(facts);
  results.flatMap(formatResult).forEach((line) => print(line));
  print(checkSummary(results, facts));
  return results.some(({ level }) => level === LEVELS.FAIL) ? EXIT.CHECKS : EXIT.OK;
}

/** Every blocker as one refusal, with the fix beside each. */
function refuseBlockers(results) {
  const stops = results.filter(({ level }) => level === LEVELS.FAIL);
  if (stops.length === 0) return;
  const details = stops.map(({ text, fix }) => (fix ? `${text} (fix: ${fix})` : text));
  throw refusal(LEAVE_SCRIPT, `${counted(stops.length, 'blocker')}.`, { details });
}

/** Commits package.json alone. A commit that stops puts the file back as HEAD has it, so nothing moved. */
function commitManifest(root, env) {
  const committed = git(['commit', '-q', '-m', LEAVE_SUBJECT, '-m', LEAVE_BODY, '--', MANIFEST_FILE], { cwd: root, env });
  if (committed.ok) return gitOrThrow(['rev-parse', 'HEAD'], { cwd: root, env, read: true });
  git(['checkout', '-q', 'HEAD', '--', MANIFEST_FILE], { cwd: root, env });
  const reason = committed.stderr ? `: ${committed.stderr}` : '';
  throw new ScriptError(`git commit stopped with exit code ${committed.status}${reason}\n${MANIFEST_FILE} is back as it was, and nothing else was changed. Fix what git says and run this again.`, EXIT.GIT);
}

/** Takes the shared lines out of package.json in one commit. Returns its sha, or null when none was left. */
function takeOutLines({ root, lines }, env) {
  if (lines.length === 0) return null;
  editManifest(root, (manifest) => {
    manifest.scripts = Object.fromEntries(Object.entries(manifest.scripts).filter(([name]) => !isSharedLine(name)));
  });
  return commitManifest(root, env);
}

/** Removes the `shared` remote, when there is one. Returns its address, or null. */
function removeRemote({ root, address }, env) {
  if (address === null) return null;
  gitOrThrow(['remote', 'remove', REMOTE], { cwd: root, env });
  return address;
}

/** What the leave did, and the way back. */
function endLines({ root, lines }, sha, address) {
  if (sha === null && address === null) return [`Nothing to do in ${root}: this site has left the hub.`, `The way back, in this site: ${WAY_BACK}`];
  const done = [`Left the hub in ${root}:`];
  if (sha !== null) done.push(`  ${counted(lines.length, 'shared npm line')} taken out of ${MANIFEST_FILE}, in ${short(sha)}`);
  if (address !== null) done.push(`  the ${REMOTE} remote removed, which was ${address}`);
  return [
    ...done,
    `${PREFIX}/ stays as ordinary files, so the site builds and deploys as before. The other sites now pass it by.`,
    'Nothing was pushed: git push sends the commit as usual.',
    `The way back, in this site: ${WAY_BACK}`,
  ];
}

/** Refuses or leaves. Each step looks first, so a run after a stop does what is left. */
export function runLeave({ root, env, print }) {
  const facts = readLeaveFacts(root, env);
  refuseBlockers(leaveResults(facts));
  const sha = takeOutLines(facts, env);
  const address = removeRemote(facts, env);
  endLines(facts, sha, address).forEach((line) => print(line));
  return EXIT.OK;
}

/** The script's entry point. */
function main() {
  refuseNpmKeptOptions({ flags: [CHECK_FLAG], script: LEAVE_SCRIPT, example: `npm run ${LEAVE_SCRIPT} -- ${CHECK_FLAG}` });
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(USAGE);
    return EXIT.OK;
  }
  const job = { root: findRoot(), env: process.env, print: console.log };
  return args.check ? runCheck(job) : runLeave(job);
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await runScript(main);
}
