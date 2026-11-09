/**
 * scripts/lib/pinRange.mjs: a Docusaurus version against the ranges shared/requirements.cjs gives the @docusaurus
 * packages. `shared:all -- bump <version>` asks it before its one question, so a pin the shared pieces rule out
 * never reaches the hub, and `shared:bump` asks it before it changes anything, so a site is not installed and
 * built for a version its own shared:verify then fails on.
 *
 * One version moves every @docusaurus package, so the version has to sit inside every range the table gives one
 * of them, whichever pieces a site uses. A refusal names each range the version misses and the newest version
 * npm has inside all of them, or says that npm has none, or could not be asked. A table that is missing has no
 * range to miss. A table that does not load is refused with the way back, as every other reader does.
 *
 * HOW TO CHANGE IT
 *   The ranges live in shared/requirements.cjs, not here. The wording: outsideReason and newestSentence.
 */

import { isPinned, versionsOnNpm } from './pin.mjs';
import { listed } from './phrases.mjs';
import { refusal } from './preflight.mjs';
import { compareVersions, parseVersion, satisfiesAsNpm } from './range.mjs';
import { LOAD_UNDO, REQUIREMENTS_FILE, loadRequirements } from './requirements.mjs';
import { PREFIX } from './settings.mjs';

const TABLE_PATH = `${PREFIX}/${REQUIREMENTS_FILE}`;

/** The table's ranges for the packages one version moves: [{ name, range }], by name. */
export function docusaurusRanges(table) {
  const names = Object.keys(table.RANGES).filter(isPinned).sort();
  return names.map((name) => ({ name, range: table.RANGES[name] }));
}

/** The rows whose range does not take `version`, as npm would read it. */
export function rangesMissed(rows, version) {
  return rows.filter(({ range }) => !satisfiesAsNpm(version, range));
}

/** The newest of `versions` inside every row's range, or null when none is. */
export function newestInside(versions, rows) {
  const inside = versions.filter((version) => rows.every(({ range }) => satisfiesAsNpm(version, range)));
  const sorted = inside.sort((a, b) => compareVersions(parseVersion(a), parseVersion(b)));
  return sorted.at(-1) ?? null;
}

/** "^3.10.2 of @docusaurus/core and @docusaurus/theme-common": the rows grouped by their range. */
function rangesText(rows) {
  const byRange = new Map();
  for (const { name, range } of rows) byRange.set(range, [...(byRange.get(range) ?? []), name]);
  return listed([...byRange].map(([range, names]) => `${range} of ${listed(names)}`));
}

/** The distinct ranges of the rows, as words: "^3.10.2", or "^3.10.2 and ^3.9.0". */
function rangeWords(rows) {
  return listed([...new Set(rows.map(({ range }) => range))]);
}

/** What npm has inside every range, as a sentence. `versions` is null when npm gave no list. */
function newestSentence(versions, rows) {
  const ranges = rangeWords(rows);
  if (versions === null) return `npm could not be asked for the versions inside ${ranges}.`;
  const newest = newestInside(versions, rows);
  return newest === null ? `npm has no version inside ${ranges}.` : `The newest version npm has inside ${ranges} is ${newest}.`;
}

/** Why the version is refused, in full. */
function outsideReason({ version, missed, versions, rows, stays }) {
  const why = `Docusaurus ${version} is outside what ${TABLE_PATH} asks: ${rangesText(missed)}, so shared:verify would fail on it.`;
  return [why, newestSentence(versions, rows), stays].filter(Boolean).join(' ');
}

/**
 * Refuses a version outside the table's @docusaurus ranges, before anything changes. `stays` ends the reason,
 * such as "The pin stays at 3.10.2.", and `fix` is the Fix line. npm is asked only for a version refused.
 */
export function refuseOutsideRanges({ root, env = process.env, version, script, stays = '', fix }) {
  const table = loadRequirements(root);
  if (table === null) return;
  if (table.loadError) throw refusal(script, `${TABLE_PATH} does not load: ${table.loadError}.`, { fix: LOAD_UNDO });
  const rows = docusaurusRanges(table);
  const missed = rangesMissed(rows, version);
  if (missed.length === 0) return;
  const versions = versionsOnNpm({ root, env });
  throw refusal(script, outsideReason({ version, missed, versions, rows, stays }), { fix });
}
