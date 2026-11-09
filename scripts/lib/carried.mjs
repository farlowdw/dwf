/**
 * scripts/lib/carried.mjs: what shared:status, shared:push and shared:pull say when a split would carry
 * this site's own commits. It takes a commit without shared/ to get there: `git rm -r shared`, or a
 * revert of the add. `git subtree split` keeps such a commit as it is, so the commits behind it come
 * along, files and all. Bringing the folder back does not help, by a fresh add or by reverting the revert.
 *
 * What closes it is a rejoin's record on a commit whose shared/ equals the hub, because a split stops at
 * a record. shared:pull writes one when it lands such a commit and the split would stay open. So a pull
 * closes it, and a pull needs a hub commit this site lacks. Three things decide the line printed here:
 *
 *   behind                 the next pull closes it
 *   in sync                a new hub commit is needed first, from any other site
 *   ahead, diverged        this site's own change must reach the hub from another site, because a pull
 *                          here cannot equal the hub while it holds that change alone
 *
 * The record is not written on every pull. Two records that name one hub commit stop every later split
 * for good (`fatal: cache for <sha> already exists!`), and two checkouts of one site that each pull the
 * same commit and then merge would get there. An ordinary pull stays as it always was.
 *
 * HOW TO CHANGE IT
 *   A new way out: a case in closeLine. The words of the refusal are in CARRIED_REASON and leakDetails.
 */

import { PREFIX } from './settings.mjs';
import { STATES } from './state.mjs';

const PULL = 'npm run shared:pull';

/** How a commit without shared/ comes about, for the reader who did not mean to make one. */
const HOW_IT_HAPPENS = `It came from git rm -r ${PREFIX} or a revert of the add. A split keeps such a commit as it is, and the commits behind it come along.`;

/** The first line of the status check and of the refusal. */
export function carriedReason(count) {
  return `the split would carry ${count} of this site's own commits to the hub`;
}

/** Each commit without shared/ through `line`, which hides a subject with a private hit, then why. */
export function leakDetails(leaks, line) {
  return [...leaks.map(line), HOW_IT_HAPPENS];
}

/** The command that closes a split, for the state the site is in. */
export function closeLine({ state }) {
  switch (state) {
    case STATES.BEHIND:
    case STATES.PUSHED_NOT_REJOINED:
      return `${PULL}: its record closes this`;
    case STATES.IN_SYNC:
      return `publish any commit from another site, then ${PULL} here: its record closes this`;
    case STATES.AHEAD:
    case STATES.DIVERGED:
      return `make this site's ${PREFIX}/ change in another site and publish it there, then ${PULL} here: its record closes this`;
    default:
      return 'see the hub line first';
  }
}
