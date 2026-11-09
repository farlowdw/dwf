/**
 * scripts/lib/joinChecks.mjs: the lines of `shared:join --check`, one function per line, each reading the
 * facts of lib/joinFacts.mjs. A result has the shape of a status line (lib/checks.mjs) and prints the same
 * way. The levels mean:
 *
 *     ok     nothing to do
 *     info   the join does this itself
 *     warn   a person does this, by hand, and the join can still run
 *     FAIL   this stops a join: the line gives the reason and the fix
 *
 * A join refuses on exactly these FAIL lines, so what `--check` says is what a join does.
 *
 * HOW TO CHANGE IT
 *   A new line: a function here, added to LINES in the order it should print. A new blocker: a `fail`. What
 *   comes after the blockers needs only a readable package.json, or it goes in REPOSITORY_LINES.
 */

import { LEVELS, fail, info, ok, subtreeCheck, warn } from './checks.mjs';
import {
  CORE_PACKAGE, DEPLOY_LINE, DOTENV_PACKAGE, ENV_FILE, FIRST_JOINABLE_MAJOR, IGNORE_FILE, MUI_PACKAGE, PUBLIC_CHECK_LINE,
  SCRIPT,
} from './joinSettings.mjs';
import { MOUNT, REMOTE_STATE } from './joinFacts.mjs';
import { ON_PUSH } from './joinNetlify.mjs';
import { applyLine } from './joinPatch.mjs';
import { COPY } from './joinStubs.mjs';
import { capped, counted } from './phrases.mjs';
import { MANIFEST_FILE, NETLIFY_FILE, NVMRC_FILE, PREFIX, REMOTE, SITE_BRANCH } from './settings.mjs';

/** Where a person reads the rest. */
const JOIN_SECTION = `"Join an existing site" in ${PREFIX}/README.md`;

/** The folder is a Docusaurus site. */
function siteLine({ missing, manifest, isSite }) {
  if (missing) return fail('site', 'no such folder', 'check the path');
  if (manifest === null) return fail('site', `no readable ${MANIFEST_FILE}`, 'run this on a Docusaurus site');
  if (!isSite) return fail('site', `${MANIFEST_FILE} lists no ${CORE_PACKAGE}`, 'run this on a Docusaurus site');
  return ok('site', 'a Docusaurus site');
}

/** The folder is a repository with a commit. */
function repoLine({ repository }) {
  if (repository.outerRepo) {
    return fail('repo', `inside the repository at ${repository.outerRepo}`, 'give the site a repository of its own');
  }
  if (!repository.isRepo) {
    return fail('repo', 'not a git repository', 'git init, read what git status lists, then make a first commit');
  }
  if (!repository.hasCommit) return fail('repo', 'a repository with no commit', 'make a first commit');
  return ok('repo', 'a git repository');
}

/** Pull and push run on one branch, in the main checkout, so a join does too. */
function branchLine({ repository: { branch, mainCheckout, openMerge } }) {
  const lines = [];
  if (branch !== SITE_BRANCH) {
    const text = `on ${branch ?? 'a detached HEAD'}: pull and push run on ${SITE_BRANCH}`;
    lines.push(fail('branch', text, `git switch ${SITE_BRANCH}, or rename the branch`));
  }
  if (!mainCheckout) lines.push(fail('checkout', 'a worktree', 'run this in the main checkout'));
  if (openMerge) lines.push(fail('merge', 'a merge is still open', 'finish it, or git merge --abort'));
  return lines.length > 0 ? lines : ok('branch', `on ${SITE_BRANCH}, in the main checkout`);
}

/** A join commits, so tracked changes wait. */
function changesLine({ repository: { changed } }) {
  if (changed.length === 0) return ok('changes', 'no uncommitted tracked changes');
  const text = `${counted(changed.length, 'changed tracked file')}: the tree must be clean`;
  return fail('changes', text, 'commit or stash them, then run this again', capped(changed));
}

/** Docusaurus against the pin. Below the first joinable major a site migrates first. */
function docusaurusLine({ docusaurus: { version, major }, pin }) {
  if (version === null) return fail('docusaurus', `no version of ${CORE_PACKAGE} to read`, 'npm install, then commit the lock');
  if (major === null || major < FIRST_JOINABLE_MAJOR) {
    const fix = `migrate to Docusaurus ${FIRST_JOINABLE_MAJOR} first, see ${JOIN_SECTION}`;
    return fail('docusaurus', `${version}: below ${FIRST_JOINABLE_MAJOR}.x`, fix);
  }
  if (version === pin.version) return ok('docusaurus', `${version}, the pin`);
  return warn('docusaurus', `${version}, the pin is ${pin.version}`, 'after the join: npm run shared:bump');
}

