/**
 * scripts/lib/allSites.mjs: which sites a run of `shared:all` covers, in which order. They come from
 * lib/siblings.mjs, so the hub never holds a list, and a remote spelled another way still counts as one
 * hub. The site you run it from goes first, and `--only` keeps the order given.
 *
 * A name in `--only` or `--skip` that is no site stops the run: a slip there would run the site it was
 * meant to hold back.
 *
 * HOW TO CHANGE IT
 *   The finding itself: lib/siblings.mjs. What a run says about what it found: foundLines. How a printed
 *   line reaches a site: inSite in lib/phrases.mjs.
 */

import path from 'node:path';
import { SCRIPT, USAGE } from './allArgs.mjs';
import { EXIT, ScriptError } from './exitCodes.mjs';
import { counted, inSite } from './phrases.mjs';
import { REMOTE, remoteUrl } from './settings.mjs';
import { findSiblings } from './siblings.mjs';
import { LEAVE_SCRIPT } from './siteLines.mjs';

/** Stops at a name that is no site, before anything runs. */
function refuseUnknownNames({ only, skip }, all) {
  const known = all.map(({ name }) => name);
  const unknown = [...only, ...skip].filter((name) => !known.includes(name));
  if (unknown.length === 0) return;
  throw new ScriptError(`${SCRIPT}: no site is called ${unknown.join(', ')}. Found: ${known.join(', ')}.\n${USAGE}`, EXIT.USAGE);
}

/** The sites of a run, in order: { home, all, sites, held, found }. `held` names those left out. */
export function chooseSites(root, args, env) {
  const found = findSiblings(root, { env });
  const home = { name: path.basename(root), root };
  const all = [home, ...found.sites];
  refuseUnknownNames(args, all);
  const named = [...new Set(args.only)].map((name) => all.find((site) => site.name === name));
  const listed = named.length > 0 ? named : all;
  const sites = listed.filter(({ name }) => !args.skip.includes(name));
  if (sites.length === 0) throw new ScriptError(`${SCRIPT}: every site is left out, so there is nothing to run.`, EXIT.USAGE);
  const held = all.filter((site) => !sites.includes(site)).map(({ name }) => name);
  return { home, all, sites, held, found };
}

/**
 * A sibling with a real mount, its shared npm lines and no remote: a roll-out would miss it, so it hears about
 * it. A fresh clone looks like this, and so does a site whose remote went by hand, so the line gives both
 * ways on: the remote back, or `shared:leave` to finish leaving. A site that left through `shared:leave` has no
 * shared npm line, and lib/siblings.mjs leaves it out of this list, so no run names it.
 */
export function missedLine({ name }, env, missedBy = 'this run misses it') {
  return `WARNING: ${name} holds ${REMOTE}/ and has no ${REMOTE} remote, so ${missedBy}. ` +
    `Fix, for a fresh clone: ${inSite({ name }, [`git remote add ${REMOTE} ${remoteUrl(env)}`])}. ` +
    `To take ${name} out of the hub instead: ${inSite({ name }, [`npm run ${LEAVE_SCRIPT}`])}.`;
}

/** A sibling with a remote for another hub. */
export function otherHubLine({ name }, leftBy = 'this run leaves it out') {
  return `${name} has a ${REMOTE} remote for another hub, so ${leftBy}.`;
}

/** What the run found, with what it left out and why. */
export function foundLines({ home, all, found }, env) {
  const names = all.map(({ name }) => (name === home.name ? `${name} (here)` : name));
  return [
    `Found ${counted(all.length, 'site')} of this hub: ${names.join(', ')}.`,
    ...found.withoutRemote.map((site) => missedLine(site, env)),
    ...found.otherHub.map((site) => otherHubLine(site)),
  ];
}
