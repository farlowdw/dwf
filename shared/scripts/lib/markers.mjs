/**
 * scripts/lib/markers.mjs: finds conflict markers in text files. A marker committed into shared/ would
 * reach every site with the next push, so status reports them and push refuses them.
 *
 * HOW TO CHANGE IT
 *   CONFLICT_MARKER is the line shape. The lone `=======` line is left out on purpose: it is a Markdown
 *   heading underline as well, and the other two markers are always there with it.
 */

const CONFLICT_MARKER = /^(?:<{7}|>{7}) /;

/** Every marker in the texts, as 'path:line'. */
export function findConflictMarkers(texts) {
  const hits = [];
  for (const { path, text } of texts) {
    text.split('\n').forEach((line, index) => {
      if (CONFLICT_MARKER.test(line)) hits.push(`${path}:${index + 1}`);
    });
  }
  return hits;
}