/** The ignore file: tracked, listing .env, and free of the old lines. */
function ignoreLine({ ignore: { text, tracked, listsEnv, plan } }) {
  if (text === null) return info('gitignore', `no ${IGNORE_FILE}: the join writes one`);
  if (tracked && plan.changes.length === 0) return ok('gitignore', `${IGNORE_FILE} is tracked and lists ${ENV_FILE}`);
  const held = listsEnv ? 'lists' : 'does not list';
  const state = `${IGNORE_FILE} is ${tracked ? 'tracked' : 'not tracked'} and ${held} ${ENV_FILE}`;
  return info('gitignore', `${state}: the join fixes it`, undefined, plan.changes);
}

/** A tracked .env is in git's history already. */
function envLine({ envTracked }) {
  if (!envTracked) return [];
  return warn('env', `${ENV_FILE} is tracked`, `git rm --cached ${ENV_FILE}, then replace what it held`);
}

/** The deploy line goes through Netlify. */
function deployScriptLine({ deploy: { line, state } }) {
  if (state === 'ok') return ok('deploy', `deploys through Netlify: ${line}`);
  if (state === 'replace') return info('deploy', `no Netlify deploy script: the join sets ${DEPLOY_LINE}`);
  return warn('deploy', `deploy reads ${line}`, `change it to ${DEPLOY_LINE}`);
}

/** netlify.toml: tracked, or absent. One on disk and out of git may hold a secret, so a person reads it. */
function netlifyLine({ netlify: { onDisk, tracked } }) {
  if (!onDisk) return info('netlify', `no ${NETLIFY_FILE}: the join writes the template's`);
  if (tracked) return ok('netlify', `${NETLIFY_FILE} is tracked`);
  return warn('netlify', `${NETLIFY_FILE} is here and out of git`, 'read it for secrets, then track it');
}

/** .nvmrc says which Node the site tests on. */
function nvmrcLine({ hasNvmrc }) {
  return hasNvmrc ? ok('node', `${NVMRC_FILE} is here`) : info('node', `no ${NVMRC_FILE}: the join writes the template's`);
}

/** MUI against the template. A join never touches it. */
function muiLine({ mui }) {
  if (mui === null || mui.found === null) return info('mui', `no ${MUI_PACKAGE} to read`);
  const text = `${MUI_PACKAGE} ${mui.found}`;
  return mui.outside ? warn('mui', `${text} is outside the template's ${mui.range}`, 'by hand, after the join') : ok('mui', text);
}

/** MUI X packages at the old major stop the install of the new one, so a person clears them first. */
function muiXLine({ mui, muiX }) {
  if (!mui?.outside || muiX.length === 0) return [];
  const text = `${counted(muiX.length, 'MUI X package')} would stop the MUI install`;
  return warn('mui-x', text, 'by hand, before the MUI step', muiX);
}

/** How much of the patch fits, and the line that applies it. */
function patchLine({ patch }) {
  if (patch === null) return [];
  const files = counted(patch.fitting.length + patch.leftOut.length, 'file');
  if (patch.fitting.length === 0) return ok('mui-patch', `none of its ${files} fit here`);
  return warn('mui-patch', `${patch.fitting.length} of ${files} fit`, applyLine(patch.leftOut));
}

/** docusaurus2-dotenv crashes an Rspack build. */
function dotenvLine({ hasDotenv }) {
  if (!hasDotenv) return ok('dotenv', `no ${DOTENV_PACKAGE}`);
  return warn('dotenv', `${DOTENV_PACKAGE} is listed`, 'by hand: take it out of package.json and the config');
}

/** The mount. */
function mountLine({ mount }) {
  if (mount === MOUNT.MOUNTED) return ok('mount', `${PREFIX}/ is mounted`);
  if (mount === MOUNT.NONE) return info('mount', `no ${PREFIX}/: the join adds it`);
  return fail('mount', `a ${PREFIX}/ folder that git subtree did not add`, 'rename it, then run this again');
}

/** The `shared` remote. */
function remoteLine({ remote, hub }) {
  if (remote.state === REMOTE_STATE.SAME) return ok('remote', `${REMOTE} is ${remote.address}`);
  if (remote.state === REMOTE_STATE.NONE) return info('remote', `no ${REMOTE} remote: the join adds ${hub}`);
  return fail('remote', `${REMOTE} is ${remote.address}, not ${hub}`, `git remote set-url ${REMOTE} ${hub}`);
}

/** The admonition stub: the silent failure, when it is missing. */
function admonitionLine({ copies: { theme } }) {
  return theme.map(({ row, exists, target }) => {
    if (target !== null) return ok('admonition', `${row.stub} points at ${PREFIX}/`);
    if (!exists) return info('admonition', `no ${row.stub}: the join writes the stub`);
    return warn('admonition', `${row.stub} is a local copy`, `by hand, see ${JOIN_SECTION}`);
  });
}

