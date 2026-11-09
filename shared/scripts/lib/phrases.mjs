/**
 * scripts/lib/phrases.mjs: small pieces of wording that the messages of the scripts share.
 *
 * HOW TO CHANGE IT
 *   SHORT_SHA is how long a printed sha is. A new phrase is a small function here. PLAIN_WORD is what
 *   a printed command may hold without quotes. MAX_DETAILS is the longest list a check or a refusal prints. How a
 *   printed line reaches one site from its siblings: inSite.
 */

const SHORT_SHA = 7;

/** The longest list printed under a check or a refusal. The rest is counted on one line. */
export const MAX_DETAILS = 12;

/** A word fish and sh both read as it is: letters, digits and . / _ - only. */
export const PLAIN_WORD = /^[\w./-]+$/;

/** A sha cut to the length people read. */
export function short(sha) {
  return sha.slice(0, SHORT_SHA);
}

/** A list cut to MAX_DETAILS, saying how many were left out. */
export function capped(lines) {
  if (lines.length <= MAX_DETAILS) return lines;
  return [...lines.slice(0, MAX_DETAILS), `and ${lines.length - MAX_DETAILS} more`];
}

/** Words in a sentence: "a", "a and b", "a, b and c". */
export function listed(words) {
  if (words.length <= 1) return words.join('');
  return `${words.slice(0, -1).join(', ')} and ${words.at(-1)}`;
}

/** "1 commit", "3 commits" or "2 local copies". A count printed with its noun goes through here. */
export function counted(count, noun) {
  if (count === 1) return `1 ${noun}`;
  return noun.endsWith('y') ? `${count} ${noun.slice(0, -1)}ies` : `${count} ${noun}s`;
}

/**
 * A path or other word as a printed command must hold it, so that a paste works in fish and in sh: as it
 * is when plain, else in single quotes, with a quote inside written as '\'' (both shells read that).
 */
export function shellWord(word) {
  return PLAIN_WORD.test(word) ? word : `'${word.replaceAll("'", "'\\''")}'`;
}

/** One line to paste beside the site you ran from: it works from any sibling, this site included. */
export function inSite({ name }, steps) {
  return [`cd ${shellWord(`../${name}`)}`, ...steps].join(' && ');
}