/** One copy that differs, as a detail line. */
function differLine({ row, files }) {
  return `${row.name}: ${files.join(', ')}`;
}

/** Copies of shared components. */
function stubsLine({ copies: { components }, mui }) {
  const same = components.filter(({ state }) => state === COPY.SAME);
  const differing = components.filter(({ state }) => state === COPY.DIFFERS);
  const lines = [];
  if (same.length > 0) {
    const names = same.map(({ row }) => row.name);
    lines.push(info('stubs', `${counted(same.length, 'copied folder')} of shared code: the join stubs them`, undefined, names));
  }
  if (differing.length > 0) {
    const text = `${counted(differing.length, 'copied folder')} unlike ${PREFIX}/: they stay`;
    const fix = mui?.outside ? 'after the MUI step, run the join again' : 'compare them, then write the stub by hand';
    lines.push(warn('stubs', text, fix, differing.map(differLine)));
  }
  return lines.length > 0 ? lines : ok('stubs', 'no copies of shared components');
}

/** The npm lines. */
function scriptsLine({ lines: { missing, differing } }) {
  const results = [];
  if (missing.length > 0) results.push(info('scripts', `${counted(missing.length, 'npm line')} to add: the join adds them`));
  if (differing.length > 0) {
    const text = `${counted(differing.length, 'npm line')} in another form: they stay`;
    results.push(warn('scripts', text, 'match the README', differing));
  }
  return results.length > 0 ? results : ok('scripts', 'every npm line is here');
}

/** The pages shared:compare reads. */
function pagesLine({ hasPages }) {
  return hasPages ? ok('pages', 'comparePages is set') : info('pages', 'no comparePages: the join writes the default');
}

/** Whether Netlify builds this site on a push. */
function onPushLine({ onPush }) {
  if (onPush === ON_PUSH.UNLINKED) return ok('on-push', 'not linked to a Netlify project');
  if (onPush === ON_PUSH.SKIPPED) return ok('on-push', 'linked to a Netlify project, not read (--offline)');
  if (onPush === ON_PUSH.UNKNOWN) return ok('on-push', 'linked to a Netlify project, and the CLI could not say more');
  if (onPush === ON_PUSH.STOPPED) return ok('on-push', 'linked to a Netlify project, builds stopped');
  return warn('on-push', 'Netlify builds every push', 'stop builds in the project if deploys come from this Mac');
}

/** A public site's build ends with the public check. */
function publicLine({ publicSite, runsPublicCheck, netlify }) {
  if (!publicSite) return [];
  if (runsPublicCheck) return ok('public', `the build runs ${PUBLIC_CHECK_LINE}`);
  if (!netlify.onDisk) return info('public', 'the join writes the public check into the build command');
  return warn('public', 'the build command lacks the public check', `add && ${PUBLIC_CHECK_LINE} to its end`);
}

/** The lines that need a repository. */
const REPOSITORY_LINES = Object.freeze([branchLine, changesLine]);

/** The lines every readable site gets, in printing order. */
const LINES = Object.freeze([
  docusaurusLine, ignoreLine, envLine, deployScriptLine, netlifyLine, nvmrcLine, muiLine, muiXLine, patchLine, dotenvLine,
  mountLine, remoteLine, admonitionLine, stubsLine, scriptsLine, pagesLine, onPushLine, publicLine,
]);

/** Every line for these facts. A folder that is no readable site stops at its first line. */
export function checkResults(facts, env = process.env) {
  const first = siteLine(facts);
  if (first.level === LEVELS.FAIL) return [first];
  const repo = repoLine(facts);
  const usable = repo.level !== LEVELS.FAIL;
  const inRepo = usable ? REPOSITORY_LINES.flatMap((line) => line(facts)) : [];
  const subtree = subtreeCheck({ root: facts.sharedRoot, env });
  return [first, subtree, repo, ...inRepo, ...LINES.flatMap((line) => line(facts))];
}

/** The FAIL lines: what stops a join. */
export function blockers(results) {
  return results.filter(({ level }) => level === LEVELS.FAIL);
}

/** The last line of a check. */
export function checkSummary(results) {
  const count = (level) => results.filter((result) => result.level === level).length;
  const blocked = count(LEVELS.FAIL);
  const tally = `${count(LEVELS.OK)} ok, ${count(LEVELS.INFO)} for the join, ${count(LEVELS.WARN)} by hand`;
  if (blocked === 0) return `${tally}. ${SCRIPT} can run here`;
  return `${tally}, ${blocked} blocking. ${SCRIPT} refuses until they are fixed`;
}
